/**
 * Execution periods — the one source of truth for when a plan runs.
 *
 * A MonthlyPlan's year/month is only its administrative name («خطة أكتوبر 2026»): label,
 * archive, filters, MonthPicker. When it runs is `executionStartDate` + `weeksCount`:
 *   end = start + weeksCount × 7 − 1, every week = 7 full calendar days, never cut at a month end.
 */
import { addDays, diffDays, executionEndDate, isDateKey, monthEnd, monthStart, planWeekPeriods, toDateKey, type DateKey } from "./dates";

export const DEFAULT_WEEKS_COUNT = 4;

export interface ExecutionPeriod {
  startDate: DateKey;
  endDate: DateKey;
  weeks: { index: number; startDate: DateKey; endDate: DateKey }[];
}

export function calculateExecutionPeriod(startDate: DateKey, weeksCount: number): ExecutionPeriod {
  const endDate = executionEndDate(startDate, weeksCount);
  const weeks = planWeekPeriods(startDate, weeksCount, []).map((w) => ({ index: w.index, startDate: w.start, endDate: w.end }));
  return { startDate, endDate, weeks };
}

export type PlanPeriodLike = {
  year: number;
  month: number;
  executionStartDate?: Date | null;
  executionEndDate?: Date | null;
  weeksCount?: number | null;
  weeklyPlans?: { startDate: Date; endDate: Date }[];
};

/**
 * resolveExecutionPeriod: 1) stored execution fields, 2) legacy plans: first/last weekly plan,
 * 3) last resort for a legacy plan with no weeks: the calendar month. New plans always have 1).
 */
export function resolveExecutionPeriod(plan: PlanPeriodLike): { start: DateKey; end: DateKey; weeksCount: number } {
  if (plan.executionStartDate) {
    const start = toDateKey(plan.executionStartDate);
    const weeksCount = plan.weeksCount ?? null;
    // the stored end is kept consistent by every write; derive it only when it is missing
    const end = plan.executionEndDate ? toDateKey(plan.executionEndDate) : executionEndDate(start, weeksCount ?? DEFAULT_WEEKS_COUNT);
    return { start, end, weeksCount: weeksCount ?? Math.ceil(dayCount(start, end) / 7) };
  }
  const weeks = plan.weeklyPlans ?? [];
  if (weeks.length > 0) {
    const start = weeks.map((w) => toDateKey(w.startDate)).sort()[0];
    const end = weeks.map((w) => toDateKey(w.endDate)).sort().at(-1)!;
    return { start, end, weeksCount: weeks.length };
  }
  const start = monthStart(plan.year, plan.month);
  const end = monthEnd(plan.year, plan.month);
  return { start, end, weeksCount: Math.ceil(dayCount(start, end) / 7) };
}

const dayCount = (start: DateKey, end: DateKey) => diffDays(end, start) + 1;

export const getPlanExecutionStart = (plan: PlanPeriodLike) => resolveExecutionPeriod(plan).start;
export const getPlanExecutionEnd = (plan: PlanPeriodLike) => resolveExecutionPeriod(plan).end;
export const getPlanWeeksCount = (plan: PlanPeriodLike) => resolveExecutionPeriod(plan).weeksCount;

export function isDateInsidePlan(plan: PlanPeriodLike, date: DateKey) {
  const { start, end } = resolveExecutionPeriod(plan);
  return date >= start && date <= end;
}

/** Inclusive ranges overlap: newStart <= existingEnd AND newEnd >= existingStart. */
export const periodsOverlap = (a: { start: DateKey; end: DateKey }, b: { start: DateKey; end: DateKey }) => a.start <= b.end && a.end >= b.start;

/** The next plan starts the day after the previous one ends. */
export const nextPlanStart = (previousEnd: DateKey) => addDays(previousEnd, 1);

/** Validate a stored triple: weeksCount ≥ 1 and end = start + weeksCount × 7 − 1. */
export function assertConsistentPeriod(start: string, weeksCount: number, end?: string | null) {
  if (!isDateKey(start)) throw new Error("تاريخ بداية التنفيذ غير صالح");
  const expected = executionEndDate(start, weeksCount);
  if (end && end !== expected) throw new Error(`نهاية التنفيذ يجب أن تكون ${expected}`);
  return expected;
}
