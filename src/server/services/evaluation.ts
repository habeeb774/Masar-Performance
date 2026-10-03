import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/user-error";
import { assertEmployeeAccess, employeeWhere, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { addDays, diffDays, fromDateKey, monthEnd, monthStart, toDateKey, todayKey, type DateKey } from "@/lib/dates";
import { resolveExecutionPeriod } from "@/lib/execution-period";
import { getRatingLabel, scoreEvaluation, timelinessMark, TIMELINESS_FULL_MARK, validateEvaluation, type DutyInput } from "@/lib/evaluation";
import { num } from "@/lib/num";
import { getCompanyFresh } from "./company";

/**
 * The official monthly evaluation (the manager's Excel model): 4 weighted duties, each made of
 * weighted indicators. A layer on top of the work plan — plans, goals and reports are only read.
 * Automatic values come from the plan, reports, goals and ad-hoc tasks; every manual change
 * is audited and survives a refresh.
 */

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
//  Default template — «قالب مسؤول المنتجات والتصاميم» from the manager's sheet
// ---------------------------------------------------------------------------

const ON_TIME = "في أول يوم درجة كاملة 5 وعلى كل يوم تأخير خصم درجة من 5";
const DONE = "إنجاز المهمة المكلّف بها بالكامل وفق المطلوب.";

export const DEFAULT_TEMPLATE = {
  name: "قالب تقييم مسؤول المنتجات والتصاميم",
  jobTitleName: "مسؤول المنتجات والتصاميم",
  duties: [
    {
      title: "الواجب الأول: الالتزام بسلوكيات وآليات العمل.",
      kind: "COMMITMENT",
      weight: 20,
      indicators: [
        { title: "إعداد خطة الشهر.", description: "تسليم الخطة بشكلها النهائي في اليوم المخصص.", notes: ON_TIME, target: TIMELINESS_FULL_MARK, weight: 25, sourceType: "MONTHLY_PLAN" },
        { title: "إعداد الخطط الأسبوعية في وقتها المخصص بدقة.", description: "عدد الخطط التي تم إنجازها في موعدها من إجمالي الخطط المطلوبة خلال الشهر.", target: 0, weight: 25, sourceType: "WEEKLY_PLAN" },
        { title: "كتابة التقارير الأسبوعية في وقتها المخصص بدقة.", description: "عدد التقارير التي تم إنجازها في موعدها من إجمالي التقارير المطلوبة خلال الشهر.", target: 0, weight: 25, sourceType: "WEEKLY_REPORT" },
        { title: "كتابة التقارير الشهرية في وقتها المخصص بدقة.", description: "التزام الموظف بكتابة التقرير في اليوم المخصص وتسليمه بالمعايير المطلوبة والمحددة مسبقاً.", notes: ON_TIME, target: TIMELINESS_FULL_MARK, weight: 25, sourceType: "MONTHLY_REPORT" },
      ],
    },
    {
      title: "الواجب الثاني: إضافة وتعديل المنتجات في المتجر",
      kind: "GOALS",
      weight: 25,
      indicators: [
        { title: "إضافة المنتجات الجديدة للمتجر", description: "عدد المنتجات التي تم إدخالها للمتجر من إجمالي العدد المستهدف.", target: 0, weight: 50, sourceType: "MONTHLY_GOAL", sourceConfig: { goalNameIncludes: ["إضافة منتجات", "إضافة المنتجات"] } },
        { title: "تعديل المنتجات الموجودة في المتجر", description: "عدد المنتجات التي تم تعديلها في المتجر من إجمالي العدد المستهدف.", target: 0, weight: 50, sourceType: "MONTHLY_GOAL", sourceConfig: { goalNameIncludes: ["تعديل المنتجات", "تعديل منتجات", "المنتجات الموجودة"] } },
      ],
    },
    {
      title: "الواجب الثالث: التعديل وتطوير واجهة ومظهر المتجر",
      kind: "GOALS",
      weight: 20,
      indicators: [
        { title: "ربط المنتجات بمقاطع الانستقرام في المتجر", description: "عدد المقاطع التي تم ربطها بالمنتجات من إجمالي المقاطع التي تم نشرها.", target: 0, weight: 100, sourceType: "MONTHLY_GOAL", sourceConfig: { goalNameIncludes: ["Instagram", "الانستقرام", "انستقرام"] } },
        { title: "تصميم صور المقالات وتعديلها على المتجر", description: "عدد المقالات التي تم تصميم صورها وتعديلها.", target: 0, weight: 0, sourceType: "MONTHLY_GOAL", sourceConfig: { goalNameIncludes: ["مقالات"] } },
        { title: "تصميم بنرات جديدة للمتجر", description: "عدد البنرات الجديدة المنجزة.", target: 0, weight: 0, sourceType: "MONTHLY_GOAL", sourceConfig: { goalNameIncludes: ["بنرات جديدة"] } },
      ],
    },
    { title: "الواجب الرابع: مهام مستجدة كُلّف بها خلال الشهر", kind: "AD_HOC", weight: 35, indicators: [] },
  ],
} as const;

/** The default template, created once (idempotent) — also how production gets it without a seed. */
const defaultDutiesCreate = () =>
  DEFAULT_TEMPLATE.duties.map((d, di) => ({
    title: d.title,
    kind: d.kind,
    weight: d.weight,
    sortOrder: di,
    indicators: {
      create: d.indicators.map((x, ii) => ({
        title: x.title,
        description: x.description,
        notes: "notes" in x ? x.notes : null,
        target: x.target,
        weight: x.weight,
        sourceType: x.sourceType,
        sourceConfig: "sourceConfig" in x ? (x.sourceConfig as unknown as Prisma.InputJsonValue) : undefined,
        sortOrder: ii,
      })),
    },
  }));

/**
 * Keep the code-owned default template aligned with the currently approved HR model.
 * Existing monthly evaluations are snapshots and are never rewritten here.
 */
export async function ensureDefaultEvaluationTemplate(tx: Tx | typeof db = db) {
  const existing = await tx.evaluationTemplate.findFirst({
    where: { name: DEFAULT_TEMPLATE.name },
    include: { duties: { orderBy: { sortOrder: "asc" }, include: { indicators: { orderBy: { sortOrder: "asc" } } } } },
  });
  const jobTitle = await tx.jobTitle.findFirst({ where: { name: DEFAULT_TEMPLATE.jobTitleName } });

  if (!existing) {
    return tx.evaluationTemplate.create({
      data: {
        name: DEFAULT_TEMPLATE.name,
        jobTitleId: jobTitle?.id ?? null,
        duties: { create: defaultDutiesCreate() },
      },
    });
  }

  const current = existing.duties.map((d) => ({
    title: d.title,
    kind: d.kind,
    weight: num(d.weight),
    indicators: d.indicators.map((i) => ({ title: i.title, weight: num(i.weight), sourceType: i.sourceType })),
  }));
  const official = DEFAULT_TEMPLATE.duties.map((d) => ({
    title: d.title,
    kind: d.kind,
    weight: d.weight,
    indicators: d.indicators.map((i) => ({ title: i.title, weight: i.weight, sourceType: i.sourceType })),
  }));

  if (JSON.stringify(current) === JSON.stringify(official)) return existing;

  return tx.evaluationTemplate.update({
    where: { id: existing.id },
    data: {
      jobTitleId: existing.jobTitleId ?? jobTitle?.id ?? null,
      duties: { deleteMany: {}, create: defaultDutiesCreate() },
    },
  });
}

async function templateFor(jobTitleId: string | null) {
  await ensureDefaultEvaluationTemplate();
  const include = { duties: { orderBy: { sortOrder: "asc" as const }, include: { indicators: { orderBy: { sortOrder: "asc" as const } } } } };
  return (
    (jobTitleId ? await db.evaluationTemplate.findFirst({ where: { jobTitleId, isActive: true }, include, orderBy: { updatedAt: "desc" } }) : null) ??
    (await db.evaluationTemplate.findFirstOrThrow({ where: { name: DEFAULT_TEMPLATE.name }, include }))
  );
}

// ---------------------------------------------------------------------------
//  Automatic values
// ---------------------------------------------------------------------------

const dayOf = (d: Date, tz: string) => todayKey(tz, d);
const goalMatches = (name: string, config: unknown) => {
  const words = (config as { goalNameIncludes?: string[] } | null)?.goalNameIncludes ?? [];
  return words.some((w) => name.toLowerCase().includes(w.toLowerCase()));
};

type Measured = { achieved: number; target: number; notes?: string | null; sourceId?: string | null };

interface Context {
  tz: string;
  reportDueDays: number;
  start: DateKey;
  end: DateKey;
  plan: Awaited<ReturnType<typeof loadPlan>>;
}

const loadPlan = (planId: string | null) =>
  planId
    ? db.monthlyPlan.findUnique({
        where: { id: planId },
        include: { goals: { orderBy: { sortOrder: "asc" } }, report: true, weeklyPlans: { include: { report: true }, orderBy: { weekIndex: "asc" } } },
      })
    : Promise.resolve(null);

/** Duty 1 sources and goal-fed indicators. */
function measure(sourceType: string, sourceConfig: unknown, ctx: Context): Measured | null {
  const plan = ctx.plan;
  switch (sourceType) {
    case "MONTHLY_PLAN": {
      if (!plan) return { achieved: 0, target: TIMELINESS_FULL_MARK, notes: "لا توجد خطة شهرية لهذه الفترة" };
      const sent = plan.submittedAt ?? plan.approvedAt;
      const late = sent ? diffDays(dayOf(sent, ctx.tz), ctx.start) : null;
      return { achieved: timelinessMark(late), target: TIMELINESS_FULL_MARK, sourceId: plan.id, notes: sent ? (late! > 0 ? `سُلمت متأخرة ${late} يوم` : "سُلمت في موعدها") : "لا يوجد تاريخ تسليم مسجل للخطة" };
    }
    case "WEEKLY_PLAN": {
      const weeks = plan?.weeklyPlans ?? [];
      return { achieved: weeks.filter((w) => w.status !== "DRAFT").length, target: weeks.length, notes: weeks.length ? null : "لا توجد خطط أسبوعية" };
    }
    case "WEEKLY_REPORT": {
      const weeks = plan?.weeklyPlans ?? [];
      const onTime = weeks.filter((w) => w.report?.submittedAt && dayOf(w.report.submittedAt, ctx.tz) <= addDays(toDateKey(w.endDate), ctx.reportDueDays)).length;
      return { achieved: onTime, target: weeks.length };
    }
    case "MONTHLY_REPORT": {
      const sent = plan?.report?.submittedAt ?? null;
      const late = sent ? diffDays(dayOf(sent, ctx.tz), addDays(ctx.end, ctx.reportDueDays)) : null;
      return { achieved: timelinessMark(late), target: TIMELINESS_FULL_MARK, sourceId: plan?.report?.id ?? null, notes: sent ? (late! > 0 ? `سُلم متأخرًا ${late} يوم` : "سُلم في موعده") : "لم يُرسل التقرير الشهري بعد" };
    }
    case "MONTHLY_GOAL": {
      const goal = plan?.goals.find((g) => g.status !== "CANCELLED" && goalMatches(g.name, sourceConfig));
      if (!goal) return null;
      return { achieved: num(goal.achievedValue), target: num(goal.targetValue), sourceId: goal.id };
    }
    default:
      return null;
  }
}

async function context(evaluation: { monthlyPlanId: string | null; periodStart: Date; periodEnd: Date }): Promise<Context> {
  const company = await getCompanyFresh();
  return { tz: company.timezone, reportDueDays: company.weeklyReportDueDays, start: toDateKey(evaluation.periodStart), end: toDateKey(evaluation.periodEnd), plan: await loadPlan(evaluation.monthlyPlanId) };
}

const adHocTasksFor = (employeeId: string, start: DateKey, end: DateKey) =>
  db.adHocTask.findMany({ where: { employeeId, includeInEvaluation: true, assignedDate: { gte: fromDateKey(start), lte: fromDateKey(end) } }, orderBy: { assignedDate: "asc" } });

// ---------------------------------------------------------------------------
//  Recalculation
// ---------------------------------------------------------------------------

const evaluationInclude = {
  employee: { select: { id: true, fullName: true, jobTitle: { select: { name: true } }, department: { select: { name: true } } } },
  duties: { orderBy: { sortOrder: "asc" as const }, include: { indicators: { orderBy: { sortOrder: "asc" as const } } } },
} satisfies Prisma.PerformanceEvaluationInclude;

export type EvaluationDetail = Prisma.PerformanceEvaluationGetPayload<{ include: typeof evaluationInclude }>;

export function toDutyInputs(e: Pick<EvaluationDetail, "duties">): DutyInput[] {
  return e.duties.map((d) => ({ title: d.title, weight: num(d.weight), indicators: d.indicators.map((i) => ({ title: i.title, achieved: num(i.achieved), target: num(i.target), weight: num(i.weight) })) }));
}

/** Store every indicator / duty / final score from the current inputs (no data is pulled here). */
async function recalculate(tx: Tx, evaluationId: string) {
  const e = await tx.performanceEvaluation.findUniqueOrThrow({ where: { id: evaluationId }, include: evaluationInclude });
  const result = scoreEvaluation(toDutyInputs(e), { capAt100: e.capAt100 });
  for (const [di, d] of e.duties.entries()) {
    await tx.evaluationDuty.update({ where: { id: d.id }, data: { score: result.duties[di].score } });
    for (const [ii, ind] of d.indicators.entries()) {
      const s = result.duties[di].indicators[ii];
      await tx.evaluationIndicator.update({ where: { id: ind.id }, data: { score: s.score, weightedScore: s.weightedScore } });
    }
  }
  const final = e.overrideScore !== null ? num(e.overrideScore) : result.finalScore;
  await tx.performanceEvaluation.update({ where: { id: evaluationId }, data: { computedScore: result.finalScore, finalScore: final, ratingLabel: getRatingLabel(final) } });
}

/** Pull automatic values (plan, reports, goals, ad-hoc tasks) into indicators the manager has not changed. */
async function pullAutomatic(tx: Tx, evaluationId: string) {
  const e = await tx.performanceEvaluation.findUniqueOrThrow({ where: { id: evaluationId }, include: evaluationInclude });
  const ctx = await context(e);
  const template = e.templateId ? await tx.evaluationTemplate.findUnique({ where: { id: e.templateId }, include: { duties: { include: { indicators: true } } } }) : null;
  const configOf = (title: string) => template?.duties.flatMap((d) => d.indicators).find((i) => i.title === title)?.sourceConfig ?? null;

  for (const duty of e.duties) {
    const goalIndicators = duty.indicators.filter((ind) => !ind.isOverridden && ind.sourceType === "MONTHLY_GOAL");
    if (goalIndicators.length > 0) {
      const measured = goalIndicators.map((ind) => ({ ind, m: measure(ind.sourceType, configOf(ind.title), ctx) }));
      const active = measured.filter((x) => x.m);
      const templateWeights = active.map(({ ind }) => {
        const source = template?.duties.flatMap((d) => d.indicators).find((i) => i.title === ind.title);
        return source ? num(source.weight) : num(ind.weight);
      });
      const baseSum = templateWeights.reduce((a, b) => a + Math.max(0, b), 0);
      for (const { ind, m } of measured) {
        if (!m) {
          await tx.evaluationIndicator.update({ where: { id: ind.id }, data: { achieved: 0, target: 0, weight: 0, sourceId: null } });
          continue;
        }
        const activeIndex = active.findIndex((x) => x.ind.id === ind.id);
        const base = Math.max(0, templateWeights[activeIndex] ?? 0);
        const normalizedWeight = baseSum > 0 ? (base / baseSum) * 100 : 100 / active.length;
        await tx.evaluationIndicator.update({
          where: { id: ind.id },
          data: { achieved: m.achieved, target: m.target, weight: normalizedWeight, sourceId: m.sourceId ?? ind.sourceId, ...(m.notes !== undefined && !ind.notes ? { notes: m.notes } : {}) },
        });
      }
    }

    for (const ind of duty.indicators) {
      if (ind.isOverridden || ind.sourceType === "MANUAL" || ind.sourceType === "AD_HOC_TASK" || ind.sourceType === "MONTHLY_GOAL") continue;
      const m = measure(ind.sourceType, configOf(ind.title), ctx);
      if (!m) continue;
      await tx.evaluationIndicator.update({ where: { id: ind.id }, data: { achieved: m.achieved, target: m.target, sourceId: m.sourceId ?? ind.sourceId, ...(m.notes !== undefined && !ind.notes ? { notes: m.notes } : {}) } });
    }

    if (duty.kind !== "AD_HOC") continue;
    // Duty 4: explicit task weights are respected; unweighted tasks share the remaining weight automatically.
    const tasks = await adHocTasksFor(e.employeeId, ctx.start, ctx.end);
    const explicit = tasks.reduce((sum, t) => sum + Math.max(0, num(t.weight)), 0);
    const unweighted = tasks.filter((t) => num(t.weight) <= 0);
    const remaining = Math.max(0, 100 - explicit);
    const automaticWeight = unweighted.length > 0 ? remaining / unweighted.length : 0;
    const resolvedWeight = (task: (typeof tasks)[number]) => (num(task.weight) > 0 ? num(task.weight) : automaticWeight);

    const linked = new Map(duty.indicators.filter((i) => i.sourceType === "AD_HOC_TASK" && i.sourceId).map((i) => [i.sourceId!, i]));
    let order = duty.indicators.length;
    for (const t of tasks) {
      const done = t.status === "COMPLETED" ? 1 : 0;
      const existing = linked.get(t.id);
      if (existing) {
        if (!existing.isOverridden) await tx.evaluationIndicator.update({ where: { id: existing.id }, data: { title: t.title, achieved: done, target: 1, weight: resolvedWeight(t) } });
        continue;
      }
      await tx.evaluationIndicator.create({ data: { dutyId: duty.id, title: t.title, description: DONE, achieved: done, target: 1, weight: resolvedWeight(t), sourceType: "AD_HOC_TASK", sourceId: t.id, sortOrder: order++ } });
    }
  }
}

// ---------------------------------------------------------------------------
//  Commands
// ---------------------------------------------------------------------------

const canEdit = (user: AuthUser) => hasPermission(user, PERMISSIONS.PERFORMANCE_REVIEW);
const canApprove = (user: AuthUser) => hasPermission(user, PERMISSIONS.PERFORMANCE_APPROVE);

async function loadForEdit(user: AuthUser, evaluationId: string) {
  if (!canEdit(user)) throw new UserError("إعداد التقييمات من صلاحيات المدير");
  const e = await db.performanceEvaluation.findUnique({ where: { id: evaluationId } });
  if (!e) throw new UserError("التقييم غير موجود");
  assertEmployeeAccess(user, e.employeeId);
  if (e.status === "APPROVED") throw new UserError("التقييم معتمد — أعد فتحه للتعديل");
  return e;
}

/**
 * Create the month's evaluation from the employee's template (or return the existing one).
 * The period follows the plan's execution period; values are pulled from plan, reports,
 * goals and ad-hoc tasks.
 */
export async function createEvaluation(user: AuthUser | null, employeeId: string, year: number, month: number) {
  if (user) {
    if (!canEdit(user)) throw new UserError("إعداد التقييمات من صلاحيات المدير");
    assertEmployeeAccess(user, employeeId);
  }
  const existing = await db.performanceEvaluation.findUnique({ where: { employeeId_year_month: { employeeId, year, month } } });
  if (existing) return existing;
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { jobTitleId: true } });
  const template = await templateFor(employee.jobTitleId);
  const plan = await db.monthlyPlan.findUnique({ where: { employeeId_year_month: { employeeId, year, month } }, include: { weeklyPlans: { select: { startDate: true, endDate: true } } } });
  const span = plan ? resolveExecutionPeriod(plan) : { start: monthStart(year, month), end: monthEnd(year, month) };

  return db.$transaction(async (tx) => {
    const created = await tx.performanceEvaluation.create({
      data: {
        employeeId,
        year,
        month,
        monthlyPlanId: plan?.id ?? null,
        templateId: template.id,
        capAt100: template.capAt100,
        periodStart: fromDateKey(span.start),
        periodEnd: fromDateKey(span.end),
        createdById: user?.id ?? null,
        duties: {
          create: template.duties.map((d) => ({
            title: d.title,
            kind: d.kind,
            weight: d.weight,
            sortOrder: d.sortOrder,
            indicators: {
              create: d.indicators.map((i) => ({ title: i.title, description: i.description, notes: i.notes, target: i.target, weight: i.weight, sourceType: i.sourceType, sortOrder: i.sortOrder })),
            },
          })),
        },
      },
    });
    await pullAutomatic(tx, created.id);
    await recalculate(tx, created.id);
    await audit({ user, action: "evaluation.create", entityType: "PerformanceEvaluation", entityId: created.id, after: { employeeId, year, month, templateId: template.id, monthlyPlanId: plan?.id ?? null } }, tx);
    return created;
  }, { timeout: 60_000 });
}

