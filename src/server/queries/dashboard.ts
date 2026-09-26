import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { employeeIdScope } from "@/server/auth/session";
import { fromDateKey, monthLabel, shiftMonth, toDateKey, todayKey } from "@/lib/dates";
import { num, round2 } from "@/lib/num";
import type { ProgressBreakdown } from "@/lib/notion/progress";
import { getCompany } from "@/server/services/company";

type GoalLike = { weight: unknown; progressPct: unknown; status: string; breakdown?: unknown };

export function weightedProgress(goals: GoalLike[]) {
  const active = goals.filter((g) => g.status !== "CANCELLED");
  if (active.length === 0) return 0;
  const w = active.reduce((a, g) => a + num(g.weight), 0);
  return round2(
    w > 0
      ? active.reduce((a, g) => a + Math.min(num(g.progressPct), 100) * num(g.weight), 0) / w
      : active.reduce((a, g) => a + Math.min(num(g.progressPct), 100), 0) / active.length,
  );
}

export function breakdownTotals(rows: { breakdown?: unknown; status?: string }[]) {
  const sum = (k: keyof ProgressBreakdown) =>
    rows.reduce((a, r) => a + (r.status === "CANCELLED" ? 0 : Number((r.breakdown as ProgressBreakdown | null)?.[k] ?? 0)), 0);
  const completed = sum("completed");
  const needsRevision = sum("needsRevision");
  return {
    worked: sum("worked"),
    completed,
    pendingApproval: sum("pendingApproval"),
    needsRevision,
    blocked: sum("blocked"),
    reworkCount: sum("reworkCount"),
    approvalRate: completed + needsRevision > 0 ? round2((completed / (completed + needsRevision)) * 100) : null,
  };
}

