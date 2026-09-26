import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { KpiSourceType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, type AuthUser } from "@/server/auth/session";
import { diffDays, fromDateKey, monthEnd, monthLabel, monthStart, toDateKey, todayKey } from "@/lib/dates";
import {
  aggregateScores,
  evaluateKpi,
  finalScore,
  methodConfigSchema,
  resolveRating,
  type KpiDefinition,
  type KpiInput,
} from "@/lib/kpi/engine";
import { num, round2 } from "@/lib/num";
import type { ProgressBreakdown } from "@/lib/notion/progress";
import { getCompanyFresh } from "./company";
import { notifyUsers } from "./notifications";
import { recomputePlan } from "./progress";

type SourceConfig = { category?: string | null; stageKey?: string | null; onTimeOnly?: boolean };

const breakdownOf = (v: unknown) => (v && typeof v === "object" ? (v as ProgressBreakdown) : null);

export async function activeRatingBands() {
  const scale =
    (await db.performanceRatingScale.findFirst({ where: { isActive: true }, include: { bands: { orderBy: { sortOrder: "asc" } } } })) ??
    (await db.performanceRatingScale.findFirst({ include: { bands: { orderBy: { sortOrder: "asc" } } } }));
  return (scale?.bands ?? []).map((b) => ({ label: b.label, minScore: num(b.minScore), maxScore: num(b.maxScore), color: b.color }));
}

/** KPIs applicable to a job title (job-specific rows override generic ones). */
export async function kpisForJobTitle(jobTitleId: string | null) {
  const rows = await db.kpi.findMany({
    where: { isActive: true, template: { isActive: true }, OR: [{ jobTitleId: null }, ...(jobTitleId ? [{ jobTitleId }] : [])] },
    include: { template: true },
    orderBy: [{ sortOrder: "asc" }],
  });
  const byTemplate = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const existing = byTemplate.get(r.templateId);
    if (!existing || (r.jobTitleId && !existing.jobTitleId)) byTemplate.set(r.templateId, r);
  }
  return [...byTemplate.values()];
}

interface EvalContext {
  employeeId: string;
  year: number;
  month: number;
  today: string;
  planSubmissionDeadlineDay: number;
  weeklyReportDueDays: number;
  plan: Prisma.MonthlyPlanGetPayload<{ include: { goals: true; weeklyPlans: { include: { report: true; goals: true } }; report: true } }> | null;
  adHoc: Prisma.AdHocTaskGetPayload<object>[];
  deadlineTasks: Prisma.DailyTaskGetPayload<object>[];
}