/** Re-pull automatic values (manager changes are kept) and recompute. */
export async function refreshEvaluation(user: AuthUser, evaluationId: string) {
  await loadForEdit(user, evaluationId);
  await db.$transaction(async (tx) => {
    await pullAutomatic(tx, evaluationId);
    await recalculate(tx, evaluationId);
  }, { timeout: 60_000 });
}

export interface IndicatorPatch {
  title?: string;
  description?: string | null;
  notes?: string | null;
  achieved?: number;
  target?: number;
  weight?: number;
}

/** Manual edit of an indicator — audited (before / after / reason); an edited automatic value is kept on refresh. */
export async function updateIndicator(user: AuthUser, indicatorId: string, patch: IndicatorPatch, reason: string | null) {
  const before = await db.evaluationIndicator.findUnique({ where: { id: indicatorId }, include: { duty: { select: { evaluationId: true } } } });
  if (!before) throw new UserError("المؤشر غير موجود");
  await loadForEdit(user, before.duty.evaluationId);
  for (const k of ["achieved", "target", "weight"] as const) if (patch[k] !== undefined && (!Number.isFinite(patch[k]) || patch[k]! < 0)) throw new UserError("القيم يجب أن تكون أرقامًا موجبة");
  if (patch.weight !== undefined && patch.weight > 100) throw new UserError("وزن المؤشر لا يتجاوز 100%");
  const targetChanged = patch.target !== undefined && patch.target !== num(before.target);
  const valueChanged =
    (patch.achieved !== undefined && patch.achieved !== num(before.achieved)) ||
    targetChanged ||
    (patch.weight !== undefined && patch.weight !== num(before.weight));
  if (targetChanged && !reason?.trim()) throw new UserError("سبب تعديل المستهدف مطلوب");

  const targetReasonNote =
    targetChanged && reason?.trim() && patch.notes === undefined
      ? { notes: before.notes ? `${before.notes}\nسبب تعديل المستهدف: ${reason.trim()}` : `سبب تعديل المستهدف: ${reason.trim()}` }
      : {};

  await db.$transaction(async (tx) => {
    const after = await tx.evaluationIndicator.update({
      where: { id: indicatorId },
      data: { ...patch, ...targetReasonNote, ...(valueChanged && before.sourceType !== "MANUAL" ? { isOverridden: true } : {}) },
    });
    await recalculate(tx, before.duty.evaluationId);
    await audit({ user, action: "evaluation.indicator.update", entityType: "EvaluationIndicator", entityId: indicatorId, before, after, diff: true, reason }, tx);
  });
}

