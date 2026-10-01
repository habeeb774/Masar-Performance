import { num } from "@/lib/num";
import { toDateKey } from "@/lib/dates";
import type { EvaluationView } from "@/server/services/evaluation";

export interface IndicatorRow {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  achieved: number;
  target: number;
  weight: number;
  score: number;
  weightedScore: number;
  sourceType: string;
  isOverridden: boolean;
}

export interface DutyRow {
  id: string;
  title: string;
  kind: string;
  weight: number;
  score: number;
  /** score × weight / 100 */
  rate: number;
  indicators: IndicatorRow[];
}

export interface EvaluationData {
  id: string;
  employeeName: string;
  jobTitle: string | null;
  department: string | null;
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "APPROVED";
  capAt100: boolean;
  computedScore: number;
  overrideScore: number | null;
  overrideReason: string | null;
  finalScore: number;
  ratingLabel: string;
  managerNotes: string | null;
  approvedAt: string | null;
  duties: DutyRow[];
  validation: string[];
  unusedGoals: { id: string; name: string; achieved: number; target: number }[];
}

/** Plain, serializable data for the sheet / editor (Decimals → numbers). */
export function toEvaluationData(e: EvaluationView): EvaluationData {
  return {
    id: e.id,
    employeeName: e.employee.fullName,
    jobTitle: e.employee.jobTitle?.name ?? null,
    department: e.employee.department?.name ?? null,
    year: e.year,
    month: e.month,
    periodStart: toDateKey(e.periodStart),
    periodEnd: toDateKey(e.periodEnd),
    status: e.status,
    capAt100: e.capAt100,
    computedScore: num(e.computedScore),
    overrideScore: e.overrideScore === null ? null : num(e.overrideScore),
    overrideReason: e.overrideReason,
    finalScore: num(e.finalScore),
    ratingLabel: e.ratingLabel ?? "",
    managerNotes: e.managerNotes,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    duties: e.duties.map((d, di) => ({
      id: d.id,
      title: d.title,
      kind: d.kind,
      weight: num(d.weight),
      score: num(d.score),
      rate: e.result.duties[di]?.rate ?? 0,
      indicators: d.indicators.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        notes: i.notes,
        achieved: num(i.achieved),
        target: num(i.target),
        weight: num(i.weight),
        score: num(i.score),
        weightedScore: num(i.weightedScore),
        sourceType: i.sourceType,
        isOverridden: i.isOverridden,
      })),
    })),
    validation: e.validation,
    unusedGoals: e.unusedGoals,
  };
}

export const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "يدوي",
  MONTHLY_GOAL: "هدف الخطة",
  MONTHLY_PLAN: "الخطة الشهرية",
  WEEKLY_PLAN: "الخطط الأسبوعية",
  WEEKLY_REPORT: "التقارير الأسبوعية",
  MONTHLY_REPORT: "التقرير الشهري",
  AD_HOC_TASK: "مهمة مستجدة",
};
