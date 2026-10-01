import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { employeeIdScope } from "@/server/auth/session";
import { getCompany } from "@/server/services/company";
import { currentPlanMonth } from "@/server/services/periods";
import { resolveExecutionPeriod } from "@/lib/execution-period";
import { breakdownTotals, weightedProgress } from "@/server/queries/dashboard";
import { fromDateKey, monthEnd, monthLabel, monthStart, shiftMonth, toDateKey, todayKey } from "@/lib/dates";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { num, round2 } from "@/lib/num";
import { STAGE_KEY_SUGGESTIONS } from "@/lib/labels";

const APPROVED_REVIEW = ["APPROVED", "ACKNOWLEDGED"] as const;

const avg = (vals: (number | null | undefined)[]) => {
  const v = vals.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

const excerpt = (s: string | null | undefined, n = 120) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : null);

/** Today + the administrative month of the plans running today (not the calendar month). */
export async function currentMonth() {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  return { today, ...(await currentPlanMonth(today)) };
}

/** Employee-id filter on the Employee model itself for the given user. */
function employeeIdWhere(user: AuthUser): Prisma.EmployeeWhereInput {
  const scope = employeeIdScope(user);
  return scope === "ALL" ? {} : { id: { in: scope } };
}

// ---- employees ------------------------------------------------------------------

export interface EmployeeFilters {
  q?: string;
  departmentId?: string;
  jobTitleId?: string;
  status?: string;
  skip: number;
  take: number;
}

