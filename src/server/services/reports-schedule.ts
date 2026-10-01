import { addDays, type DateKey } from "@/lib/dates";

/** Plan statuses whose weeks/months get an automatic report. */
export const REPORTABLE_PLAN_STATUSES = [
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;

/** How far back an ended week / month is still auto-reported. */
export const WEEKLY_LOOKBACK_DAYS = 35;
export const MONTHLY_LOOKBACK_DAYS = 45;

const isReportable = (status: string) =>
  (REPORTABLE_PLAN_STATUSES as readonly string[]).includes(status);

/** A week is reportable the day after its last day. */
export function isWeekEnded(weekEnd: DateKey, today: DateKey) {
  return weekEnd < today;
}

/** A plan's monthly report is due on its last execution day (not the calendar month end). */
export function isPlanDue(executionEnd: DateKey, today: DateKey) {
  return executionEnd <= today;
}

/** Date range (inclusive `from`, exclusive `before`) of week end dates worth checking. */
export function weeklyWindow(today: DateKey) {
  return { from: addDays(today, -WEEKLY_LOOKBACK_DAYS), before: today };
}

export function weeksNeedingReport<
  T extends { endDate: DateKey; planStatus: string; hasReport: boolean },
>(weeks: T[], today: DateKey): T[] {
  const { from } = weeklyWindow(today);
  return weeks.filter(
    (w) =>
      !w.hasReport &&
      isReportable(w.planStatus) &&
      isWeekEnded(w.endDate, today) &&
      w.endDate >= from,
  );
}

/** Plans whose execution ended (within the lookback) and still have no monthly report. */
export function plansNeedingReport<T extends { executionEnd: DateKey; planStatus: string; hasReport: boolean }>(plans: T[], today: DateKey): T[] {
  const oldest = addDays(today, -MONTHLY_LOOKBACK_DAYS);
  return plans.filter((p) => !p.hasReport && isReportable(p.planStatus) && isPlanDue(p.executionEnd, today) && p.executionEnd >= oldest);
}
