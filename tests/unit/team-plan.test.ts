import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/services/plans", () => ({ approvePlan: vi.fn(), createMonthlyPlan: vi.fn(), submitPlan: vi.fn() }));

const { autoWeights } = await import("@/server/services/team-plan");
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe("autoWeights", () => {
  it("splits evenly when no weights are known", () => {
    expect(autoWeights([null, null, null, null])).toEqual([25, 25, 25, 25]);
  });
  it("keeps template weights that already total 100", () => {
    expect(autoWeights([60, 30, 10])).toEqual([60, 30, 10]);
  });
  it("rescales after a template goal was removed", () => {
    const w = autoWeights([30, 10]);
    expect(w).toEqual([75, 25]);
  });
  it("gives a new goal the average known weight, then totals exactly 100", () => {
    const w = autoWeights([30, 10, 20, null]);
    expect(sum(w)).toBe(100);
    expect(w[3]).toBeCloseTo(25, 5);
  });
  it("always totals exactly 100 despite rounding", () => {
    expect(sum(autoWeights([null, null, null]))).toBe(100);
    expect(sum(autoWeights([1, 1, 1, 1, 1, 1, 1]))).toBe(100);
  });
  it("handles an empty plan", () => {
    expect(autoWeights([])).toEqual([]);
  });
});