/** Resolve the measured value (and formula variables) for a KPI source. */
export function measureSource(sourceType: KpiSourceType, config: SourceConfig, ctx: EvalContext): KpiInput & { details: Record<string, unknown> } {
  const goals = (ctx.plan?.goals ?? []).filter((g) => g.status !== "CANCELLED");
  const monthEndKey = monthEnd(ctx.year, ctx.month);
  const cutoff = ctx.today < monthEndKey ? ctx.today : monthEndKey;

  const notionTotals = () => {
    const matching = goals.filter((g) => {
      const b = breakdownOf(g.breakdown);
      if (!b) return false;
      if (!config.stageKey) return true;
      return (g.notionFilter as { stageKey?: string } | null)?.stageKey === config.stageKey;
    });
    const sum = (k: keyof ProgressBreakdown) => matching.reduce((a, g) => a + Number(breakdownOf(g.breakdown)?.[k] ?? 0), 0);
    return {
      goals: matching.length,
      completed: sum("completed"),
      needsRevision: sum("needsRevision"),
      pendingApproval: sum("pendingApproval"),
      worked: sum("worked"),
      reworkCount: sum("reworkCount"),
    };
  };

  switch (sourceType) {
    case "GOALS": {
      const list = config.category ? goals.filter((g) => g.category === config.category) : goals;
      const weight = list.reduce((a, g) => a + num(g.weight), 0);
      const achieved =
        list.length === 0
          ? 0
          : weight > 0
            ? list.reduce((a, g) => a + Math.min(num(g.progressPct), 100) * num(g.weight), 0) / weight
            : list.reduce((a, g) => a + Math.min(num(g.progressPct), 100), 0) / list.length;
      return {
        achieved: round2(achieved),
        target: 100,
        vars: { count: list.length, total: goals.length },
        details: { goals: list.map((g) => ({ name: g.name, progress: num(g.progressPct), weight: num(g.weight) })) },
      };
    }
    case "NOTION_APPROVAL_RATE": {
      const t = notionTotals();
      const reviewed = t.completed + t.needsRevision;
      const rate = reviewed > 0 ? (t.completed / reviewed) * 100 : t.worked > 0 ? 0 : 100;
      return { achieved: round2(rate), vars: t, details: t };
    }
    case "NOTION_REVISION_RATE": {
      const t = notionTotals();
      const rate = t.worked > 0 ? (Math.max(t.reworkCount, t.needsRevision) / t.worked) * 100 : 0;
      return { achieved: round2(rate), vars: t, details: t };
    }
    case "NOTION_COUNT": {
      const t = notionTotals();
      return { achieved: t.completed, vars: t, details: t };
    }
    case "PLAN_SUBMISSION_DELAY": {
      const deadline = `${monthStart(ctx.year, ctx.month).slice(0, 8)}${String(ctx.planSubmissionDeadlineDay).padStart(2, "0")}`;
      const submitted = ctx.plan?.submittedAt ? toDateKey(ctx.plan.submittedAt) : null;
      const reference = submitted ?? cutoff;
      const daysLate = Math.max(0, diffDays(reference, deadline));
      return { achieved: daysLate, vars: { daysLate }, details: { deadline, submitted, daysLate } };
    }
    case "WEEKLY_PLANS_PREPARED": {
      const weeks = ctx.plan?.weeklyPlans ?? [];
      const prepared = weeks.filter((w) => w.status !== "DRAFT").length;
      return { achieved: prepared, target: weeks.length || 1, vars: { count: prepared, total: weeks.length }, details: { prepared, weeks: weeks.length } };
    }
    case "WEEKLY_REPORTS_SUBMITTED": {
      const weeks = (ctx.plan?.weeklyPlans ?? []).filter((w) => toDateKey(w.endDate) <= cutoff);
      const submitted = weeks.filter((w) => {
        const r = w.report;
        if (!r || !r.submittedAt) return false;
        if (!config.onTimeOnly) return true;
        return diffDays(toDateKey(r.submittedAt), toDateKey(w.endDate)) <= ctx.weeklyReportDueDays;
      }).length;
      return { achieved: submitted, target: weeks.length || 1, vars: { count: submitted, total: weeks.length }, details: { submitted, due: weeks.length } };
    }
    case "MONTHLY_REPORT_SUBMITTED": {
      const done = ctx.plan?.report?.submittedAt ? 1 : 0;
      return { achieved: done, target: 1, details: { submitted: !!done } };
    }
    case "AD_HOC_COMPLETION": {
      const list = ctx.adHoc.filter((t) => t.includeInEvaluation && t.status !== "CANCELLED");
      if (list.length === 0) return { achieved: 100, target: 100, vars: { count: 0, total: 0 }, details: { note: "لا توجد تكليفات" } };
      // weighted by task weight (1 when unset); unfinished tasks earn half credit for their progress
      const w = (t: (typeof list)[number]) => num(t.weight) || 1;
      const weightSum = list.reduce((a, t) => a + w(t), 0);
      const done = list.reduce((a, t) => a + (t.status === "COMPLETED" ? w(t) : (w(t) * t.progress * 0.5) / 100), 0);
      const rate = (done / weightSum) * 100;
      return {
        achieved: round2(rate),
        target: 100,
        vars: { count: list.filter((t) => t.status === "COMPLETED").length, total: list.length },
        details: { tasks: list.map((t) => ({ title: t.title, status: t.status })) },
      };
    }
    case "DEADLINE_COMMITMENT": {
      const items = [
        ...ctx.deadlineTasks.map((t) => ({ due: toDateKey(t.deadline!), done: t.completedAt ? toDateKey(t.completedAt) : null, status: t.status })),
        ...ctx.adHoc.filter((t) => t.dueDate).map((t) => ({ due: toDateKey(t.dueDate!), done: t.completedAt ? toDateKey(t.completedAt) : null, status: t.status })),
      ].filter((t) => t.status !== "CANCELLED" && t.due <= cutoff);
      if (items.length === 0) return { achieved: 100, target: 100, vars: { daysLate: 0, count: 0, total: 0 }, details: { note: "لا توجد مهام بمواعيد تسليم" } };
      // unfinished items keep accruing lateness until the cutoff day
      const lateness = items.map((t) => Math.max(0, diffDays(t.done ?? cutoff, t.due)));
      const onTimeCount = items.filter((t, i) => t.done && lateness[i] === 0).length;
      const avgLate = lateness.reduce((a, b) => a + b, 0) / lateness.length;
      return {
        achieved: round2((onTimeCount / items.length) * 100),
        target: 100,
        vars: { daysLate: round2(avgLate), count: onTimeCount, total: items.length },
        details: { onTime: onTimeCount, total: items.length, avgDaysLate: round2(avgLate) },
      };
    }
    case "MANUAL":
    default:
      return { achieved: 0, details: {} };
  }
}

