import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import type { AuthUser } from "@/server/auth/session";
import { UserError } from "@/server/user-error";
import { fromDateKey, monthEnd, monthStart, toDateKey, type DateKey } from "@/lib/dates";
import { calculateExecutionPeriod, resolveExecutionPeriod } from "@/lib/execution-period";
import { num } from "@/lib/num";
import { getCompanyFresh } from "./company";
import { assertNoPlanOverlap, lockEmployeePeriods } from "./periods";
import { rebuildPlanPeriods } from "./rebuild-plan-periods";

/**
 * Changing when a plan runs — generic for every plan, never month-specific.
 *
 * - rebuildPlanExecutionPeriod: move an existing plan's weeks, keeping identities, achievement,
 *   completed tasks and reports (pending distributed tasks are re-scheduled). Preview = the same
 *   rebuild run inside a transaction that is rolled back, so the preview is exactly what --apply does.
 * - resetPlanExecutionPeriod: clean start — drop the plan's weeks, weekly goals, reports and
 *   generated pending tasks, then regenerate them from the new period. Goals are kept.
 * - purgePlans: delete whole historical plans (with their tasks, reports, attachments, comments).
 */

const TX = { timeout: 120_000, maxWait: 20_000 };
const ACTIVE = ["APPROVED", "IN_PROGRESS"];

type WeekRow = { id: string; index: number; start: DateKey; end: DateKey; reportId: string | null };
type TaskRow = { id: string; date: DateKey; status: string; source: string; weeklyGoalId: string | null; target: number; achieved: number };

interface Snapshot {
  start: DateKey;
  end: DateKey;
  weeksCount: number;
  weeks: WeekRow[];
  weeklyGoals: Map<string, { weeklyPlanId: string; target: number }>;
  tasks: Map<string, TaskRow>;
}

async function snapshot(tx: Prisma.TransactionClient, planId: string): Promise<Snapshot> {
  const plan = await tx.monthlyPlan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      weeklyPlans: { orderBy: { weekIndex: "asc" }, include: { report: { select: { id: true } }, goals: { select: { id: true, weeklyPlanId: true, targetValue: true } } } },
      goals: { select: { dailyTasks: { select: { id: true, date: true, status: true, source: true, weeklyGoalId: true, target: true, achieved: true } } } },
    },
  });
  const span = resolveExecutionPeriod(plan);
  return {
    ...span,
    weeks: plan.weeklyPlans.map((w) => ({ id: w.id, index: w.weekIndex, start: toDateKey(w.startDate), end: toDateKey(w.endDate), reportId: w.report?.id ?? null })),
    weeklyGoals: new Map(plan.weeklyPlans.flatMap((w) => w.goals.map((g) => [g.id, { weeklyPlanId: g.weeklyPlanId, target: num(g.targetValue) }] as const))),
    tasks: new Map(
      plan.goals.flatMap((g) => g.dailyTasks).map((t) => [t.id, { id: t.id, date: toDateKey(t.date), status: t.status, source: t.source, weeklyGoalId: t.weeklyGoalId, target: num(t.target), achieved: num(t.achieved) }] as const),
    ),
  };
}

const isProtected = (t: { status: string; achieved: number; source: string }) => t.status === "COMPLETED" || t.achieved > 0 || t.source !== "DISTRIBUTED";
const periodOf = (s: { start: DateKey; end: DateKey; weeksCount: number; weeks: WeekRow[] }) => ({ start: s.start, end: s.end, weeksCount: s.weeksCount, weeks: s.weeks.map((w) => `${w.index}: ${w.start} → ${w.end}`) });

export interface PeriodChangeReport {
  planId: string;
  mode: "rebuild" | "reset";
  applied: boolean;
  before: { start: DateKey; end: DateKey; weeksCount: number; weeks: string[] };
  after: { start: DateKey; end: DateKey; weeksCount: number; weeks: string[] };
  weeklyPlansRemoved: number;
  weeklyPlansCreated: number;
  weeklyPlansMoved: number;
  weeklyGoalsAffected: number;
  dailyTasks: { moved: number; created: number; removed: number; cancelled: number };
  protectedCompletedTasks: number;
  reportsAffected: number;
  reportsRemoved: number;
  conflicts: string[];
}