export async function getEmployeeDashboard(user: AuthUser) {
  const employeeId = user.employeeId!;
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const year = +today.slice(0, 4);
  const month = +today.slice(5, 7);
  const todayDate = fromDateKey(today);

  const [plan, week, todayTasks, adHoc, delayedTasks, notifications, weeklyFeedback, lastReview] = await Promise.all([
    db.monthlyPlan.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
      include: { goals: { orderBy: { sortOrder: "asc" } } },
    }),
    db.weeklyPlan.findFirst({
      where: { employeeId, startDate: { lte: todayDate }, endDate: { gte: todayDate } },
      include: { goals: { include: { monthlyGoal: true } } },
    }),
    db.dailyTask.findMany({
      where: { employeeId, date: todayDate },
      include: { monthlyGoal: { select: { source: true, unit: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    db.adHocTask.findMany({
      where: { employeeId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      orderBy: [{ dueDate: "asc" }],
      take: 10,
    }),
    db.dailyTask.count({
      where: {
        employeeId,
        OR: [
          { status: "DELAYED" },
          { deadline: { lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
          { source: "MANUAL", date: { lt: todayDate }, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
        ],
      },
    }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.weeklyReport.findMany({
      where: { employeeId, managerComment: { not: null } },
      orderBy: { reviewedAt: "desc" },
      take: 3,
      select: { id: true, weekStart: true, managerComment: true, status: true, reviewedAt: true },
    }),
    db.performanceReview.findFirst({
      where: { employeeId, status: { in: ["APPROVED", "ACKNOWLEDGED"] } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);
  const overdueAdHoc = adHoc.filter((t) => t.dueDate && toDateKey(t.dueDate) < today).length;

  // Notion activity: recent status changes on stages this employee works on
  const goalStages = (plan?.goals ?? [])
    .filter((g) => g.notionDataSourceId && g.notionFilter)
    .map((g) => ({ dataSourceId: g.notionDataSourceId!, stageKey: (g.notionFilter as { stageKey: string }).stageKey }));
  const owned = await db.notionFieldMapping.findMany({ where: { ownerEmployeeId: employeeId, role: "STATUS" }, select: { dataSourceId: true, stageKey: true } });
  const stagePairs = [...goalStages, ...owned.filter((o) => o.stageKey).map((o) => ({ dataSourceId: o.dataSourceId, stageKey: o.stageKey! }))];
  const notionActivity = stagePairs.length
    ? await db.notionItemEvent.findMany({
        where: { OR: stagePairs.map((p) => ({ stageKey: p.stageKey, item: { dataSourceId: p.dataSourceId } })) },
        orderBy: { occurredAt: "desc" },
        take: 8,
        include: { item: { select: { title: true, url: true, productCode: true } } },
      })
    : [];

  const monthTotals = breakdownTotals(plan?.goals ?? []);
  return {
    today,
    year,
    month,
    plan,
    week,
    todayTasks,
    adHoc,
    stats: {
      monthProgress: weightedProgress(plan?.goals ?? []),
      weekProgress: weightedProgress(week?.goals.map((g) => ({ weight: g.monthlyGoal.weight, progressPct: g.progressPct, status: g.monthlyGoal.status })) ?? []),
      todayCount: todayTasks.length + adHoc.filter((t) => t.dueDate && toDateKey(t.dueDate) === today).length,
      todayDone: todayTasks.filter((t) => t.status === "COMPLETED").length,
      delayed: delayedTasks + overdueAdHoc,
      pendingApproval: monthTotals.pendingApproval,
      needsRevision: monthTotals.needsRevision,
      approvalRate: monthTotals.approvalRate,
    },
    notionActivity,
    notifications,
    weeklyFeedback,
    lastReview,
  };
}

export async function getManagerDashboard(user: AuthUser) {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const year = +today.slice(0, 4);
  const month = +today.slice(5, 7);
  const todayDate = fromDateKey(today);
  const scope = employeeIdScope(user);
  const employeeWhere = scope === "ALL" ? {} : { id: { in: scope } };

  const employees = await db.employee.findMany({
    where: { status: "ACTIVE", ...employeeWhere, jobTitleId: { not: null } },
    include: {
      jobTitle: true,
      monthlyPlans: { where: { year, month }, include: { goals: true } },
      weeklyPlans: { where: { startDate: { lte: todayDate }, endDate: { gte: todayDate } }, include: { goals: { include: { monthlyGoal: true } } } },
    },
    orderBy: { fullName: "asc" },
  });
  const ids = employees.map((e) => e.id);

  const [delayedByEmp, overdueAdHoc, weeklyPending, monthlyPending, plansPending, trendReviews] = await Promise.all([
    db.dailyTask.groupBy({
      by: ["employeeId"],
      where: {
        employeeId: { in: ids },
        OR: [{ status: "DELAYED" }, { deadline: { lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED"] } }],
      },
      _count: { _all: true },
    }),
    db.adHocTask.groupBy({
      by: ["employeeId"],
      where: { employeeId: { in: ids }, dueDate: { lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      _count: { _all: true },
    }),
    db.weeklyReport.count({ where: { employeeId: { in: ids }, status: "SUBMITTED" } }),
    db.monthlyReport.count({ where: { employeeId: { in: ids }, status: "SUBMITTED" } }),
    db.monthlyPlan.count({ where: { employeeId: { in: ids }, status: "SUBMITTED" } }),
    db.performanceReview.findMany({
      where: {
        employeeId: { in: ids },
        OR: Array.from({ length: 6 }, (_, i) => shiftMonth(year, month, -5 + i)).map((m) => ({ year: m.year, month: m.month })),
      },
      select: { year: true, month: true, finalScore: true, productivityScore: true, qualityScore: true },
    }),
  ]);
  const delayedMap = new Map<string, number>();
  for (const r of [...delayedByEmp, ...overdueAdHoc]) delayedMap.set(r.employeeId, (delayedMap.get(r.employeeId) ?? 0) + r._count._all);

  const rows = employees.map((e) => {
    const plan = e.monthlyPlans[0];
    const week = e.weeklyPlans[0];
    const totals = breakdownTotals(plan?.goals ?? []);
    return {
      id: e.id,
      name: e.fullName,
      role: e.jobTitle?.name ?? "—",
      planStatus: plan?.status ?? null,
      planId: plan?.id ?? null,
      monthly: weightedProgress(plan?.goals ?? []),
      weekly: weightedProgress(week?.goals.map((g) => ({ weight: g.monthlyGoal.weight, progressPct: g.progressPct, status: g.monthlyGoal.status })) ?? []),
      quality: totals.approvalRate,
      delayed: delayedMap.get(e.id) ?? 0,
      pendingApproval: totals.pendingApproval,
      needsRevision: totals.needsRevision,
      worked: totals.worked,
    };
  });

  const withPlans = rows.filter((r) => r.planId);
  const trend = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(year, month, -5 + i);
    const list = trendReviews.filter((r) => r.year === m.year && r.month === m.month);
    const avg = (vals: (number | null)[]) => {
      const v = vals.filter((x): x is number => x !== null);
      return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    return {
      label: monthLabel(m.year, m.month),
      score: avg(list.map((r) => num(r.finalScore))),
      productivity: avg(list.map((r) => (r.productivityScore === null ? null : num(r.productivityScore)))),
      quality: avg(list.map((r) => (r.qualityScore === null ? null : num(r.qualityScore)))),
    };
  });
  // current month uses live progress when no review exists yet
  const last = trend[trend.length - 1];
  if (last.score === null && withPlans.length) {
    last.productivity = round2(withPlans.reduce((a, r) => a + r.monthly, 0) / withPlans.length);
    const q = withPlans.map((r) => r.quality).filter((x): x is number => x !== null);
    last.quality = q.length ? round2(q.reduce((a, b) => a + b, 0) / q.length) : null;
  }

  const stageCounts = await db.notionItemStage.groupBy({
    by: ["stageKey", "systemStatus"],
    where: { item: { isArchived: false } },
    _count: { _all: true },
  });
  const stageLabels = await db.notionFieldMapping.findMany({ where: { role: "STATUS" }, select: { stageKey: true, label: true } });

  // monthly goal progress aggregated by goal name across the team
  const goalAgg = new Map<string, { target: number; achieved: number }>();
  for (const e of employees)
    for (const g of e.monthlyPlans[0]?.goals ?? []) {
      if (g.status === "CANCELLED" || g.goalType === "PERCENTAGE" || g.goalType === "BOOLEAN") continue;
      const cur = goalAgg.get(g.name) ?? { target: 0, achieved: 0 };
      cur.target += num(g.targetValue);
      cur.achieved += num(g.achievedValue);
      goalAgg.set(g.name, cur);
    }

  return {
    today,
    year,
    month,
    rows,
    stats: {
      employees: rows.length,
      avgMonthly: withPlans.length ? round2(withPlans.reduce((a, r) => a + r.monthly, 0) / withPlans.length) : 0,
      delayed: rows.reduce((a, r) => a + r.delayed, 0),
      reportsPending: weeklyPending + monthlyPending,
      plansPending,
      pendingApproval: rows.reduce((a, r) => a + r.pendingApproval, 0),
      needsRevision: rows.reduce((a, r) => a + r.needsRevision, 0),
      withoutPlan: rows.filter((r) => !r.planId).length,
    },
    lowestCommitment: [...withPlans].sort((a, b) => a.monthly - b.monthly).slice(0, 3),
    trend,
    stages: stageCounts.map((s) => ({
      stageKey: s.stageKey,
      label: stageLabels.find((l) => l.stageKey === s.stageKey)?.label ?? s.stageKey,
      status: s.systemStatus,
      count: s._count._all,
    })),
    goalProgress: [...goalAgg.entries()].map(([name, v]) => ({ name, target: v.target, achieved: v.achieved, pct: v.target > 0 ? round2((v.achieved / v.target) * 100) : 0 })),
  };
}
