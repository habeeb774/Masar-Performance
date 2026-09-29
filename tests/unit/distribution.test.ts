import { describe, expect, it } from "vitest";
import { checkDistribution, distributeProportional, suggestDailyTargets, suggestWeeklyTargets } from "@/lib/distribution";
import { getMonthWeeks } from "@/lib/dates";
import { distributionProgress } from "@/lib/distribution-progress";

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
  it("puts a one-time goal only in its due-date week", () => {
    const dueDate = weeks[1].workDays[0];
    const targets = suggestWeeklyTargets({ goalType: "NUMERIC", distributionMode: "ONE_TIME", targetValue: 1, dueDate }, weeks);
    expect(targets[1]).toBe(1);
    expect(targets.filter((value) => value > 0)).toHaveLength(1);
  });
  it("uses each week's working-day count for a daily goal", () => {
    expect(suggestWeeklyTargets({ goalType: "BOOLEAN", distributionMode: "DAILY", targetValue: 1 }, weeks)).toEqual(weeks.map((week) => week.workDays.length));
  });
});

describe("distribution progress", () => {
  it("computes daily progress from completed days", () => {
    const tasks = Array.from({ length: 5 }, (_, index) => ({ achieved: index < 3 ? 1 : 0, status: index < 3 ? "COMPLETED" : "NOT_STARTED", source: "DISTRIBUTED" }));
    expect(distributionProgress("DAILY", "BOOLEAN", 1, tasks)).toEqual({ achieved: 3, progress: 60 });
  });
  it("caps one-time semantics at complete or incomplete", () => {
    expect(distributionProgress("ONE_TIME", "NUMERIC", 1, [{ achieved: 8, status: "COMPLETED" }])).toEqual({ achieved: 1, progress: 100 });
    expect(distributionProgress("ONE_TIME", "NUMERIC", 1, [{ achieved: 8, status: "IN_PROGRESS" }])).toEqual({ achieved: 0, progress: 0 });
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