function diff(planId: string, mode: PeriodChangeReport["mode"], before: Snapshot, after: Snapshot, conflicts: string[], applied: boolean): PeriodChangeReport {
  const afterWeeks = new Map(after.weeks.map((w) => [w.id, w]));
  const beforeWeeks = new Map(before.weeks.map((w) => [w.id, w]));
  let moved = 0, created = 0, removed = 0, cancelled = 0;
  for (const [id, t] of before.tasks) {
    const a = after.tasks.get(id);
    if (!a) removed++;
    else if (a.status === "CANCELLED" && t.status !== "CANCELLED") cancelled++;
    else if (a.date !== t.date || a.weeklyGoalId !== t.weeklyGoalId) moved++;
  }
  for (const id of after.tasks.keys()) if (!before.tasks.has(id)) created++;
  const wgChanged = [...before.weeklyGoals].filter(([id, g]) => after.weeklyGoals.get(id)?.target !== g.target).length + [...after.weeklyGoals.keys()].filter((id) => !before.weeklyGoals.has(id)).length;
  const reportWeeks = before.weeks.filter((w) => w.reportId);
  return {
    planId,
    mode,
    applied,
    before: periodOf(before),
    after: periodOf(after),
    weeklyPlansRemoved: before.weeks.filter((w) => !afterWeeks.has(w.id)).length,
    weeklyPlansCreated: after.weeks.filter((w) => !beforeWeeks.has(w.id)).length,
    weeklyPlansMoved: before.weeks.filter((w) => afterWeeks.has(w.id) && (afterWeeks.get(w.id)!.start !== w.start || afterWeeks.get(w.id)!.end !== w.end)).length,
    weeklyGoalsAffected: wgChanged,
    dailyTasks: { moved, created, removed, cancelled },
    protectedCompletedTasks: [...before.tasks.values()].filter((t) => t.status === "COMPLETED" && after.tasks.has(t.id)).length,
    reportsAffected: reportWeeks.filter((w) => afterWeeks.has(w.id) && (afterWeeks.get(w.id)!.start !== w.start || afterWeeks.get(w.id)!.end !== w.end)).length,
    reportsRemoved: reportWeeks.filter((w) => !afterWeeks.has(w.id)).length,
    conflicts,
  };
}

/** Thrown inside a transaction to roll a preview back while carrying its result out. */
class Rollback extends Error {
  constructor(readonly report: PeriodChangeReport) {
    super("rollback");
  }
}

async function runOrPreview(apply: boolean, work: (tx: Prisma.TransactionClient) => Promise<PeriodChangeReport>): Promise<PeriodChangeReport> {
  try {
    return await db.$transaction(async (tx) => {
      const report = await work(tx);
      if (!apply || report.conflicts.length > 0) throw new Rollback({ ...report, applied: false });
      return report;
    }, TX);
  } catch (e) {
    if (e instanceof Rollback) return e.report;
    throw e;
  }
}

function auditRebuild(user: AuthUser | null, r: PeriodChangeReport, tx: Prisma.TransactionClient) {
  return audit(
    {
      user,
      action: "plan.execution_period_rebuilt",
      entityType: "MonthlyPlan",
      entityId: r.planId,
      before: r.before,
      after: {
        ...r.after,
        mode: r.mode,
        affectedWeeklyPlans: { removed: r.weeklyPlansRemoved, created: r.weeklyPlansCreated, moved: r.weeklyPlansMoved },
        affectedTasks: r.dailyTasks,
        protectedCompletedTasks: r.protectedCompletedTasks,
        reports: { affected: r.reportsAffected, removed: r.reportsRemoved },
      },
    },
    tx,
  );
}

/**
 * Move an existing plan to `executionStartDate` + `weeksCount`, keeping everything recorded.
 * With apply=false (or any conflict) nothing is written and the report is the preview.
 */
export async function rebuildPlanExecutionPeriod(
  planId: string,
  options: { executionStartDate: DateKey; weeksCount: number; apply: boolean; user?: AuthUser | null },
): Promise<PeriodChangeReport> {
  const { workDays } = await getCompanyFresh();
  calculateExecutionPeriod(options.executionStartDate, options.weeksCount); // validates
  const report = await runOrPreview(options.apply, async (tx) => {
    const before = await snapshot(tx, planId);
    const conflicts: string[] = [];
    try {
      await rebuildPlanPeriods(planId, options.executionStartDate, options.weeksCount, workDays, tx, { start: before.start, end: before.end });
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      conflicts.push(e.message);
      return diff(planId, "rebuild", before, before, conflicts, false);
    }
    const after = await snapshot(tx, planId);
    const r = diff(planId, "rebuild", before, after, conflicts, options.apply);
    if (options.apply) await auditRebuild(options.user ?? null, r, tx);
    return r;
  });
  if (report.applied) {
    const { recomputePlan } = await import("./progress");
    await recomputePlan(planId);
  }
  return report;
}

/**
 * Clean start for one plan: its weeks, weekly goals, weekly / monthly reports and generated
 * pending tasks are dropped and regenerated from the new period. Goals stay. Completed,
 * manual or achieved tasks are never deleted — they stay on the goal and, when they fall
 * outside the new period, are listed as conflicts (which block --apply).
 */