async function loadContext(employeeId: string, year: number, month: number): Promise<EvalContext> {
  const company = await getCompanyFresh();
  const from = fromDateKey(monthStart(year, month));
  const to = fromDateKey(monthEnd(year, month));
  const plan = await db.monthlyPlan.findUnique({
    where: { employeeId_year_month: { employeeId, year, month } },
    include: { goals: true, weeklyPlans: { include: { report: true, goals: true } }, report: true },
  });
  const [adHoc, deadlineTasks] = await Promise.all([
    db.adHocTask.findMany({ where: { employeeId, OR: [{ assignedDate: { gte: from, lte: to } }, { dueDate: { gte: from, lte: to } }] } }),
    db.dailyTask.findMany({ where: { employeeId, deadline: { gte: from, lte: to }, source: "MANUAL" } }),
  ]);
  return {
    employeeId,
    year,
    month,
    today: todayKey(company.timezone),
    planSubmissionDeadlineDay: company.planSubmissionDeadlineDay,
    weeklyReportDueDays: company.weeklyReportDueDays,
    plan,
    adHoc,
    deadlineTasks,
  };
}

/**
 * (Re)calculate the monthly review. Manual overrides and manager adjustments
 * are preserved so recalculation never silently discards human decisions.
 */
export async function calculateReview(user: AuthUser | null, employeeId: string, year: number, month: number) {
  if (user) assertEmployeeAccess(user, employeeId);
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const existing = await db.performanceReview.findUnique({
    where: { employeeId_year_month: { employeeId, year, month } },
    include: { results: true },
  });
  if (existing && ["APPROVED", "ACKNOWLEDGED"].includes(existing.status)) throw new UserError("التقييم معتمد ولا يمكن إعادة حسابه");

  const planRow = await db.monthlyPlan.findUnique({ where: { employeeId_year_month: { employeeId, year, month } }, select: { id: true } });
  if (planRow) await recomputePlan(planRow.id);
  const ctx = await loadContext(employeeId, year, month);
  const kpis = await kpisForJobTitle(employee.jobTitleId);
  if (kpis.length === 0) throw new UserError("لا توجد مؤشرات أداء مرتبطة بوظيفة هذا الموظف — أضفها من إعدادات مؤشرات الأداء");

  const prevByTemplate = new Map((existing?.results ?? []).map((r) => [r.templateId, r]));
  const results = kpis.map((k) => {
    const t = k.template;
    const cfg = methodConfigSchema.safeParse(t.methodConfig ?? {});
    const def: KpiDefinition = {
      templateId: t.id,
      kpiId: k.id,
      code: t.code,
      name: t.name,
      category: t.category,
      unit: t.unit,
      target: k.target !== null ? num(k.target) : num(t.defaultTarget),
      weight: num(k.weight),
      method: t.calculationMethod,
      methodConfig: cfg.success ? cfg.data : null,
      maxScore: num(t.maxScore),
      isAutomatic: t.isAutomatic && t.sourceType !== "MANUAL",
    };
    const measured = measureSource(t.sourceType, (t.sourceConfig ?? {}) as SourceConfig, ctx);
    const prev = prevByTemplate.get(t.id);
    const manualScore = prev && (prev.isOverridden || t.calculationMethod === "MANUAL") ? num(prev.score) : null;
    // for count-style sources (e.g. weekly reports) the measured target wins over the static target
    const useMeasuredTarget = ["WEEKLY_PLANS_PREPARED", "WEEKLY_REPORTS_SUBMITTED", "MONTHLY_REPORT_SUBMITTED"].includes(t.sourceType);
    const evaluation = evaluateKpi(def, {
      achieved: measured.achieved,
      target: useMeasuredTarget ? measured.target : def.target,
      vars: measured.vars,
      manualScore,
    });
    return { def, evaluation, details: measured.details, prev };
  });

  const totals = aggregateScores(
    results.map((r) => ({ category: r.def.category, weight: r.def.weight, achievementRate: r.evaluation.achievementRate, weightedScore: r.evaluation.weightedScore })),
  );
  const adjustment = num(existing?.managerAdjustment);
  const final = finalScore(totals.autoScore, adjustment);
  const band = resolveRating(final, await activeRatingBands());

  const review = await db.$transaction(async (tx) => {
    const r = await tx.performanceReview.upsert({
      where: { employeeId_year_month: { employeeId, year, month } },
      create: {
        employeeId,
        year,
        month,
        monthlyPlanId: ctx.plan?.id ?? null,
        status: "CALCULATED",
        autoScore: totals.autoScore,
        finalScore: final,
        productivityScore: totals.productivityScore,
        qualityScore: totals.qualityScore,
        ratingLabel: band?.label ?? null,
        ratingColor: band?.color ?? null,
        calculatedAt: new Date(),
      },
      update: {
        monthlyPlanId: ctx.plan?.id ?? null,
        status: existing?.status === "MANAGER_REVIEW" ? "MANAGER_REVIEW" : "CALCULATED",
        autoScore: totals.autoScore,
        finalScore: final,
        productivityScore: totals.productivityScore,
        qualityScore: totals.qualityScore,
        ratingLabel: band?.label ?? null,
        ratingColor: band?.color ?? null,
        calculatedAt: new Date(),
      },
    });
    await tx.kpiResult.deleteMany({ where: { reviewId: r.id } });
    await tx.kpiResult.createMany({
      data: results.map((x) => ({
        reviewId: r.id,
        kpiId: x.def.kpiId ?? null,
        templateId: x.def.templateId,
        name: x.def.name,
        category: x.def.category,
        unit: x.def.unit,
        target: x.evaluation.target,
        achieved: x.evaluation.achieved,
        achievementRate: x.evaluation.achievementRate,
        score: x.evaluation.score,
        maxScore: x.def.maxScore,
        weight: x.def.weight,
        weightedScore: x.evaluation.weightedScore,
        isAutomatic: x.def.isAutomatic,
        isOverridden: x.prev?.isOverridden ?? false,
        overrideReason: x.prev?.overrideReason ?? null,
        details: x.details as Prisma.InputJsonValue,
      })),
    });
    return r;
  });
  if (user) await audit({ user, action: "review.calculate", entityType: "PerformanceReview", entityId: review.id, after: { autoScore: totals.autoScore, final } });
  return review;
}

