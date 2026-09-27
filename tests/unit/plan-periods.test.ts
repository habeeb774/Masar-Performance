import { describe, expect, it } from "vitest";
import { diffDays, monthEnd, monthStart, planWeekPeriods } from "@/lib/dates";
import { suggestWeeklyTargets } from "@/lib/distribution";

// Sun–Thu working week (company default); the rule itself ignores which day a period starts on
const WORK = [0, 1, 2, 3, 4];
const ranges = (start: string, end: string) => planWeekPeriods(start, end, WORK).map((w) => [w.start, w.end]);
const lengths = (start: string, end: string) => planWeekPeriods(start, end, WORK).map((w) => diffDays(w.end, w.start) + 1);

describe("plan periods: 7 full days each, never cut at the month end", () => {
  it("the user's example: a plan starting 2026-10-10", () => {
    expect(ranges("2026-10-10", monthEnd(2026, 10))).toEqual([
      ["2026-10-10", "2026-10-16"],
      ["2026-10-17", "2026-10-23"],
      ["2026-10-24", "2026-10-30"],
      ["2026-10-31", "2026-11-06"],
    ]);
  });

  it("plan starting on the 1st of the month", () => {
    const p = ranges(monthStart(2026, 10), monthEnd(2026, 10));
    expect(p[0]).toEqual(["2026-10-01", "2026-10-07"]);
    expect(p).toHaveLength(5);
    expect(p.at(-1)).toEqual(["2026-10-29", "2026-11-04"]);
  });

  it("plan starting mid-week (after the previous plan's period) keeps 7-day blocks from that day", () => {
    // Wednesday 2026-10-07 — the calendar week grid plays no part
    const p = ranges("2026-10-07", monthEnd(2026, 10));
    expect(p.map((r) => r[0])).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]);
    expect(lengths("2026-10-07", monthEnd(2026, 10)).every((n) => n === 7)).toBe(true);
  });

  it("month ending mid-period: the last period runs into the next month instead of a 2–3 day stub", () => {
    const p = planWeekPeriods("2026-09-01", monthEnd(2026, 9), WORK);
    expect(p.at(-1)).toMatchObject({ start: "2026-09-29", end: "2026-10-05" });
    expect(lengths("2026-09-01", monthEnd(2026, 9)).every((n) => n === 7)).toBe(true);
    // no period starts after the month
    expect(p.every((w) => w.start <= "2026-09-30")).toBe(true);
  });

  it("a period crossing into a new month counts its working days in both months", () => {
    const last = planWeekPeriods("2026-09-01", monthEnd(2026, 9), WORK).at(-1)!;
    expect(last.workDays.some((d) => d.startsWith("2026-10"))).toBe(true);
    expect(last.workDays).toHaveLength(5);
  });

  it("February with 28 days fits exactly 4 periods", () => {
    expect(ranges("2026-02-01", monthEnd(2026, 2))).toEqual([
      ["2026-02-01", "2026-02-07"],
      ["2026-02-08", "2026-02-14"],
      ["2026-02-15", "2026-02-21"],
      ["2026-02-22", "2026-02-28"],
    ]);
  });

  it("a 31-day month: 5 periods, the 5th spilling 4 days", () => {
    const p = ranges("2026-01-01", monthEnd(2026, 1));
    expect(p).toHaveLength(5);
    expect(p.at(-1)).toEqual(["2026-01-29", "2026-02-04"]);
    expect(lengths("2026-01-01", monthEnd(2026, 1)).every((n) => n === 7)).toBe(true);
  });

  it("crossing the year from December into January", () => {
    const p = ranges("2026-12-01", monthEnd(2026, 12));
    expect(p.at(-1)).toEqual(["2026-12-29", "2027-01-04"]);
  });

  it("never creates a 1, 2 or 3-day period for a full month", () => {
    for (let m = 1; m <= 12; m++) {
      for (const startDay of ["01", "04", "09"]) {
        const start = `2026-${String(m).padStart(2, "0")}-${startDay}`;
        expect(lengths(start, monthEnd(2026, m)).every((n) => n === 7)).toBe(true);
      }
    }
  });

  it("only an explicitly short plan (< 7 days) gets one shorter period", () => {
    expect(ranges("2026-10-10", "2026-10-13")).toEqual([["2026-10-10", "2026-10-13"]]);
    expect(lengths("2026-10-10", "2026-10-16")).toEqual([7]);
  });

  it("the monthly target is distributed over the full periods by working days", () => {
    const weeks = planWeekPeriods("2026-10-10", monthEnd(2026, 10), WORK);
    const split = suggestWeeklyTargets({ goalType: "NUMERIC", targetValue: 160 }, weeks);
    expect(split).toHaveLength(4);
    expect(split.reduce((a, b) => a + b, 0)).toBe(160);
    expect(split).toEqual([40, 40, 40, 40]); // every period has the same 5 working days
  });
});
