import "server-only";
import { db } from "@/server/db";
import { addDays, monthEnd, monthStart, shiftMonth, toDateKey, type DateKey } from "@/lib/dates";

/**
 * First day of a plan's periods: the 1st of the month, or — when the same
 * employee's previous-month plan has a period still running into this month —
 * the day after that period ends. That period stays with the previous plan until
 * its end, so consecutive plans never overlap.
 */
export async function firstPeriodStart(employeeId: string, year: number, month: number): Promise<DateKey> {
  const natural = monthStart(year, month);
  const prev = shiftMonth(year, month, -1);
  const last = await db.weeklyPlan.findFirst({
    where: { employeeId, monthlyPlan: { year: prev.year, month: prev.month } },
    orderBy: { endDate: "desc" },
    select: { endDate: true },
  });
  const lastEnd = last ? toDateKey(last.endDate) : null;
  return lastEnd && lastEnd >= natural ? addDays(lastEnd, 1) : natural;
}

/**
 * The days a plan actually covers. With 7-day periods that is first period start →
 * last period end (it may begin after the 1st and end in the next month). Plans made
 * before that rule keep the calendar month, so nothing already recorded moves.
 */
export async function planSpan(
  plan: { employeeId: string; year: number; month: number; weeklyPlans: { startDate: Date; endDate: Date }[] },
): Promise<{ start: DateKey; end: DateKey }> {
  const mStart = monthStart(plan.year, plan.month);
  const mEnd = monthEnd(plan.year, plan.month);
  if (plan.weeklyPlans.length === 0) return { start: mStart, end: mEnd };
  const first = plan.weeklyPlans.map((w) => toDateKey(w.startDate)).sort()[0];
  const last = plan.weeklyPlans.map((w) => toDateKey(w.endDate)).sort().at(-1)!;
  // a later first day only counts when the previous plan's running period really covers the gap
  const start = first > mStart && first === (await firstPeriodStart(plan.employeeId, plan.year, plan.month)) ? first : mStart;
  return { start, end: last > mEnd ? last : mEnd };
}
