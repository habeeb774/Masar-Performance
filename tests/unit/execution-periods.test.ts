import { describe, expect, it } from "vitest";
import { addDays, diffDays, executionEndDate, planWeekPeriods } from "@/lib/dates";

describe("explicit execution periods", () => {
  it("calculates September and October independently of calendar month ends", () => {
    expect(executionEndDate("2026-09-05", 4)).toBe("2026-10-02");
    expect(executionEndDate("2026-10-03", 4)).toBe("2026-10-30");
    expect(executionEndDate("2026-10-03", 5)).toBe("2026-11-06");
    expect(addDays("2026-10-02", 1)).toBe("2026-10-03");
  });
  it("creates exactly four full periods starting on execution day", () => {
    const periods = planWeekPeriods("2026-10-03", 4, [6, 0, 1, 2, 3]);
    expect(periods.map((period) => [period.start, period.end])).toEqual([
      ["2026-10-03", "2026-10-09"], ["2026-10-10", "2026-10-16"],
      ["2026-10-17", "2026-10-23"], ["2026-10-24", "2026-10-30"],
    ]);
    expect(periods.every((period) => diffDays(period.end, period.start) === 6)).toBe(true);
    expect(periods.every((period) => period.workDays.length === 5)).toBe(true);
  });
  it("rejects nonpositive or fractional week counts", () => {
    for (const count of [0, -1, 1.5, 53]) expect(() => executionEndDate("2026-10-03", count)).toThrow();
  });
});