export async function resetPlanExecutionPeriod(
  planId: string,
  options: { executionStartDate: DateKey; weeksCount: number; apply: boolean; user?: AuthUser | null },
): Promise<PeriodChangeReport> {
  const period = calculateExecutionPeriod(options.executionStartDate, options.weeksCount);
  let kept = 0;
  const report = await runOrPreview(options.apply, async (tx) => {
    const plan = await tx.monthlyPlan.findUniqueOrThrow({
      where: { id: planId },
      include: { goals: { select: { id: true, name: true, startDate: true, dueDate: true, manualAdjust: true } }, weeklyPlans: { select: { id: true, startDate: true, endDate: true, report: { select: { id: true } } } }, report: { select: { id: true } } },
    });
    await lockEmployeePeriods(tx, plan.employeeId);
    const before = await snapshot(tx, planId);
    const conflicts: string[] = [];
    try {
      await assertNoPlanOverlap(tx, plan.employeeId, period.startDate, period.endDate, planId);
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      conflicts.push(e.message);
    }
    const tasks = [...before.tasks.values()];
    const keep = tasks.filter(isProtected);
    for (const t of keep) if (t.status !== "CANCELLED" && (t.date < period.startDate || t.date > period.endDate)) conflicts.push(`مهمة ${t.id} (${t.status}، ${t.date}) خارج الفترة الجديدة — لن تحذف`);
    for (const g of plan.goals) if (num(g.manualAdjust) !== 0) conflicts.push(`إنجاز يدوي بلا أسابيع على الهدف «${g.name}» (${num(g.manualAdjust)}) — يحتاج مراجعة`);
    const drop = tasks.filter((t) => !isProtected(t)).map((t) => t.id);
    kept = keep.length;

    const reportIds = plan.weeklyPlans.flatMap((w) => (w.report ? [w.report.id] : []));
    await tx.attachment.deleteMany({ where: { OR: [{ entityType: "WEEKLY_REPORT", entityId: { in: reportIds } }, { entityType: "DAILY_TASK", entityId: { in: drop } }, ...(plan.report ? [{ entityType: "MONTHLY_REPORT" as const, entityId: plan.report.id }] : [])] } });
    await tx.comment.deleteMany({ where: { OR: [{ entityType: "WEEKLY_REPORT", entityId: { in: reportIds } }, { entityType: "DAILY_TASK", entityId: { in: drop } }, ...(plan.report ? [{ entityType: "MONTHLY_REPORT" as const, entityId: plan.report.id }] : [])] } });
    await tx.dailyTask.deleteMany({ where: { id: { in: drop } } });
    if (plan.report) await tx.monthlyReport.delete({ where: { id: plan.report.id } });
    // weekly goals and weekly reports go with their weeks (cascade); kept tasks lose their week link
    await tx.weeklyPlan.deleteMany({ where: { monthlyPlanId: planId } });

    // goals following the old default bounds follow the new period; explicit dates inside it stay
    const old = { start: before.start, end: before.end };
    for (const g of plan.goals) {
      const s = g.startDate ? toDateKey(g.startDate) : null;
      const d = g.dueDate ? toDateKey(g.dueDate) : null;
      const start = !s || s === old.start || s === monthStart(plan.year, plan.month) || s < period.startDate || s > period.endDate ? period.startDate : s;
      const due = !d || d === old.end || d === monthEnd(plan.year, plan.month) || d > period.endDate || d < start ? period.endDate : d;
      await tx.monthlyGoal.update({ where: { id: g.id }, data: { startDate: fromDateKey(start), dueDate: fromDateKey(due), achievedValue: 0, progressPct: 0, lastComputedAt: null } });
    }
    await tx.monthlyPlan.update({ where: { id: planId }, data: { executionStartDate: fromDateKey(period.startDate), executionEndDate: fromDateKey(period.endDate), weeksCount: options.weeksCount } });

    const after: Snapshot = {
      start: period.startDate,
      end: period.endDate,
      weeksCount: options.weeksCount,
      weeks: period.weeks.map((w) => ({ id: `new-${w.index}`, index: w.index, start: w.startDate, end: w.endDate, reportId: null })),
      weeklyGoals: new Map(),
      tasks: new Map(keep.map((t) => [t.id, t])),
    };
    const r = { ...diff(planId, "reset", before, after, conflicts, options.apply), reportsRemoved: reportIds.length + (plan.report ? 1 : 0), reportsAffected: 0 };
    if (options.apply && conflicts.length === 0) await auditRebuild(options.user ?? null, r, tx);
    return r;
  });
  if (!report.applied) return report;

  // regenerate weeks, weekly goals and daily tasks from the new period
  const plans = await import("./plans");
  const { recomputePlan } = await import("./progress");
  const plan = await db.monthlyPlan.findUniqueOrThrow({ where: { id: planId }, select: { status: true, createdById: true } });
  await plans.ensureWeeklyPlans(planId);
  if (ACTIVE.includes(plan.status)) await plans.autoDistributePlan(planId, options.user?.id ?? plan.createdById);
  await recomputePlan(planId);
  const created = (await db.dailyTask.count({ where: { monthlyGoal: { planId } } })) - kept;
  return { ...report, weeklyPlansCreated: options.weeksCount, dailyTasks: { ...report.dailyTasks, created } };
}

