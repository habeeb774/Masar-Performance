/**
 * Calendar utilities. Calendar days are handled as `DateKey` strings (YYYY-MM-DD)
 * and persisted as UTC-midnight Date objects in `@db.Date` columns, so no
 * timezone drift can move a task to another day.
 */

export type DateKey = string;

export const DEFAULT_TZ = "Asia/Riyadh";

export const AR_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const AR_MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string): boolean {
  const m = KEY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return toDateKey(d) === value;
}

export function toDateKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

export function fromDateKey(key: DateKey): Date {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** Current calendar day in the given timezone. */
export function todayKey(tz: string = DEFAULT_TZ, now: Date = new Date()): DateKey {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((fromDateKey(a).getTime() - fromDateKey(b).getTime()) / 86_400_000);
}

export function dayOfWeek(key: DateKey): number {
  return fromDateKey(key).getUTCDay();
}

export function eachDay(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

export function monthStart(year: number, month: number): DateKey {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthEnd(year: number, month: number): DateKey {
  const d = new Date(Date.UTC(year, month, 0));
  return toDateKey(d);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function startOfWeek(key: DateKey, weekStartDay: number): DateKey {
  const offset = (dayOfWeek(key) - weekStartDay + 7) % 7;
  return addDays(key, -offset);
}

export function isWorkDay(key: DateKey, workDays: number[]): boolean {
  return workDays.includes(dayOfWeek(key));
}

export interface MonthWeek {
  index: number;
  /** first day (getMonthWeeks: clamped to the month; planWeekPeriods: not clamped) */
  start: DateKey;
  /** last day (getMonthWeeks: clamped to the month; planWeekPeriods: may be in the next month) */
  end: DateKey;
  workDays: DateKey[];
}

/**
 * Working weeks of a month. A week is kept only when it contains at least one
 * working day inside the month; days outside the month are excluded.
 */
export function getMonthWeeks(
  year: number,
  month: number,
  weekStartDay: number,
  workDays: number[],
): MonthWeek[] {
  const first = monthStart(year, month);
  const last = monthEnd(year, month);
  const weeks: MonthWeek[] = [];
  let cursor = startOfWeek(first, weekStartDay);
  while (cursor <= last) {
    const weekEnd = addDays(cursor, 6);
    const start = cursor < first ? first : cursor;
    const end = weekEnd > last ? last : weekEnd;
    const days = eachDay(start, end).filter((d) => isWorkDay(d, workDays));
    if (days.length > 0) {
      weeks.push({ index: weeks.length + 1, start, end, workDays: days });
    }
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/**
 * Plan periods («الفترات»): consecutive blocks of exactly 7 calendar days, the
 * first starting on `start`, each next one on the day after the previous ends,
 * for the requested number of weeks. Legacy end-date callers are rounded up to
 * whole weeks. Neither calendar weeks nor month boundaries truncate a period.
 */
export function executionEndDate(start: DateKey, weeksCount: number): DateKey {
  if (!isDateKey(start) || !Number.isInteger(weeksCount) || weeksCount < 1 || weeksCount > 52) {
    throw new Error("فترة تنفيذ غير صالحة: عدد الأسابيع يجب أن يكون بين 1 و52");
  }
  return addDays(start, weeksCount * 7 - 1);
}

export function planWeekPeriods(start: DateKey, countOrLegacyEnd: number | DateKey, workDays: number[]): MonthWeek[] {
  const count = typeof countOrLegacyEnd === "number" ? countOrLegacyEnd : Math.max(0, Math.ceil((diffDays(countOrLegacyEnd, start) + 1) / 7));
  if (count === 0 && typeof countOrLegacyEnd === "string") return [];
  const end = executionEndDate(start, count);
  const weeks: MonthWeek[] = [];
  for (let cursor = start; cursor <= end; ) {
    const periodEnd = addDays(cursor, 6);
    weeks.push({ index: weeks.length + 1, start: cursor, end: periodEnd, workDays: eachDay(cursor, periodEnd).filter((d) => isWorkDay(d, workDays)) });
    cursor = addDays(periodEnd, 1);
  }
  return weeks;
}

export function formatDateAr(key: DateKey | Date | null | undefined): string {
  if (!key) return "—";
  const k = typeof key === "string" ? key : toDateKey(key);
  const d = fromDateKey(k);
  return `${d.getUTCDate()} ${AR_MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDayAr(key: DateKey): string {
  return `${AR_DAY_NAMES[dayOfWeek(key)]} ${formatDateAr(key)}`;
}

export function monthLabel(year: number, month: number): string {
  return `${AR_MONTH_NAMES[month - 1]} ${year}`;
}

export function currentYearMonth(tz: string = DEFAULT_TZ, now: Date = new Date()) {
  const key = todayKey(tz, now);
  return { year: +key.slice(0, 4), month: +key.slice(5, 7) };
}

export function shiftMonth(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function formatDateTimeAr(date: Date | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
