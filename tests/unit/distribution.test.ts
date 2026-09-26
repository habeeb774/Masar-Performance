import { describe, expect, it } from "vitest";
import { checkDistribution, distributeProportional, suggestDailyTargets, suggestWeeklyTargets } from "@/lib/distribution";
import { getMonthWeeks } from "@/lib/dates";

describe("distributeProportional", () => {
  it("splits evenly when weights are equal", () => {
    expect(distributeProportional(160, [5, 5, 5, 5])).toEqual([40, 40, 40, 40]);
  });
  it("always sums to the total (largest remainder)", () => {
    const parts = distributeProportional(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });
  it("is proportional to weights", () => {
    expect(distributeProportional(90, [2, 5, 5, 5, 1])).toEqual([10, 25, 25, 25, 5]);
  });
  it("falls back to equal split for zero weights", () => {
    expect(distributeProportional(10, [0, 0])).toEqual([5, 5]);
  });
  it("supports decimals", () => {
    const parts = distributeProportional(10, [1, 1, 1], 1);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10);
  });
});

describe("weekly and daily suggestions", () => {
  const weeks = getMonthWeeks(2026, 9, 6, [6, 0, 1, 2, 3]);
  it("splits numeric goals by working days per week", () => {
    const t = suggestWeeklyTargets({ goalType: "NUMERIC", targetValue: 160 }, weeks);
    expect(t.reduce((a, b) => a + b, 0)).toBe(160);
    expect(t.length).toBe(weeks.length);
  });
  it("keeps percentage targets constant", () => {
    const t = suggestWeeklyTargets({ goalType: "PERCENTAGE", targetValue: 95 }, weeks);
    expect(new Set(t)).toEqual(new Set([95]));
  });
  it("assigns boolean goals to the due-date week", () => {
    const t = suggestWeeklyTargets({ goalType: "BOOLEAN", targetValue: 1, dueDate: weeks[1].start }, weeks);
    expect(t[1]).toBe(1);
    expect(t.reduce((a, b) => a + b, 0)).toBe(1);
  });
  it("distributes 40 over 5 days as 8 each", () => {
    expect(suggestDailyTargets(40, 5)).toEqual([8, 8, 8, 8, 8]);
  });
});

describe("checkDistribution", () => {
  it("flags mismatches", () => {
    expect(checkDistribution([40, 50, 35, 35], 160).ok).toBe(true);
    const c = checkDistribution([40, 50, 35, 40], 160);
    expect(c.ok).toBe(false);
    expect(c.diff).toBe(5);
  });
});