/** Re-aggregate totals from stored results (after an override). */
async function refreshTotals(reviewId: string) {
  const review = await db.performanceReview.findUniqueOrThrow({ where: { id: reviewId }, include: { results: true } });
  const totals = aggregateScores(
    review.results.map((r) => ({ category: r.category, weight: num(r.weight), achievementRate: num(r.achievementRate), weightedScore: num(r.weightedScore) })),
  );
  const final = finalScore(totals.autoScore, num(review.managerAdjustment));
  const band = resolveRating(final, await activeRatingBands());
  return db.performanceReview.update({
    where: { id: reviewId },
    data: {
      autoScore: totals.autoScore,
      productivityScore: totals.productivityScore,
      qualityScore: totals.qualityScore,
      finalScore: final,
      ratingLabel: band?.label ?? null,
      ratingColor: band?.color ?? null,
    },
  });
}

export async function overrideKpiResult(user: AuthUser, resultId: string, score: number | null, reason: string) {
  const result = await db.kpiResult.findUniqueOrThrow({ where: { id: resultId }, include: { review: true, template: true } });
  assertEmployeeAccess(user, result.review.employeeId);
  if (["APPROVED", "ACKNOWLEDGED"].includes(result.review.status)) throw new UserError("التقييم معتمد");
  const maxScore = num(result.maxScore);
  if (score !== null && score > maxScore) throw new UserError(`الدرجة لا تتجاوز ${maxScore}`);
  let data: Prisma.KpiResultUpdateInput;
  if (score === null) {
    data = { isOverridden: false, overrideReason: null };
  } else {
    const rate = maxScore > 0 ? (score / maxScore) * 100 : 0;
    data = {
      score,
      achievementRate: round2(rate),
      weightedScore: round2((rate / 100) * num(result.weight)),
      isOverridden: true,
      overrideReason: reason,
    };
  }
  await db.kpiResult.update({ where: { id: resultId }, data });
  await audit({
    user,
    action: "kpi_result.override",
    entityType: "KpiResult",
    entityId: resultId,
    before: { score: num(result.score), rate: num(result.achievementRate) },
    after: { score },
    reason,
  });
  if (score === null) {
    // restore the automatic value by recalculating
    await calculateReview(user, result.review.employeeId, result.review.year, result.review.month);
  } else {
    await refreshTotals(result.reviewId);
  }
}

