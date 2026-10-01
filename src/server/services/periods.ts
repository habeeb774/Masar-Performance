import "server-only";
import { db } from "@/server/db";
import { addDays, fromDateKey, monthEnd, monthStart, toDateKey, type DateKey } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";
import { UserError } from "@/server/action";

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
  return previous ? addDays((await planSpan(previous)).end, 1) : monthStart(year, month);
}

/**
 * Explicit execution dates win; historical weekly bounds and finally calendar
 * bounds provide backward compatibility without rewriting historical data.
 */
export async function planSpan(
  plan: { employeeId: string; year: number; month: number; executionStartDate?: Date | null; executionEndDate?: Date | null; weeklyPlans: { startDate: Date; endDate: Date }[] },
): Promise<{ start: DateKey; end: DateKey }> {
  const mStart = monthStart(plan.year, plan.month);
  const mEnd = monthEnd(plan.year, plan.month);
  const first = plan.weeklyPlans.map((w) => toDateKey(w.startDate)).sort()[0];
  const last = plan.weeklyPlans.map((w) => toDateKey(w.endDate)).sort().at(-1);
  return { start: plan.executionStartDate ? toDateKey(plan.executionStartDate) : first ?? mStart,
    end: plan.executionEndDate ? toDateKey(plan.executionEndDate) : last ?? mEnd };
}

export async function lockEmployeePeriods(tx: Prisma.TransactionClient, employeeId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
}

export async function assertNoPlanOverlap(tx: Prisma.TransactionClient, employeeId: string, start: string, end: string, exceptId?: string) {
  const plans = await tx.monthlyPlan.findMany({
    where: { employeeId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    include: { weeklyPlans: { select: { startDate: true, endDate: true } } },
  });
  for (const plan of plans) {
    const span = await planSpan(plan);
    if (span.start <= end && span.end >= start) throw new UserError("فترة الخطة تتداخل مع خطة أخرى لهذا الموظف");
  }
}

export function currentPlanWhere(today: string): Prisma.MonthlyPlanWhereInput {
  const date = fromDateKey(today);
  return { OR: [
    { executionStartDate: { lte: date }, executionEndDate: { gte: date } },
    { executionStartDate: null, weeklyPlans: { some: { startDate: { lte: date }, endDate: { gte: date } } } },
    { executionStartDate: null, weeklyPlans: { none: {} }, year: +today.slice(0, 4), month: +today.slice(5, 7) },
  ] };
}

export async function assertTaskInPlan(monthlyGoalId: string, date: string) {
  const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: monthlyGoalId }, include: { plan: { include: { weeklyPlans: true } } } });
  const span = await planSpan(goal.plan);
  if (date < span.start || date > span.end) throw new UserError("تاريخ المهمة خارج فترة تنفيذ الخطة");
}
