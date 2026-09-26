import type { MonthWeek } from "./dates";

/**
 * Split `total` across buckets proportionally to `weights` using the
 * largest-remainder method, so the parts always sum exactly to `total`.
 */
export function distributeProportional(total: number, weights: number[], decimals = 0): number[] {
  if (weights.length === 0) return [];
  const factor = 10 ** decimals;
  const units = Math.round(total * factor);
  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = safeWeights.reduce((a, b) => a + b, 0);
  const effective = weightSum > 0 ? safeWeights : safeWeights.map(() => 1);
  const effSum = weightSum > 0 ? weightSum : effective.length;

  const raw = effective.map((w) => (units * w) / effSum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = units - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors.map((f) => f / factor);
}

export type DistributableGoalType =
  | "NUMERIC"
  | "BOOLEAN"
  | "PERCENTAGE"
  | "RECURRING"
  | "MANUAL"
  | "NOTION_SYNCED";

/** Goal types whose monthly target is split into weekly/daily quantities. */
export function isSplittable(goalType: DistributableGoalType): boolean {
  return goalType === "NUMERIC" || goalType === "NOTION_SYNCED" || goalType === "RECURRING";
}

/**
 * Suggest weekly targets for a monthly goal.
 * - Quantities are split proportionally to the working days of each week.
 * - Percentages keep the same target every week.
 * - Boolean / manual goals land in the week containing the due date (or the last week).
 */
export function suggestWeeklyTargets(
  goal: { goalType: DistributableGoalType; targetValue: number; dueDate?: string | null },
  weeks: MonthWeek[],
): number[] {
  if (weeks.length === 0) return [];
  if (isSplittable(goal.goalType)) {
    return distributeProportional(
      goal.targetValue,
      weeks.map((w) => w.workDays.length),
    );
  }
  if (goal.goalType === "PERCENTAGE") return weeks.map(() => goal.targetValue);
  const due = goal.dueDate;
  let idx = weeks.length - 1;
  if (due) {
    const found = weeks.findIndex((w) => due >= w.start && due <= w.end);
    if (found >= 0) idx = found;
  }
  return weeks.map((_, i) => (i === idx ? goal.targetValue : 0));
}

/** Suggest daily targets for a weekly target across the given working days. */
export function suggestDailyTargets(weeklyTarget: number, dayCount: number): number[] {
  if (dayCount <= 0) return [];
  return distributeProportional(weeklyTarget, Array.from({ length: dayCount }, () => 1));
}

export interface DistributionCheck {
  sum: number;
  total: number;
  diff: number;
  ok: boolean;
}

export function checkDistribution(parts: number[], total: number, tolerance = 0.001): DistributionCheck {
  const sum = Math.round(parts.reduce((a, b) => a + (Number(b) || 0), 0) * 100) / 100;
  const diff = Math.round((sum - total) * 100) / 100;
  return { sum, total, diff, ok: Math.abs(diff) <= tolerance };
}
