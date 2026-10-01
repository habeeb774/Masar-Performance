import { describe, expect, it } from "vitest";
import { diffDays, planWeekPeriods } from "@/lib/dates";
import { suggestWeeklyTargets } from "@/lib/distribution";

// Sun–Thu working week (company default); the rule itself ignores which day a period starts on
const WORK = [0, 1, 2, 3, 4];
const ranges = (start: string, weeks: number) => planWeekPeriods(start, weeks, WORK).map((w) => [w.start, w.end]);
const lengths = (start: string, weeks: number) => planWeekPeriods(start, weeks, WORK).map((w) => diffDays(w.end, w.start) + 1);

describe("plan periods: weeksCount × 7 full days, never cut at a month end", () => {
  it("a plan starting 2026-10-10 with 4 weeks", () => {
    expect(ranges("2026-10-10", 4)).toEqual([
      ["2026-10-10", "2026-10-16"],
      ["2026-10-17", "2026-10-23"],
      ["2026-10-24", "2026-10-30"],
      ["2026-10-31", "2026-11-06"],
    ]);
  });

  it("the number of periods is weeksCount, never derived from the month length", () => {
    expect(ranges("2026-10-01", 4)).toHaveLength(4);
    expect(ranges("2026-01-01", 4)).toHaveLength(4); // a 31-day month gets no 5th week
    expect(ranges("2026-10-01", 5).at(-1)).toEqual(["2026-10-29", "2026-11-04"]);
  });

  it("a mid-week start keeps 7-day blocks from that day", () => {
    expect(ranges("2026-10-07", 4).map((r) => r[0])).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]);
  });

  it("a period crossing into a new month keeps all its working days", () => {
    const last = planWeekPeriods("2026-09-05", 4, WORK).at(-1)!;
    expect(last).toMatchObject({ start: "2026-09-26", end: "2026-10-02" });
    expect(last.workDays.some((d) => d.startsWith("2026-10"))).toBe(true);
    expect(last.workDays).toHaveLength(5);
  });

  it("every period is 7 days for any start and week count", () => {
    for (let m = 1; m <= 12; m++)
      for (const day of ["01", "04", "09", "28"])
        for (const weeks of [1, 4, 5]) expect(lengths(`2026-${String(m).padStart(2, "0")}-${day}`, weeks).every((n) => n === 7)).toBe(true);
  });

  it("the monthly target is distributed over the periods by working days", () => {
    const split = suggestWeeklyTargets({ goalType: "NUMERIC", targetValue: 160 }, planWeekPeriods("2026-10-10", 4, WORK));
    expect(split).toEqual([40, 40, 40, 40]);
  });
});