/** Back to the automatic value of an indicator the manager had changed. */
export async function resetIndicator(user: AuthUser, indicatorId: string) {
  const ind = await db.evaluationIndicator.findUnique({ where: { id: indicatorId }, include: { duty: { select: { evaluationId: true } } } });
  if (!ind) throw new UserError("المؤشر غير موجود");
  await loadForEdit(user, ind.duty.evaluationId);
  await db.$transaction(async (tx) => {
    await tx.evaluationIndicator.update({ where: { id: indicatorId }, data: { isOverridden: false } });
    await pullAutomatic(tx, ind.duty.evaluationId);
    await recalculate(tx, ind.duty.evaluationId);
    await audit({ user, action: "evaluation.indicator.reset", entityType: "EvaluationIndicator", entityId: indicatorId, before: { achieved: num(ind.achieved), target: num(ind.target) } }, tx);
  });
}

export async function addIndicator(user: AuthUser, dutyId: string, input: { title: string; description?: string | null; achieved: number; target: number; weight: number; monthlyGoalId?: string | null }) {
  const duty = await db.evaluationDuty.findUnique({ where: { id: dutyId }, include: { _count: { select: { indicators: true } } } });
  if (!duty) throw new UserError("الواجب غير موجود");
  const e = await loadForEdit(user, duty.evaluationId);
  if (!input.title.trim()) throw new UserError("اكتب اسم المؤشر");
  const goal = input.monthlyGoalId ? await db.monthlyGoal.findFirst({ where: { id: input.monthlyGoalId, planId: e.monthlyPlanId ?? "__none__" } }) : null;
  await db.$transaction(async (tx) => {
    const created = await tx.evaluationIndicator.create({
      data: {
        dutyId,
        title: input.title.trim(),
        description: input.description ?? null,
        achieved: goal ? num(goal.achievedValue) : input.achieved,
        target: goal ? num(goal.targetValue) : input.target,
        weight: input.weight,
        sourceType: goal ? "MONTHLY_GOAL" : "MANUAL",
        sourceId: goal?.id ?? null,
        sortOrder: duty._count.indicators,
      },
    });
    await recalculate(tx, duty.evaluationId);
    await audit({ user, action: "evaluation.indicator.create", entityType: "EvaluationIndicator", entityId: created.id, after: created }, tx);
  });
}

