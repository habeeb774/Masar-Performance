/**
 * The official monthly evaluation — the manager's Excel model («نموذج تقييم أداء بشكل شهري»).
 * Pure functions: the server, the UI and the tests all compute with these.
 *
 *   indicator score  = achieved / target × 100            (I = (F/G)*100; capped at 100 when capAt100)
 *   indicator rate   = score × indicator weight / 100      (J = I*H/100)
 *   duty score       = Σ indicator rates                   (J14 = SUM(J10:J13))
 *   duty rate        = duty score × duty weight / 100      (J40 = I40*H40/100)
 *   final score      = Σ duty rates                        (J44 = SUM(J40:J43))
 *   rating           = IFS(>97 متميز, ≥91 ممتاز, ≥80 جيد جدا, ≥70 جيد, ≥56 مقبول, else ضعيف)
 */

export interface IndicatorInput {
  achieved: number;
  target: number;
  /** weight inside its duty, 0–100; 0 = in the template but not required this month */
  weight: number;
}

export interface DutyInput {
  title: string;
  /** weight in the final score, 0–100 */
  weight: number;
  indicators: (IndicatorInput & { title?: string })[];
}

export interface EvaluationPolicy {
  /** score = min(achieved / target × 100, 100) — no extra points above the indicator's weight */
  capAt100: boolean;
}

export const DEFAULT_POLICY: EvaluationPolicy = { capAt100: true };

/** Weights are compared with a small tolerance (they are stored with 2 decimals). */
const EPS = 0.005;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function indicatorScore(achieved: number, target: number, policy: EvaluationPolicy = DEFAULT_POLICY): number {
  // Excel divides by zero here; a missing target simply scores 0 (and such rows carry weight 0)
  if (!(target > 0)) return 0;
  const raw = (Math.max(achieved, 0) / target) * 100;
  return policy.capAt100 ? Math.min(raw, 100) : raw;
}

export const weightedScore = (score: number, weight: number) => (score * weight) / 100;

export interface ScoredIndicator extends IndicatorInput {
  score: number;
  weightedScore: number;
}

export interface ScoredDuty {
  title: string;
  weight: number;
  /** Σ indicator weighted scores (0–100) */
  score: number;
  /** score × weight / 100 — this duty's share of the final score */
  rate: number;
  indicators: ScoredIndicator[];
}

export interface EvaluationResult {
  duties: ScoredDuty[];
  finalScore: number;
  rating: RatingLabel;
}

export function scoreDuty(duty: DutyInput, policy: EvaluationPolicy = DEFAULT_POLICY): ScoredDuty {
  const indicators = duty.indicators.map((i) => {
    const score = indicatorScore(i.achieved, i.target, policy);
    return { ...i, score, weightedScore: weightedScore(score, i.weight) };
  });
  const score = sum(indicators.map((i) => i.weightedScore));
  return { title: duty.title, weight: duty.weight, score, rate: weightedScore(score, duty.weight), indicators };
}

export function scoreEvaluation(duties: DutyInput[], policy: EvaluationPolicy = DEFAULT_POLICY): EvaluationResult {
  const scored = duties.map((d) => scoreDuty(d, policy));
  const finalScore = sum(scored.map((d) => d.rate));
  return { duties: scored, finalScore, rating: getRatingLabel(finalScore) };
}

// ---------------------------------------------------------------------------
//  Validation (before approval)
// ---------------------------------------------------------------------------

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Arabic errors that block approval; empty = valid. */
export function validateEvaluation(duties: DutyInput[]): string[] {
  const errors: string[] = [];
  if (duties.length === 0) return ["لا توجد واجبات في التقييم"];
  const dutyTotal = sum(duties.map((d) => d.weight));
  if (Math.abs(dutyTotal - 100) > EPS) errors.push(`مجموع أوزان الواجبات ${fmt(dutyTotal)}% ويجب أن يساوي 100%`);
  for (const d of duties) {
    if (d.weight < 0 || d.indicators.some((i) => i.weight < 0)) errors.push(`«${d.title}»: لا يسمح بوزن سالب`);
    if (d.indicators.length === 0) {
      errors.push(`«${d.title}»: لا يحتوي على مؤشرات بعد`);
      continue;
    }
    const total = sum(d.indicators.map((i) => i.weight));
    if (Math.abs(total - 100) > EPS) errors.push(`«${d.title}»: مجموع أوزان المؤشرات ${fmt(total)}% ويجب أن يساوي 100%`);
    for (const i of d.indicators) if (i.weight > 0 && !(i.target > 0)) errors.push(`«${d.title}» — «${i.title ?? "مؤشر"}»: المستهدف (من أصل) يجب أن يكون أكبر من صفر`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
//  Rating («مؤشرات التقييم» sheet) — the only place these thresholds live
// ---------------------------------------------------------------------------

export const RATING_LABELS = ["متميز", "ممتاز", "جيد جدا", "جيد", "مقبول", "ضعيف"] as const;
export type RatingLabel = (typeof RATING_LABELS)[number];

/** Exactly the sheet's formula: IFS(J44>97,"متميز",J44>=91,"ممتاز",J44>=80,"جيد جدا",J44>=70,"جيد",J44>=56,"مقبول",TRUE,"ضعيف"). */
export function getRatingLabel(score: number): RatingLabel {
  if (score > 97) return "متميز";
  if (score >= 91) return "ممتاز";
  if (score >= 80) return "جيد جدا";
  if (score >= 70) return "جيد";
  if (score >= 56) return "مقبول";
  return "ضعيف";
}

// ---------------------------------------------------------------------------
//  Commitment (duty 1) — «في أول يوم درجة كاملة 5 وعلى كل يوم تأخير خصم درجة من 5»
// ---------------------------------------------------------------------------

export const TIMELINESS_FULL_MARK = 5;

/** 5 on (or before) the due day, minus 1 per day late, never below 0; not submitted = 0. */
export function timelinessMark(daysLate: number | null): number {
  if (daysLate === null) return 0;
  return Math.max(TIMELINESS_FULL_MARK - Math.max(daysLate, 0), 0);
}