export interface PurgeReport {
  applied: boolean;
  plans: { id: string; employeeId: string; year: number; month: number }[];
  counts: { monthlyPlans: number; monthlyGoals: number; weeklyPlans: number; weeklyGoals: number; dailyTasks: number; weeklyReports: number; monthlyReports: number; attachments: number; comments: number };
}

/** Delete whole plans (administrative month before `before`) with everything hanging off them. */
export async function purgePlans(where: Prisma.MonthlyPlanWhereInput, apply: boolean, user: AuthUser | null = null): Promise<PurgeReport> {
  const plans = await db.monthlyPlan.findMany({
    where,
    select: {
      id: true,
      employeeId: true,
      year: true,
      month: true,
      report: { select: { id: true } },
      goals: { select: { id: true, dailyTasks: { select: { id: true } } } },
      weeklyPlans: { select: { id: true, report: { select: { id: true } }, _count: { select: { goals: true } } } },
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const planIds = plans.map((p) => p.id);
  const goalIds = plans.flatMap((p) => p.goals.map((g) => g.id));
  const taskIds = plans.flatMap((p) => p.goals.flatMap((g) => g.dailyTasks.map((t) => t.id)));
  const weeklyReportIds = plans.flatMap((p) => p.weeklyPlans.flatMap((w) => (w.report ? [w.report.id] : [])));
  const monthlyReportIds = plans.flatMap((p) => (p.report ? [p.report.id] : []));
  const attachmentWhere: Prisma.AttachmentWhereInput = {
    OR: [
      { entityType: "DAILY_TASK", entityId: { in: taskIds } },
      { entityType: "WEEKLY_REPORT", entityId: { in: weeklyReportIds } },
      { entityType: "MONTHLY_REPORT", entityId: { in: monthlyReportIds } },
      { entityType: "MONTHLY_GOAL", entityId: { in: goalIds } },
    ],
  };
  const commentWhere: Prisma.CommentWhereInput = {
    OR: [
      { entityType: "MONTHLY_PLAN", entityId: { in: planIds } },
      { entityType: "MONTHLY_GOAL", entityId: { in: goalIds } },
      { entityType: "DAILY_TASK", entityId: { in: taskIds } },
      { entityType: "WEEKLY_REPORT", entityId: { in: weeklyReportIds } },
      { entityType: "MONTHLY_REPORT", entityId: { in: monthlyReportIds } },
    ],
  };
  const [attachments, comments] = await Promise.all([db.attachment.count({ where: attachmentWhere }), db.comment.count({ where: commentWhere })]);
  const report: PurgeReport = {
    applied: false,
    plans: plans.map(({ id, employeeId, year, month }) => ({ id, employeeId, year, month })),
    counts: {
      monthlyPlans: plans.length,
      monthlyGoals: goalIds.length,
      weeklyPlans: plans.reduce((a, p) => a + p.weeklyPlans.length, 0),
      weeklyGoals: plans.reduce((a, p) => a + p.weeklyPlans.reduce((b, w) => b + w._count.goals, 0), 0),
      dailyTasks: taskIds.length,
      weeklyReports: weeklyReportIds.length,
      monthlyReports: monthlyReportIds.length,
      attachments,
      comments,
    },
  };
  if (!apply || plans.length === 0) return report;
  await db.$transaction(async (tx) => {
    await tx.attachment.deleteMany({ where: attachmentWhere });
    await tx.comment.deleteMany({ where: commentWhere });
    // DailyTask → MonthlyGoal is SetNull: delete the tasks explicitly so none is orphaned
    await tx.dailyTask.deleteMany({ where: { id: { in: taskIds } } });
    // goals, weeks, weekly goals and weekly / monthly reports cascade with the plan
    await tx.monthlyPlan.deleteMany({ where: { id: { in: planIds } } });
    await audit({ user, action: "plan.purged", entityType: "MonthlyPlan", before: report.plans, after: report.counts }, tx);
  }, TX);
  return { ...report, applied: true };
}