export async function removeIndicator(user: AuthUser, indicatorId: string, reason: string | null) {
  const ind = await db.evaluationIndicator.findUnique({ where: { id: indicatorId }, include: { duty: { select: { evaluationId: true } } } });
  if (!ind) throw new UserError("المؤشر غير موجود");
  await loadForEdit(user, ind.duty.evaluationId);
  await db.$transaction(async (tx) => {
    await tx.evaluationIndicator.delete({ where: { id: indicatorId } });
    await recalculate(tx, ind.duty.evaluationId);
    await audit({ user, action: "evaluation.indicator.delete", entityType: "EvaluationIndicator", entityId: indicatorId, before: ind, reason }, tx);
  });
}

export async function updateDuty(user: AuthUser, dutyId: string, patch: { title?: string; weight?: number }, reason: string | null) {
  const before = await db.evaluationDuty.findUnique({ where: { id: dutyId } });
  if (!before) throw new UserError("الواجب غير موجود");
  await loadForEdit(user, before.evaluationId);
  if (patch.weight !== undefined && (!Number.isFinite(patch.weight) || patch.weight < 0 || patch.weight > 100)) throw new UserError("وزن الواجب بين 0 و100%");
  await db.$transaction(async (tx) => {
    const after = await tx.evaluationDuty.update({ where: { id: dutyId }, data: patch });
    await recalculate(tx, before.evaluationId);
    await audit({ user, action: "evaluation.duty.update", entityType: "EvaluationDuty", entityId: dutyId, before, after, diff: true, reason }, tx);
  });
}

