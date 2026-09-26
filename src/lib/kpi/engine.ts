import { z } from "zod";
import { evaluateFormula } from "./formula";

export type KpiMethod = "RATIO" | "INVERSE_RATIO" | "THRESHOLD_TABLE" | "FORMULA" | "MANUAL";
export type KpiCategoryKey = "PRODUCTIVITY" | "QUALITY" | "COMMITMENT" | "DEVELOPMENT";

export const thresholdRuleSchema = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  score: z.number(),
  label: z.string().optional(),
});

export const methodConfigSchema = z
  .object({
    /** max achievement % for RATIO / FORMULA (default 100) */
    cap: z.number().positive().optional(),
    /** THRESHOLD_TABLE rules, evaluated in order, first match wins */
    rules: z.array(thresholdRuleSchema).optional(),
    /** FORMULA expression; variables: achieved, target, plus source variables */
    formula: z.string().max(500).optional(),
    /** what the formula returns (default "rate" = achievement %) */
    output: z.enum(["rate", "score"]).optional(),
    /** INVERSE_RATIO penalty per unit when target = 0 (default 10 points) */
    penaltyPerUnit: z.number().nonnegative().optional(),
  })
  .partial();

export type MethodConfig = z.infer<typeof methodConfigSchema>;
export type ThresholdRule = z.infer<typeof thresholdRuleSchema>;

export interface KpiDefinition {
  templateId: string;
  kpiId?: string | null;
  code: string;
  name: string;
  category: KpiCategoryKey;
  unit: string;
  target: number;
  weight: number;
  method: KpiMethod;
  methodConfig: MethodConfig | null;
  maxScore: number;
  isAutomatic: boolean;
}

export interface KpiInput {
  achieved: number;
  target?: number;
  vars?: Record<string, number>;
  /** manager-entered score for MANUAL KPIs or overrides (0..maxScore) */
  manualScore?: number | null;
  details?: Record<string, unknown>;
}

export interface KpiEvaluation {
  target: number;
  achieved: number;
  achievementRate: number; // 0..cap %
  score: number; // 0..maxScore
  weightedScore: number; // contribution in points out of `weight`
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function thresholdScore(value: number, rules: ThresholdRule[]): number | null {
  for (const r of rules) {
    const okMin = r.min === null || r.min === undefined || value >= r.min;
    const okMax = r.max === null || r.max === undefined || value <= r.max;
    if (okMin && okMax) return r.score;
  }
  return null;
}

export function evaluateKpi(def: KpiDefinition, input: KpiInput): KpiEvaluation {
  const target = input.target ?? def.target;
  const achieved = input.achieved;
  const maxScore = def.maxScore > 0 ? def.maxScore : 100;
  const cfg = def.methodConfig ?? {};
  const cap = cfg.cap ?? 100;
  let rate = 0;

  switch (def.method) {
    case "RATIO": {
      rate = target > 0 ? (achieved / target) * 100 : achieved > 0 ? 100 : 0;
      rate = clamp(rate, 0, cap);
      break;
    }
    case "INVERSE_RATIO": {
      if (achieved <= target) rate = 100;
      else if (target > 0) rate = (target / achieved) * 100;
      else rate = 100 - achieved * (cfg.penaltyPerUnit ?? 10);
      rate = clamp(rate, 0, 100);
      break;
    }
    case "THRESHOLD_TABLE": {
      const s = thresholdScore(achieved, cfg.rules ?? []) ?? 0;
      rate = clamp((s / maxScore) * 100, 0, 100);
      break;
    }
    case "FORMULA": {
      const vars = { achieved, target, maxScore, ...(input.vars ?? {}) };
      const out = cfg.formula ? evaluateFormula(cfg.formula, vars) : 0;
      rate = cfg.output === "score" ? (out / maxScore) * 100 : out;
      rate = clamp(rate, 0, cap);
      break;
    }
    case "MANUAL": {
      rate = clamp(((input.manualScore ?? 0) / maxScore) * 100, 0, 100);
      break;
    }
  }

  // explicit manager override replaces the automatic score for any method
  if (def.method !== "MANUAL" && input.manualScore !== null && input.manualScore !== undefined) {
    rate = clamp((input.manualScore / maxScore) * 100, 0, 100);
  }

  const score = round2((Math.min(rate, 100) / 100) * maxScore);
  const weightedScore = round2((rate / 100) * def.weight);
  return { target: round2(target), achieved: round2(achieved), achievementRate: round2(rate), score, weightedScore };
}

export interface ScoredKpi {
  category: KpiCategoryKey;
  weight: number;
  achievementRate: number;
  weightedScore: number;
}

export interface ReviewTotals {
  autoScore: number;
  productivityScore: number | null;
  qualityScore: number | null;
  totalWeight: number;
}

/**
 * Aggregate KPI results into the auto score (0..100). If the configured
 * weights do not sum to 100 the score is normalized by the total weight.
 */
export function aggregateScores(results: ScoredKpi[]): ReviewTotals {
  const totalWeight = results.reduce((a, r) => a + r.weight, 0);
  const weighted = results.reduce((a, r) => a + Math.min(r.achievementRate, 100) * r.weight, 0);
  const autoScore = totalWeight > 0 ? round2(weighted / totalWeight) : 0;
  const cat = (c: KpiCategoryKey) => {
    const list = results.filter((r) => r.category === c);
    const w = list.reduce((a, r) => a + r.weight, 0);
    if (list.length === 0) return null;
    if (w === 0) return round2(list.reduce((a, r) => a + Math.min(r.achievementRate, 100), 0) / list.length);
    return round2(list.reduce((a, r) => a + Math.min(r.achievementRate, 100) * r.weight, 0) / w);
  };
  return { autoScore, productivityScore: cat("PRODUCTIVITY"), qualityScore: cat("QUALITY"), totalWeight };
}

export function finalScore(autoScore: number, adjustment: number): number {
  return round2(clamp(autoScore + adjustment, 0, 100));
}

export interface RatingBandLike {
  label: string;
  minScore: number;
  maxScore: number;
  color: string;
}

/**
 * Resolve the rating band for a score: the band with the highest minScore that
 * is ≤ score. Robust to decimal gaps such as 94.5 between "90–94" and "95–100".
 */
export function resolveRating<T extends RatingBandLike>(score: number, bands: T[]): T | null {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  return sorted.find((b) => score >= b.minScore) ?? sorted[sorted.length - 1] ?? null;
}

export const KPI_FORMULA_VARIABLES = [
  "achieved",
  "target",
  "maxScore",
  "worked",
  "completed",
  "needsRevision",
  "pendingApproval",
  "reworkCount",
  "daysLate",
  "count",
  "total",
];
