import { describe, expect, it } from "vitest";
import { diffDays } from "@/lib/dates";
import {
  assertConsistentPeriod,
  calculateExecutionPeriod,
  getPlanExecutionEnd,
  getPlanExecutionStart,
  getPlanWeeksCount,
  isDateInsidePlan,
  nextPlanStart,
  periodsOverlap,
  resolveExecutionPeriod,
} from "@/lib/execution-period";

const d = (k: string) => new Date(`${k}T00:00:00Z`);
const plan = (start: string, weeks: number, ym: [number, number]) => {
  const p = calculateExecutionPeriod(start, weeks);
  return { year: ym[0], month: ym[1], executionStartDate: d(p.startDate), executionEndDate: d(p.endDate), weeksCount: weeks };
};
const september = plan("2026-09-05", 4, [2026, 9]);
const october = plan("2026-10-03", 4, [2026, 10]);

describe("calculateExecutionPeriod", () => {
  it("September: 5 Sep → 2 Oct, 4 full weeks", () => {
    expect(calculateExecutionPeriod("2026-09-05", 4)).toEqual({
      startDate: "2026-09-05",
      endDate: "2026-10-02",
      weeks: [
        { index: 1, startDate: "2026-09-05", endDate: "2026-09-11" },
        { index: 2, startDate: "2026-09-12", endDate: "2026-09-18" },
        { index: 3, startDate: "2026-09-19", endDate: "2026-09-25" },
        { index: 4, startDate: "2026-09-26", endDate: "2026-10-02" },
      ],
    });
  });

  it("October: 3 Oct → 30 Oct, no 5th week; the next plan starts 31 Oct", () => {
    const p = calculateExecutionPeriod("2026-10-03", 4);
    expect(p.endDate).toBe("2026-10-30");
    expect(p.weeks.map((w) => [w.startDate, w.endDate])).toEqual([
      ["2026-10-03", "2026-10-09"],
      ["2026-10-10", "2026-10-16"],
      ["2026-10-17", "2026-10-23"],
      ["2026-10-24", "2026-10-30"],
    ]);
    expect(nextPlanStart(p.endDate)).toBe("2026-10-31");
    expect(nextPlanStart(calculateExecutionPeriod("2026-09-05", 4).endDate)).toBe("2026-10-03");
  });

  it("each week: end − start = 6 days (7 inclusive), across Sep 30, Oct 31, Dec 31 and the year", () => {
    for (const start of ["2026-09-26", "2026-10-28", "2026-12-29", "2026-12-20"]) {
      for (const w of calculateExecutionPeriod(start, 4).weeks) expect(diffDays(w.endDate, w.startDate)).toBe(6);
    }
  });

  it("year boundary: 20 Dec 2026 + 4 weeks runs into January 2027", () => {
    const p = calculateExecutionPeriod("2026-12-20", 4);
    expect(p.endDate).toBe("2027-01-16");
    expect(p.weeks.at(-1)).toEqual({ index: 4, startDate: "2027-01-10", endDate: "2027-01-16" });
  });

  it("validates the stored triple", () => {
    expect(assertConsistentPeriod("2026-10-03", 4, "2026-10-30")).toBe("2026-10-30");
    expect(() => assertConsistentPeriod("2026-10-03", 4, "2026-10-31")).toThrow();
    for (const n of [0, -1, 1.5]) expect(() => calculateExecutionPeriod("2026-10-03", n)).toThrow();
  });
});

describe("current plan by execution period, not by calendar month", () => {
  const running = (date: string) => [september, october].find((p) => isDateInsidePlan(p, date)) ?? null;
  it.each([
    ["2026-09-05", 9],
    ["2026-10-01", 9],
    ["2026-10-02", 9],
    ["2026-10-03", 10],
    ["2026-10-30", 10],
  ])("%s → plan of month %i", (date, month) => {
    expect(running(date)?.month).toBe(month);
  });
  it("2026-10-31 → the next plan only (none here)", () => expect(running("2026-10-31")).toBeNull());
});

describe("overlap", () => {
  const a = { start: "2026-09-05", end: "2026-10-02" };
  it("1 Oct – 28 Oct overlaps 5 Sep – 2 Oct", () => expect(periodsOverlap(a, { start: "2026-10-01", end: "2026-10-28" })).toBe(true));
  it("3 Oct – 30 Oct does not", () => expect(periodsOverlap(a, { start: "2026-10-03", end: "2026-10-30" })).toBe(false));
  it("touching on one day is an overlap", () => expect(periodsOverlap(a, { start: "2026-10-02", end: "2026-10-29" })).toBe(true));
});

describe("resolveExecutionPeriod (legacy fallbacks)", () => {
  it("1) stored execution fields", () => {
    expect(resolveExecutionPeriod(october)).toEqual({ start: "2026-10-03", end: "2026-10-30", weeksCount: 4 });
    expect([getPlanExecutionStart(october), getPlanExecutionEnd(october), getPlanWeeksCount(october)]).toEqual(["2026-10-03", "2026-10-30", 4]);
  });
  it("2) first / last weekly plan", () => {
    const legacy = { year: 2026, month: 8, weeklyPlans: [{ startDate: d("2026-08-08"), endDate: d("2026-08-14") }, { startDate: d("2026-08-01"), endDate: d("2026-08-07") }] };
    expect(resolveExecutionPeriod(legacy)).toEqual({ start: "2026-08-01", end: "2026-08-14", weeksCount: 2 });
  });
  it("3) the calendar month as a last resort", () => {
    expect(resolveExecutionPeriod({ year: 2026, month: 2, weeklyPlans: [] })).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
  });
});