/** Override (or clear, with null) the final score. A reason is required. */
export async function overrideFinalScore(user: AuthUser, evaluationId: string, score: number | null, reason: string) {
  const e = await loadForEdit(user, evaluationId);
  if (!reason.trim()) throw new UserError("اكتب سبب تعديل النتيجة النهائية");
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new UserError("النتيجة النهائية بين 0 و100");
  await db.$transaction(async (tx) => {
    await tx.performanceEvaluation.update({ where: { id: evaluationId }, data: { overrideScore: score, overrideReason: score === null ? null : reason.trim() } });
    await recalculate(tx, evaluationId);
    await audit({ user, action: "evaluation.final_override", entityType: "PerformanceEvaluation", entityId: evaluationId, before: { finalScore: num(e.finalScore), overrideScore: e.overrideScore === null ? null : num(e.overrideScore) }, after: { overrideScore: score }, reason: reason.trim() }, tx);
  });
}

export async function updateEvaluationNotes(user: AuthUser, evaluationId: string, managerNotes: string | null) {
  const e = await loadForEdit(user, evaluationId);
  await db.performanceEvaluation.update({ where: { id: evaluationId }, data: { managerNotes } });
  await audit({ user, action: "evaluation.notes", entityType: "PerformanceEvaluation", entityId: evaluationId, before: { managerNotes: e.managerNotes }, after: { managerNotes } });
}