export async function adjustReview(
  user: AuthUser,
  reviewId: string,
  input: { adjustment: number; reason: string; managerNotes: string | null; strengths: string | null; improvements: string | null },
) {
  const review = await db.performanceReview.findUniqueOrThrow({ where: { id: reviewId } });
  assertEmployeeAccess(user, review.employeeId);
  if (["APPROVED", "ACKNOWLEDGED"].includes(review.status)) throw new UserError("التقييم معتمد");
  const final = finalScore(num(review.autoScore), input.adjustment);
  const band = resolveRating(final, await activeRatingBands());
  const updated = await db.performanceReview.update({
    where: { id: reviewId },
    data: {
      managerAdjustment: input.adjustment,
      adjustmentReason: input.adjustment !== 0 ? input.reason : null,
      finalScore: final,
      ratingLabel: band?.label ?? null,
      ratingColor: band?.color ?? null,
      managerNotes: input.managerNotes,
      strengths: input.strengths,
      improvements: input.improvements,
      status: "MANAGER_REVIEW",
    },
  });
  if (num(review.managerAdjustment) !== input.adjustment) {
    await audit({
      user,
      action: "review.adjust",
      entityType: "PerformanceReview",
      entityId: reviewId,
      before: { managerAdjustment: num(review.managerAdjustment), finalScore: num(review.finalScore) },
      after: { managerAdjustment: input.adjustment, finalScore: final },
      reason: input.reason,
    });
  }
  return updated;
}

export async function approveReview(user: AuthUser, reviewId: string) {
  const review = await db.performanceReview.findUniqueOrThrow({ where: { id: reviewId }, include: { employee: true } });
  assertEmployeeAccess(user, review.employeeId);
  if (review.employeeId === user.employeeId) throw new UserError("لا يمكنك اعتماد تقييمك الشخصي");
  if (!["CALCULATED", "MANAGER_REVIEW"].includes(review.status)) throw new UserError("احسب التقييم أولًا");
  await db.performanceReview.update({ where: { id: reviewId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id } });
  await audit({ user, action: "review.approve", entityType: "PerformanceReview", entityId: reviewId, after: { finalScore: num(review.finalScore), rating: review.ratingLabel } });
  await notifyUsers([review.employee.userId], {
    type: "REVIEW_APPROVED",
    title: `تم اعتماد تقييمك لشهر ${monthLabel(review.year, review.month)}`,
    body: `النتيجة النهائية ${num(review.finalScore)} — ${review.ratingLabel ?? ""}`,
    link: "/my-performance",
  });
}

export async function acknowledgeReview(user: AuthUser, reviewId: string) {
  const review = await db.performanceReview.findUniqueOrThrow({ where: { id: reviewId } });
  if (review.employeeId !== user.employeeId) throw new UserError("غير مسموح");
  if (review.status !== "APPROVED") throw new UserError("التقييم غير معتمد بعد");
  await db.performanceReview.update({ where: { id: reviewId }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() } });
}
