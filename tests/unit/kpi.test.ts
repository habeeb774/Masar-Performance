import { describe, expect, it } from "vitest";
import { aggregateScores, evaluateKpi, finalScore, resolveRating, type KpiDefinition } from "@/lib/kpi/engine";
import { evaluateFormula, FormulaError, validateFormula } from "@/lib/kpi/formula";

const base: KpiDefinition = {
  templateId: "t",
  code: "X",
  name: "x",
  category: "PRODUCTIVITY",
  unit: "%",
  target: 100,
  weight: 20,
  method: "RATIO",
  methodConfig: null,
  maxScore: 100,
  isAutomatic: true,
};

describe("formula", () => {
  it("evaluates arithmetic with precedence", () => {
    expect(evaluateFormula("2 + 3 * 4", {})).toBe(14);
    expect(evaluateFormula("(2 + 3) * 4", {})).toBe(20);
    expect(evaluateFormula("2 ^ 3 ^ 2", {})).toBe(512);
    expect(evaluateFormula("-achieved + 10", { achieved: 4 })).toBe(6);
  });
  it("supports functions and conditionals", () => {
    expect(evaluateFormula("min(achieved / target * 100, 120)", { achieved: 150, target: 100 })).toBe(120);
    expect(evaluateFormula("if(daysLate <= 0, 5, max(1, 5 - daysLate))", { daysLate: 2 })).toBe(3);
    expect(evaluateFormula("round(10 / 3, 2)", {})).toBe(3.33);
    expect(evaluateFormula("completed >= 10 && needsRevision == 0", { completed: 12, needsRevision: 0 })).toBe(1);
  });
  it("treats division by zero as 0", () => {
    expect(evaluateFormula("achieved / target", { achieved: 5, target: 0 })).toBe(0);
  });
  it("rejects unknown identifiers and code injection", () => {
    expect(() => evaluateFormula("process.exit()", {})).toThrow(FormulaError);
    expect(() => evaluateFormula("constructor", {})).toThrow(FormulaError);
    expect(() => evaluateFormula("1 +", {})).toThrow(FormulaError);
    expect(validateFormula("achieved * 2", ["achieved"]).ok).toBe(true);
    expect(validateFormula("foo * 2", ["achieved"]).ok).toBe(false);
  });
});

describe("evaluateKpi", () => {
  it("RATIO: achieved / target × 100, weighted", () => {
    const r = evaluateKpi(base, { achieved: 80 });
    expect(r.achievementRate).toBe(80);
    expect(r.weightedScore).toBe(16);
  });
  it("RATIO caps at 100 by default and at custom cap", () => {
    expect(evaluateKpi(base, { achieved: 150 }).achievementRate).toBe(100);
    expect(evaluateKpi({ ...base, methodConfig: { cap: 120 } }, { achieved: 150 }).achievementRate).toBe(120);
  });
  it("INVERSE_RATIO rewards lower values", () => {
    const def = { ...base, method: "INVERSE_RATIO" as const, target: 5 };
    expect(evaluateKpi(def, { achieved: 3 }).achievementRate).toBe(100);
    expect(evaluateKpi(def, { achieved: 10 }).achievementRate).toBe(50);
  });
  it("THRESHOLD_TABLE maps days late to scores (on-time delivery example)", () => {
    const def: KpiDefinition = {
      ...base,
      method: "THRESHOLD_TABLE",
      maxScore: 5,
      methodConfig: {
        rules: [
          { max: 0, score: 5 },
          { min: 1, max: 1, score: 4 },
          { min: 2, max: 2, score: 3 },
          { min: 3, max: 3, score: 2 },
          { min: 4, score: 1 },
        ],
      },
    };
    expect(evaluateKpi(def, { achieved: 0 }).score).toBe(5);
    expect(evaluateKpi(def, { achieved: 1 }).score).toBe(4);
    expect(evaluateKpi(def, { achieved: 3 }).score).toBe(2);
    expect(evaluateKpi(def, { achieved: 9 }).score).toBe(1);
    expect(evaluateKpi(def, { achieved: 2 }).achievementRate).toBe(60);
  });
  it("FORMULA uses source variables", () => {
    const def: KpiDefinition = { ...base, method: "FORMULA", methodConfig: { formula: "completed / worked * 100" } };
    expect(evaluateKpi(def, { achieved: 0, vars: { completed: 95, worked: 100 } }).achievementRate).toBe(95);
  });
  it("MANUAL uses the manager score", () => {
    const def: KpiDefinition = { ...base, method: "MANUAL", maxScore: 10 };
    expect(evaluateKpi(def, { achieved: 0, manualScore: 7 }).achievementRate).toBe(70);
  });
  it("manual override replaces automatic score", () => {
    expect(evaluateKpi(base, { achieved: 50, manualScore: 90 }).achievementRate).toBe(90);
  });
});

describe("aggregation, final score and rating", () => {
  it("separates productivity from quality (volume does not hide rework)", () => {
    // 100 processed, 95 approved, 5 returned
    const a = aggregateScores([
      { category: "PRODUCTIVITY", weight: 50, achievementRate: 100, weightedScore: 50 },
      { category: "QUALITY", weight: 50, achievementRate: 95, weightedScore: 47.5 },
    ]);
    // 110 processed, 70 approved, 40 returned
    const b = aggregateScores([
      { category: "PRODUCTIVITY", weight: 50, achievementRate: 100, weightedScore: 50 },
      { category: "QUALITY", weight: 50, achievementRate: 63.64, weightedScore: 31.82 },
    ]);
    expect(a.autoScore).toBeGreaterThan(b.autoScore);
    expect(a.qualityScore).toBe(95);
  });
  it("normalizes when weights do not sum to 100", () => {
    const r = aggregateScores([
      { category: "PRODUCTIVITY", weight: 30, achievementRate: 80, weightedScore: 24 },
      { category: "QUALITY", weight: 30, achievementRate: 100, weightedScore: 30 },
    ]);
    expect(r.autoScore).toBe(90);
  });
  it("clamps final score after manager adjustment", () => {
    expect(finalScore(97, 5)).toBe(100);
    expect(finalScore(80, -3.5)).toBe(76.5);
  });
  it("resolves configurable rating bands, including decimal gaps", () => {
    const bands = [
      { label: "متميز", minScore: 95, maxScore: 100, color: "emerald" },
      { label: "ممتاز", minScore: 90, maxScore: 94, color: "green" },
      { label: "جيد جدًا", minScore: 80, maxScore: 89, color: "blue" },
      { label: "ضعيف", minScore: 0, maxScore: 59, color: "red" },
    ];
    expect(resolveRating(96, bands)?.label).toBe("متميز");
    expect(resolveRating(94.5, bands)?.label).toBe("ممتاز");
    expect(resolveRating(85, bands)?.label).toBe("جيد جدًا");
    expect(resolveRating(12, bands)?.label).toBe("ضعيف");
  });
});