export async function getEmployeesList(user: AuthUser, f: EmployeeFilters) {
  const { year, month } = await currentMonth();
  const manageAll = hasPermission(user, PERMISSIONS.EMPLOYEES_MANAGE) || hasPermission(user, PERMISSIONS.USERS_MANAGE);
  const where: Prisma.EmployeeWhereInput = {
    ...(manageAll ? {} : employeeIdWhere(user)),
    ...(f.departmentId ? { departmentId: f.departmentId } : {}),
    ...(f.jobTitleId ? { jobTitleId: f.jobTitleId } : {}),
    ...(f.status && ["ACTIVE", "ON_LEAVE", "TERMINATED"].includes(f.status) ? { status: f.status as "ACTIVE" | "ON_LEAVE" | "TERMINATED" } : {}),
    ...(f.q
      ? {
          OR: [
            { fullName: { contains: f.q, mode: "insensitive" } },
            { employeeNo: { contains: f.q, mode: "insensitive" } },
            { phone: { contains: f.q } },
            { user: { email: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({
      where,
      include: {
        user: { select: { email: true, roleId: true, status: true, role: { select: { name: true } } } },
        department: { select: { id: true, name: true } },
        jobTitle: { select: { id: true, name: true } },
        manager: { select: { id: true, fullName: true } },
        monthlyPlans: { where: { year, month }, select: { id: true, status: true, goals: { select: { weight: true, progressPct: true, status: true } } } },
      },
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      skip: f.skip,
      take: f.take,
    }),
  ]);
  return {
    year,
    month,
    total,
    rows: rows.map((e) => {
      const plan = e.monthlyPlans[0] ?? null;
      return {
        id: e.id,
        fullName: e.fullName,
        employeeNo: e.employeeNo,
        email: e.user.email,
        phone: e.phone,
        roleId: e.user.roleId,
        roleName: e.user.role.name,
        departmentId: e.departmentId,
        departmentName: e.department?.name ?? null,
        jobTitleId: e.jobTitleId,
        jobTitleName: e.jobTitle?.name ?? null,
        managerId: e.managerId,
        managerName: e.manager?.fullName ?? null,
        hireDate: e.hireDate ? toDateKey(e.hireDate) : null,
        status: e.status,
        notionUserId: e.notionUserId,
        notionAlias: e.notionAlias,
        planId: plan?.id ?? null,
        planStatus: plan?.status ?? null,
        progress: plan ? weightedProgress(plan.goals) : null,
      };
    }),
  };
}

export type EmployeeRow = Awaited<ReturnType<typeof getEmployeesList>>["rows"][number];

export async function getEmployeeFormOptions() {
  const [roles, departments, jobTitles, employees] = await Promise.all([
    db.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.jobTitle.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { not: "TERMINATED" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  return {
    roles: roles.map((r) => ({ value: r.id, label: r.name })),
    departments: departments.map((d) => ({ value: d.id, label: d.name })),
    jobTitles: jobTitles.map((j) => ({ value: j.id, label: j.name })),
    employees: employees.map((e) => ({ value: e.id, label: e.fullName })),
  };
}

export type EmployeeFormOptions = Awaited<ReturnType<typeof getEmployeeFormOptions>>;

export async function getEmployeeProfile(id: string) {
  const { year, month } = await currentMonth();
  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, role: { select: { name: true } } } },
      department: { select: { name: true } },
      jobTitle: { select: { name: true } },
      manager: { select: { id: true, fullName: true } },
      monthlyPlans: {
        where: { year, month },
        include: { goals: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!employee) return null;
  const plan = employee.monthlyPlans[0] ?? null;
  return {
    year,
    month,
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      employeeNo: employee.employeeNo,
      email: employee.user.email,
      phone: employee.phone,
      roleName: employee.user.role.name,
      department: employee.department?.name ?? null,
      jobTitle: employee.jobTitle?.name ?? null,
      manager: employee.manager,
      hireDate: employee.hireDate ? toDateKey(employee.hireDate) : null,
      status: employee.status,
      notionAlias: employee.notionAlias,
    },
    plan: plan
      ? {
          id: plan.id,
          status: plan.status,
          progress: weightedProgress(plan.goals),
          goals: plan.goals.map((g) => ({
            id: g.id,
            name: g.name,
            status: g.status,
            unit: g.unit,
            source: g.source,
            target: num(g.targetValue),
            achieved: num(g.achievedValue),
            progress: num(g.progressPct),
            weight: num(g.weight),
          })),
        }
      : null,
  };
}

// ---- performance history ------------------------------------------------------------

export interface HistoryRow {
  key: string;
  year: number;
  month: number;
  label: string;
  planId: string | null;
  goalsCount: number;
  achievement: number | null;
  quality: number | null;
  productivity: number | null;
  finalScore: number | null;
  autoScore: number | null;
  ratingLabel: string | null;
  ratingColor: string | null;
  reviewId: string | null;
  reviewStatus: string | null;
  managerNotes: string | null;
  topAchievements: string[];
}

/**
 * Month-by-month history for one employee. When `approvedOnly` is set, review
 * scores are only exposed once the review is approved (employee self-view).
 */
export async function getPerformanceHistory(employeeId: string, range: 6 | 12, approvedOnly: boolean): Promise<HistoryRow[]> {
  const { year, month } = await currentMonth();
  const months = Array.from({ length: range }, (_, i) => shiftMonth(year, month, -(range - 1) + i));
  const monthOr = months.map((m) => ({ year: m.year, month: m.month }));
  const [plans, reviews] = await Promise.all([
    db.monthlyPlan.findMany({
      where: { employeeId, OR: monthOr },
      select: { id: true, year: true, month: true, goals: { select: { name: true, weight: true, progressPct: true, status: true, breakdown: true } } },
    }),
    db.performanceReview.findMany({
      where: { employeeId, OR: monthOr, ...(approvedOnly ? { status: { in: [...APPROVED_REVIEW] } } : {}) },
      select: {
        id: true,
        year: true,
        month: true,
        status: true,
        autoScore: true,
        finalScore: true,
        productivityScore: true,
        qualityScore: true,
        ratingLabel: true,
        ratingColor: true,
        managerNotes: true,
      },
    }),
  ]);
  return months.map((m) => {
    const plan = plans.find((p) => p.year === m.year && p.month === m.month);
    const review = reviews.find((r) => r.year === m.year && r.month === m.month);
    const goals = (plan?.goals ?? []).filter((g) => g.status !== "CANCELLED");
    const achievement = plan ? weightedProgress(plan.goals) : null;
    const approval = plan ? breakdownTotals(plan.goals).approvalRate : null;
    return {
      key: `${m.year}-${m.month}`,
      year: m.year,
      month: m.month,
      label: monthLabel(m.year, m.month),
      planId: plan?.id ?? null,
      goalsCount: goals.length,
      achievement,
      quality: review?.qualityScore != null ? num(review.qualityScore) : approval,
      productivity: review?.productivityScore != null ? num(review.productivityScore) : achievement,
      finalScore: review ? num(review.finalScore) : null,
      autoScore: review ? num(review.autoScore) : null,
      ratingLabel: review?.ratingLabel ?? null,
      ratingColor: review?.ratingColor ?? null,
      reviewId: review?.id ?? null,
      reviewStatus: review?.status ?? null,
      managerNotes: excerpt(review?.managerNotes),
      topAchievements: goals.filter((g) => num(g.progressPct) >= 100).map((g) => g.name),
    };
  });
}

// ---- analytics -------------------------------------------------------------------------

export async function getPerformanceAnalytics(user: AuthUser, year: number, month: number) {
  const { today } = await currentMonth();
  // delays are counted over the month's execution periods (which may cross a calendar month)
  const spans = (await db.monthlyPlan.findMany({ where: { year, month }, include: { weeklyPlans: { select: { startDate: true, endDate: true } } } })).map(resolveExecutionPeriod);
  const from = fromDateKey(spans.map((s) => s.start).sort()[0] ?? monthStart(year, month));
  const to = fromDateKey(spans.map((s) => s.end).sort().at(-1) ?? monthEnd(year, month));
  const todayDate = fromDateKey(today);
  const scope = employeeIdScope(user);

  const employees = await db.employee.findMany({
    where: { status: "ACTIVE", jobTitleId: { not: null }, ...employeeIdWhere(user) },
    select: { id: true, fullName: true, jobTitle: { select: { name: true } } },
    orderBy: { fullName: "asc" },
  });
  const ids = employees.map((e) => e.id);
  const trendMonths = Array.from({ length: 6 }, (_, i) => shiftMonth(year, month, -5 + i));

  const [plans, trendPlans, reviews, trendReviews, delayedTasks, delayedAdHoc, stageCounts, stageLabels] = await Promise.all([
    db.monthlyPlan.findMany({
      where: { employeeId: { in: ids }, year, month },
      include: {
        goals: true,
        weeklyPlans: { orderBy: { weekIndex: "asc" }, include: { goals: { include: { monthlyGoal: { select: { weight: true, status: true } } } } } },
      },
    }),
    db.monthlyPlan.findMany({
      where: { employeeId: { in: ids }, OR: trendMonths.map((m) => ({ year: m.year, month: m.month })) },
      select: { year: true, month: true, goals: { select: { weight: true, progressPct: true, status: true, breakdown: true } } },
    }),
    db.performanceReview.findMany({ where: { employeeId: { in: ids }, year, month } }),
    db.performanceReview.findMany({
      where: { employeeId: { in: ids }, OR: trendMonths.map((m) => ({ year: m.year, month: m.month })) },
      select: { year: true, month: true, finalScore: true, productivityScore: true, qualityScore: true },
    }),
    db.dailyTask.groupBy({
      by: ["employeeId"],
      where: {
        employeeId: { in: ids },
        date: { gte: from, lte: to },
        OR: [{ status: "DELAYED" }, { deadline: { lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED"] } }],
      },
      _count: { _all: true },
    }),
    db.adHocTask.groupBy({
      by: ["employeeId"],
      where: {
        employeeId: { in: ids },
        OR: [
          { status: "DELAYED", assignedDate: { gte: from, lte: to } },
          { dueDate: { gte: from, lte: to, lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED", "DELAYED"] } },
        ],
      },
      _count: { _all: true },
    }),
    db.notionItemStage.groupBy({
      by: ["stageKey", "systemStatus"],
      where: { item: { isArchived: false, ...(scope === "ALL" ? {} : { OR: [{ employeeId: null }, { employeeId: { in: scope } }] }) } },
      _count: { _all: true },
    }),
    db.notionFieldMapping.findMany({ where: { role: "STATUS" }, select: { stageKey: true, label: true } }),
  ]);

  const delayed = new Map<string, number>();
  for (const r of [...delayedTasks, ...delayedAdHoc]) delayed.set(r.employeeId, (delayed.get(r.employeeId) ?? 0) + r._count._all);

  const perEmployee = employees.map((e) => {
    const plan = plans.find((p) => p.employeeId === e.id);
    const review = reviews.find((r) => r.employeeId === e.id);
    const totals = breakdownTotals(plan?.goals ?? []);
    const productivity = plan ? weightedProgress(plan.goals) : null;
    const quality = review?.qualityScore != null ? num(review.qualityScore) : totals.approvalRate;
    return {
      id: e.id,
      name: e.fullName,
      jobTitle: e.jobTitle?.name ?? "—",
      hasPlan: !!plan,
      productivity,
      quality,
      finalScore: review ? num(review.finalScore) : null,
      autoScore: review ? num(review.autoScore) : null,
      delayed: delayed.get(e.id) ?? 0,
      revisionRate: totals.worked > 0 ? round2((Math.max(totals.reworkCount, totals.needsRevision) / totals.worked) * 100) : null,
      worked: totals.worked,
      weeks: (plan?.weeklyPlans ?? []).map((w) => ({
        index: w.weekIndex,
        progress: weightedProgress(w.goals.map((g) => ({ weight: g.monthlyGoal.weight, progressPct: g.progressPct, status: g.monthlyGoal.status }))),
      })),
    };
  });

  const trend = trendMonths.map((m) => {
    const ps = trendPlans.filter((p) => p.year === m.year && p.month === m.month);
    const rs = trendReviews.filter((r) => r.year === m.year && r.month === m.month);
    return {
      label: monthLabel(m.year, m.month),
      achievement: avg(ps.map((p) => weightedProgress(p.goals))),
      quality: avg(rs.length ? rs.map((r) => (r.qualityScore === null ? null : num(r.qualityScore))) : ps.map((p) => breakdownTotals(p.goals).approvalRate)),
      score: avg(rs.map((r) => num(r.finalScore))),
    };
  });

  // goal completion across the team, averaged by goal name
  const goalAgg = new Map<string, number[]>();
  for (const p of plans)
    for (const g of p.goals) {
      if (g.status === "CANCELLED") continue;
      const list = goalAgg.get(g.name) ?? [];
      list.push(num(g.progressPct));
      goalAgg.set(g.name, list);
    }
  const goalCompletion = [...goalAgg.entries()]
    .map(([name, list]) => ({ name, pct: avg(list) ?? 0 }))
    .sort((a, b) => b.pct - a.pct);

  const stageRows = Object.values(
    stageCounts.reduce<Record<string, { label: string; [k: string]: string | number }>>((acc, s) => {
      acc[s.stageKey] ??= { label: stageLabels.find((l) => l.stageKey === s.stageKey)?.label ?? s.stageKey };
      const bucket = s.systemStatus === "IN_PROGRESS_AFTER_REVISION" ? "IN_PROGRESS" : s.systemStatus;
      acc[s.stageKey][bucket] = (Number(acc[s.stageKey][bucket]) || 0) + s._count._all;
      return acc;
    }, {}),
  );

  // weekly progress: one series per employee (≤ 3) or the team average
  const maxWeeks = Math.max(0, ...perEmployee.flatMap((e) => e.weeks.map((w) => w.index)));
  const withWeeks = perEmployee.filter((e) => e.weeks.length > 0);
  const individual = withWeeks.length > 0 && withWeeks.length <= 3;
  const weeklySeries = individual ? withWeeks.map((e, i) => ({ key: `e${i}`, label: e.name })) : [{ key: "avg", label: "متوسط الفريق" }];
  const weekly = Array.from({ length: maxWeeks }, (_, i) => {
    const index = i + 1;
    const row: Record<string, string | number | null> = { label: `الفترة ${index}` };
    if (individual) withWeeks.forEach((e, k) => (row[`e${k}`] = e.weeks.find((w) => w.index === index)?.progress ?? null));
    else row.avg = avg(withWeeks.map((e) => e.weeks.find((w) => w.index === index)?.progress ?? null));
    return row;
  });

  const withPlan = perEmployee.filter((e) => e.hasPlan);
  return {
    year,
    month,
    employees: perEmployee,
    trend,
    goalCompletion,
    stageRows,
    weekly,
    weeklySeries,
    stats: {
      employees: perEmployee.length,
      withPlan: withPlan.length,
      avgProductivity: avg(withPlan.map((e) => e.productivity)),
      avgQuality: avg(withPlan.map((e) => e.quality)),
      avgFinal: avg(perEmployee.map((e) => e.finalScore)),
      reviews: reviews.length,
      delayed: perEmployee.reduce((a, e) => a + e.delayed, 0),
    },
  };
}

// ---- monthly reviews list -----------------------------------------------------------------

export async function getReviewsList(user: AuthUser, year: number, month: number) {
  const employees = await db.employee.findMany({
    where: { status: "ACTIVE", jobTitleId: { not: null }, ...employeeIdWhere(user) },
    select: {
      id: true,
      fullName: true,
      jobTitle: { select: { name: true } },
      monthlyPlans: { where: { year, month }, select: { id: true, status: true } },
      reviews: {
        where: { year, month },
        select: {
          id: true,
          status: true,
          autoScore: true,
          managerAdjustment: true,
          finalScore: true,
          ratingLabel: true,
          ratingColor: true,
          calculatedAt: true,
        },
      },
    },
    orderBy: { fullName: "asc" },
  });
  return employees.map((e) => {
    const plan = e.monthlyPlans[0] ?? null;
    const r = e.reviews[0] ?? null;
    return {
      employeeId: e.id,
      name: e.fullName,
      jobTitle: e.jobTitle?.name ?? "—",
      isSelf: e.id === user.employeeId,
      planId: plan?.id ?? null,
      planStatus: plan?.status ?? null,
      reviewId: r?.id ?? null,
      reviewStatus: r?.status ?? null,
      autoScore: r ? num(r.autoScore) : null,
      adjustment: r ? num(r.managerAdjustment) : null,
      finalScore: r ? num(r.finalScore) : null,
      ratingLabel: r?.ratingLabel ?? null,
      ratingColor: r?.ratingColor ?? null,
      calculatedAt: r?.calculatedAt ? r.calculatedAt.toISOString() : null,
    };
  });
}

export type ReviewListRow = Awaited<ReturnType<typeof getReviewsList>>[number];

// ---- review detail ------------------------------------------------------------------------

export async function getReviewDetail(id: string) {
  const review = await db.performanceReview.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          jobTitle: { select: { name: true } },
          department: { select: { name: true } },
          manager: { select: { fullName: true } },
        },
      },
      results: { include: { template: { select: { code: true, sourceType: true, calculationMethod: true } } }, orderBy: [{ category: "asc" }, { weight: "desc" }] },
      monthlyPlan: { select: { id: true, status: true } },
    },
  });
  if (!review) return null;
  const resultIds = review.results.map((r) => r.id);
  const [approvedBy, logs] = await Promise.all([
    review.approvedById ? db.user.findUnique({ where: { id: review.approvedById }, select: { name: true } }) : null,
    db.auditLog.findMany({
      where: {
        OR: [
          { entityType: "PerformanceReview", entityId: review.id },
          ...(resultIds.length ? [{ entityType: "KpiResult", entityId: { in: resultIds } }] : []),
        ],
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const resultName = new Map(review.results.map((r) => [r.id, r.name]));
  return {
    review: {
      id: review.id,
      employeeId: review.employeeId,
      year: review.year,
      month: review.month,
      status: review.status,
      autoScore: num(review.autoScore),
      managerAdjustment: num(review.managerAdjustment),
      adjustmentReason: review.adjustmentReason,
      finalScore: num(review.finalScore),
      productivityScore: review.productivityScore === null ? null : num(review.productivityScore),
      qualityScore: review.qualityScore === null ? null : num(review.qualityScore),
      ratingLabel: review.ratingLabel,
      ratingColor: review.ratingColor,
      managerNotes: review.managerNotes,
      strengths: review.strengths,
      improvements: review.improvements,
      calculatedAt: review.calculatedAt,
      approvedAt: review.approvedAt,
      approvedBy: approvedBy?.name ?? null,
      acknowledgedAt: review.acknowledgedAt,
      planId: review.monthlyPlan?.id ?? null,
    },
    employee: {
      id: review.employee.id,
      fullName: review.employee.fullName,
      jobTitle: review.employee.jobTitle?.name ?? null,
      department: review.employee.department?.name ?? null,
      manager: review.employee.manager?.fullName ?? null,
    },
    results: review.results.map((r) => ({
      id: r.id,
      code: r.template.code,
      name: r.name,
      category: r.category,
      unit: r.unit,
      method: r.template.calculationMethod,
      target: num(r.target),
      achieved: num(r.achieved),
      achievementRate: num(r.achievementRate),
      score: num(r.score),
      maxScore: num(r.maxScore),
      weight: num(r.weight),
      weightedScore: num(r.weightedScore),
      isAutomatic: r.isAutomatic,
      isOverridden: r.isOverridden,
      overrideReason: r.overrideReason,
      details: (r.details ?? null) as Record<string, unknown> | null,
    })),
    audit: logs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      target: l.entityType === "KpiResult" ? (resultName.get(l.entityId ?? "") ?? null) : null,
      user: l.user?.name ?? "النظام",
      before: l.before,
      after: l.after,
      reason: l.reason,
      createdAt: l.createdAt,
    })),
  };
}

export type ReviewDetail = NonNullable<Awaited<ReturnType<typeof getReviewDetail>>>;
export type KpiResultRow = ReviewDetail["results"][number];

export async function getLatestApprovedReviewId(employeeId: string) {
  const r = await db.performanceReview.findFirst({
    where: { employeeId, status: { in: [...APPROVED_REVIEW] } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true },
  });
  return r?.id ?? null;
}

// ---- KPI configuration ----------------------------------------------------------------------

export async function getKpiConfig() {
  const [templates, assignments, jobTitles, stageMappings] = await Promise.all([
    db.kpiTemplate.findMany({ orderBy: [{ isActive: "desc" }, { category: "asc" }, { code: "asc" }] }),
    db.kpi.findMany({ include: { template: { select: { code: true, name: true, category: true, isActive: true } } }, orderBy: [{ sortOrder: "asc" }] }),
    db.jobTitle.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.notionFieldMapping.findMany({ where: { role: "STATUS", stageKey: { not: null } }, select: { stageKey: true, label: true } }),
  ]);
  const stageKeys = new Map<string, string>();
  for (const m of stageMappings) if (m.stageKey && !stageKeys.has(m.stageKey)) stageKeys.set(m.stageKey, m.label);
  for (const s of STAGE_KEY_SUGGESTIONS) if (!stageKeys.has(s.key)) stageKeys.set(s.key, s.label);
  return {
    templates: templates.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      category: t.category,
      unit: t.unit,
      defaultTarget: num(t.defaultTarget),
      defaultWeight: num(t.defaultWeight),
      calculationMethod: t.calculationMethod,
      methodConfig: (t.methodConfig ?? null) as Record<string, unknown> | null,
      maxScore: num(t.maxScore),
      sourceType: t.sourceType,
      sourceConfig: (t.sourceConfig ?? null) as Record<string, unknown> | null,
      isAutomatic: t.isAutomatic,
      isActive: t.isActive,
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      templateId: a.templateId,
      templateCode: a.template.code,
      templateName: a.template.name,
      templateActive: a.template.isActive,
      category: a.template.category,
      jobTitleId: a.jobTitleId,
      weight: num(a.weight),
      target: a.target === null ? null : num(a.target),
      isActive: a.isActive,
    })),
    jobTitles,
    stageKeys: [...stageKeys.entries()].map(([key, label]) => ({ key, label })),
  };
}

export type KpiConfig = Awaited<ReturnType<typeof getKpiConfig>>;
export type KpiTemplateRow = KpiConfig["templates"][number];
export type KpiAssignmentRow = KpiConfig["assignments"][number];