/** Approval is refused unless duty weights and every duty's indicator weights total 100%. */
export async function approveEvaluation(user: AuthUser, evaluationId: string) {
  if (!canApprove(user)) throw new UserError("اعتماد التقييمات من صلاحيات المدير");
  const e = await db.performanceEvaluation.findUnique({ where: { id: evaluationId }, include: evaluationInclude });
  if (!e) throw new UserError("التقييم غير موجود");
  assertEmployeeAccess(user, e.employeeId);
  if (e.status === "APPROVED") throw new UserError("التقييم معتمد مسبقًا");
  const errors = validateEvaluation(toDutyInputs(e));
  if (errors.length) throw new UserError(`لا يمكن اعتماد التقييم: ${errors.join(" — ")}`);
  await db.$transaction(async (tx) => {
    await recalculate(tx, evaluationId);
    await tx.performanceEvaluation.update({ where: { id: evaluationId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id } });
    await audit({ user, action: "evaluation.approve", entityType: "PerformanceEvaluation", entityId: evaluationId, after: { finalScore: num(e.finalScore), ratingLabel: e.ratingLabel } }, tx);
  });
}

export async function reopenEvaluation(user: AuthUser, evaluationId: string, reason: string) {
  if (!canApprove(user)) throw new UserError("إعادة فتح التقييم من صلاحيات المدير");
  if (!reason.trim()) throw new UserError("اكتب سبب إعادة الفتح");
  const e = await db.performanceEvaluation.findUnique({ where: { id: evaluationId } });
  if (!e) throw new UserError("التقييم غير موجود");
  assertEmployeeAccess(user, e.employeeId);
  await db.performanceEvaluation.update({ where: { id: evaluationId }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
  await audit({ user, action: "evaluation.reopen", entityType: "PerformanceEvaluation", entityId: evaluationId, reason: reason.trim() });
}

// ---------------------------------------------------------------------------
//  Preview (read-only) — what createEvaluation would build
// ---------------------------------------------------------------------------

type TemplateShape = { duties: readonly { title: string; kind: string; weight: unknown; indicators: readonly { title: string; description?: string | null; notes?: string | null; target: unknown; weight: unknown; sourceType: string; sourceConfig?: unknown }[] }[] };

/** Builds the evaluation in memory from the template, plan, reports and ad-hoc tasks — writes nothing. */
export async function previewEvaluation(employeeId: string, year: number, month: number) {
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { fullName: true, jobTitleId: true, jobTitle: { select: { name: true } }, department: { select: { name: true } } } });
  let template: TemplateShape = DEFAULT_TEMPLATE;
  try {
    const stored = await db.evaluationTemplate.findFirst({
      where: employee.jobTitleId ? { OR: [{ jobTitleId: employee.jobTitleId, isActive: true }, { name: DEFAULT_TEMPLATE.name }] } : { name: DEFAULT_TEMPLATE.name },
      include: { duties: { orderBy: { sortOrder: "asc" }, include: { indicators: { orderBy: { sortOrder: "asc" } } } } },
      orderBy: { updatedAt: "desc" },
    });
    if (stored) template = stored;
  } catch {
    // evaluation tables not migrated yet on this database — preview with the built-in template
  }
  const plan = await db.monthlyPlan.findUnique({ where: { employeeId_year_month: { employeeId, year, month } }, include: { weeklyPlans: { select: { startDate: true, endDate: true } } } });
  const span = plan ? resolveExecutionPeriod(plan) : { start: monthStart(year, month), end: monthEnd(year, month) };
  const company = await getCompanyFresh();
  const ctx: Context = { tz: company.timezone, reportDueDays: company.weeklyReportDueDays, start: span.start, end: span.end, plan: await loadPlan(plan?.id ?? null) };
  const tasks = await adHocTasksFor(employeeId, span.start, span.end);
  const duties = template.duties.map((d) => ({
    title: d.title,
    kind: d.kind,
    weight: num(d.weight),
    indicators: [
      ...d.indicators.map((i) => {
        const m = i.sourceType === "MANUAL" ? null : measure(i.sourceType, i.sourceConfig ?? null, ctx);
        return { title: i.title, sourceType: i.sourceType, matched: !!m, notes: m?.notes ?? i.notes ?? null, achieved: m?.achieved ?? 0, target: m?.target ?? num(i.target), weight: num(i.weight) };
      }),
      ...(d.kind === "AD_HOC" ? tasks.map((t) => ({ title: t.title, sourceType: "AD_HOC_TASK", matched: true, notes: null, achieved: t.status === "COMPLETED" ? 1 : 0, target: 1, weight: num(t.weight) })) : []),
    ],
  }));
  const result = scoreEvaluation(duties, { capAt100: true });
  const usedGoalNames = new Set(ctx.plan?.goals.filter((g) => template.duties.some((d) => d.indicators.some((i) => i.sourceType === "MONTHLY_GOAL" && goalMatches(g.name, i.sourceConfig ?? null)))).map((g) => g.name));
  return {
    employee: { name: employee.fullName, jobTitle: employee.jobTitle?.name ?? null, department: employee.department?.name ?? null },
    plan: plan ? { id: plan.id, status: plan.status } : null,
    period: span,
    duties,
    result,
    validation: validateEvaluation(duties),
    unusedGoals: (ctx.plan?.goals ?? []).filter((g) => g.status !== "CANCELLED" && !usedGoalNames.has(g.name)).map((g) => `${g.name} (${num(g.achievedValue)} / ${num(g.targetValue)})`),
    adHocExcluded: await db.adHocTask.count({ where: { employeeId, includeInEvaluation: false, assignedDate: { gte: fromDateKey(span.start), lte: fromDateKey(span.end) } } }),
  };
}

