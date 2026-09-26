import { addDays, monthEnd, type DateKey } from "@/lib/dates";

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

/** A monthly draft is prepared on the month's last day so it is ready at close. */
export function isMonthDue(year: number, month: number, today: DateKey) {
  return monthEnd(year, month) <= today;
}

/** Date range (inclusive `from`, exclusive `before`) of week end dates worth checking. */
export function weeklyWindow(today: DateKey) {
  return { from: addDays(today, -WEEKLY_LOOKBACK_DAYS), before: today };
}

/** Year/month pairs whose report is due and still within the lookback window, newest first. */
export function dueMonths(today: DateKey) {
  const out: { year: number; month: number }[] = [];
  let year = +today.slice(0, 4);
  let month = +today.slice(5, 7);
  const oldest = addDays(today, -MONTHLY_LOOKBACK_DAYS);
  for (;;) {
    const end = monthEnd(year, month);
    if (end < oldest) break;
    if (end <= today) out.push({ year, month });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
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

export function monthsNeedingReport<
  T extends {
    year: number;
    month: number;
    planStatus: string;
    hasReport: boolean;
  },
>(plans: T[], today: DateKey): T[] {
  const due = new Set(dueMonths(today).map((m) => `${m.year}-${m.month}`));
  return plans.filter(
    (p) =>
      !p.hasReport &&
      isReportable(p.planStatus) &&
      due.has(`${p.year}-${p.month}`),
  );
}
