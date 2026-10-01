import "server-only";
import { db } from "@/server/db";
import { fromDateKey, monthStart, type DateKey } from "@/lib/dates";
import { nextPlanStart, periodsOverlap, resolveExecutionPeriod, type PlanPeriodLike } from "@/lib/execution-period";
import type { Prisma } from "@/generated/prisma/client";
import { UserError } from "@/server/user-error";

/**
 * Start immediately after the employee's latest preceding administrative plan,
 * even when months were skipped. With no predecessor, use the calendar first.
 */
export async function firstPeriodStart(employeeId: string, year: number, month: number, tx: Prisma.TransactionClient = db): Promise<DateKey> {
  const previous = await tx.monthlyPlan.findFirst({
    where: { employeeId, OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { weeklyPlans: { select: { startDate: true, endDate: true } } },
  });
  return previous ? nextPlanStart(resolveExecutionPeriod(previous).end) : monthStart(year, month);
}

/** A plan's execution span (see resolveExecutionPeriod for the legacy fallbacks). */
export async function planSpan(plan: PlanPeriodLike): Promise<{ start: DateKey; end: DateKey }> {
  const { start, end } = resolveExecutionPeriod(plan);
  return { start, end };
}

export async function lockEmployeePeriods(tx: Prisma.TransactionClient, employeeId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
}

export async function assertNoPlanOverlap(tx: Prisma.TransactionClient, employeeId: string, start: string, end: string, exceptId?: string) {
  const plans = await tx.monthlyPlan.findMany({
    where: { employeeId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    include: { weeklyPlans: { select: { startDate: true, endDate: true } } },
  });
  if (plans.some((plan) => periodsOverlap({ start, end }, resolveExecutionPeriod(plan)))) throw new UserError("فترة الخطة تتداخل مع خطة أخرى لهذا الموظف");
}

/** Plans whose execution period contains `today` (indexed on employeeId + execution dates). */
export function currentPlanWhere(today: string): Prisma.MonthlyPlanWhereInput {
  const date = fromDateKey(today);
  return { OR: [
    { executionStartDate: { lte: date }, executionEndDate: { gte: date } },
    // legacy plans that never got execution fields
    { executionStartDate: null, weeklyPlans: { some: { startDate: { lte: date }, endDate: { gte: date } } } },
    { executionStartDate: null, weeklyPlans: { none: {} }, year: +today.slice(0, 4), month: +today.slice(5, 7) },
  ] };
}

/** The employee's plan running on `date`, or null (e.g. a gap between two plans). */
export async function findCurrentPlan(employeeId: string, date: DateKey) {
  return db.monthlyPlan.findFirst({ where: { employeeId, ...currentPlanWhere(date) }, orderBy: [{ year: "desc" }, { month: "desc" }] });
}

/**
 * Administrative month to open by default on `date`: the plan running that day (for one
 * employee, or the most common one across plans), never just the calendar month —
 * on 1–2 Oct a plan named September may still be running.
 */
export async function currentPlanMonth(date: DateKey, employeeId?: string | null): Promise<{ year: number; month: number }> {
  if (employeeId) {
    const plan = await findCurrentPlan(employeeId, date);
    if (plan) return { year: plan.year, month: plan.month };
  } else {
    const rows = await db.monthlyPlan.groupBy({ by: ["year", "month"], where: currentPlanWhere(date), _count: { _all: true } });
    const best = rows.sort((a, b) => b._count._all - a._count._all || b.year - a.year || b.month - a.month)[0];
    if (best) return { year: best.year, month: best.month };
  }
  return { year: +date.slice(0, 4), month: +date.slice(5, 7) };
}

export async function assertTaskInPlan(monthlyGoalId: string, date: string) {
  const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: monthlyGoalId }, include: { plan: { include: { weeklyPlans: true } } } });
  const span = resolveExecutionPeriod(goal.plan);
  if (date < span.start || date > span.end) throw new UserError("تاريخ المهمة خارج فترة تنفيذ الخطة");
}