// ---------------------------------------------------------------------------
//  Queries
// ---------------------------------------------------------------------------

export async function getEvaluation(evaluationId: string) {
  const e = await db.performanceEvaluation.findUnique({ where: { id: evaluationId }, include: evaluationInclude });
  if (!e) return null;
  const goals = e.monthlyPlanId ? await db.monthlyGoal.findMany({ where: { planId: e.monthlyPlanId, status: { not: "CANCELLED" } }, select: { id: true, name: true, achievedValue: true, targetValue: true }, orderBy: { sortOrder: "asc" } }) : [];
  const usedGoals = new Set(e.duties.flatMap((d) => d.indicators.filter((i) => i.sourceType === "MONTHLY_GOAL" && i.sourceId).map((i) => i.sourceId!)));
  return {
    ...e,
    validation: validateEvaluation(toDutyInputs(e)),
    result: scoreEvaluation(toDutyInputs(e), { capAt100: e.capAt100 }),
    /** plan goals not used by any indicator — the manager can add them to a duty */
    unusedGoals: goals.filter((g) => !usedGoals.has(g.id)).map((g) => ({ id: g.id, name: g.name, achieved: num(g.achievedValue), target: num(g.targetValue) })),
  };
}

export type EvaluationView = NonNullable<Awaited<ReturnType<typeof getEvaluation>>>;

export async function listEvaluations(user: AuthUser, filter: { year?: number; month?: number } = {}) {
  return db.performanceEvaluation.findMany({
    where: { ...employeeWhere(user), ...(filter.year ? { year: filter.year } : {}), ...(filter.month ? { month: filter.month } : {}) },
    include: { employee: { select: { fullName: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}
