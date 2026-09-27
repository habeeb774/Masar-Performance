/**
 * Turns a monthly review (KPI results) into the duty/KPI layout of the HR
 * evaluation workbook. Pure: the Excel renderer only lays these rows out.
 *
 * Invariant: rendering these rows with the workbook formulas
 *   degree = MIN(achieved / target × 100, 100), row = degree × weight / 100,
 *   duty = Σ rows, final = Σ duty × dutyWeight / 100
 * reproduces the system score Σ min(rate, 100) × w / Σ w. Rows are only
 * expanded (per goal / per task) when the expansion reproduces the stored rate.
 */

import { ADHOC_DUTY_TITLE, categoryDuty, dutyOf, groupByDuty } from "./duties";

export { ADHOC_DUTY_TITLE };
export type ExportCategory = "PRODUCTIVITY" | "QUALITY" | "COMMITMENT" | "DEVELOPMENT";

export interface ExportResult {
  name: string;
  category: ExportCategory;
  sourceType: string;
  unit: string;
  target: number;
  achieved: number;
  achievementRate: number;
  weight: number;
  isOverridden: boolean;
  overrideReason: string | null;
  details: unknown;
}

export interface ExportGoal {
  name: string;
  dutyName?: string | null;
  category?: string | null;
  unit: string;
  target: number;
  achieved: number;
  status: string;
}

export interface ExportAdHoc {
  title: string;
  status: string;
  progress: number;
  weight: number;
}

export interface ExportRow {
  name: string;
  indicator: string;
  note: string;
  achieved: number;
  target: number;
  /** % within its duty; a duty's rows total 100 */
  weight: number;
}

export interface ExportDuty {
  title: string;
  /** % of the final result; all duties total 100 */
  weight: number;
  rows: ExportRow[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cap = (n: number) => Math.min(Math.max(n, 0), 100);
const TOLERANCE = 0.05;

/**
 * Split 100 proportionally to raw weights at full precision — rounding here would
 * make Excel's recalculated result drift from the system score (e.g. 38.4987 vs 38.50).
 */
export function normalizeWeights(raw: number[]): number[] {
  if (raw.length === 0) return [];
  const safe = raw.map((w) => (w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  const base = sum > 0 ? safe : raw.map(() => 1);
  const total = base.reduce((a, b) => a + b, 0);
  return base.map((w) => (w / total) * 100);
}

/** Show real counts (e.g. 3 of 4) when they reproduce the rate; otherwise the rate out of 100. */
export function rowValues(achieved: number, target: number, rate: number): { achieved: number; target: number } {
  if (target > 0 && Math.abs(cap((achieved / target) * 100) - cap(rate)) <= TOLERANCE) return { achieved, target };
  return { achieved: round2(cap(rate)), target: 100 };
}

const INDICATORS: Record<string, string> = {
  PLAN_SUBMISSION_DELAY: "تسليم خطة الشهر بشكلها النهائي في اليوم المخصص.",
  WEEKLY_PLANS_PREPARED: "عدد الخطط الأسبوعية المُعدّة من إجمالي أسابيع الشهر.",
  WEEKLY_REPORTS_SUBMITTED: "عدد التقارير الأسبوعية المسلّمة من إجمالي التقارير المطلوبة خلال الشهر.",
  MONTHLY_REPORT_SUBMITTED: "تسليم التقرير الشهري بالمعايير المطلوبة.",
  DEADLINE_COMMITMENT: "نسبة المهام المسلّمة في موعدها من إجمالي المهام ذات المواعيد.",
  NOTION_APPROVAL_RATE: "نسبة العناصر المعتمدة من إجمالي العناصر المراجَعة.",
  NOTION_REVISION_RATE: "نسبة العناصر التي أُعيدت للتعديل (كلما قلّت كان الأداء أفضل).",
  NOTION_COUNT: "عدد العناصر المكتملة خلال الشهر.",
  AD_HOC_COMPLETION: "إنجاز المهام المكلّف بها خلال الشهر.",
  MANUAL: "تقييم المدير المباشر.",
};
const ADHOC_INDICATOR = "إنجاز المهمة المكلّف بها بالكامل وفق المطلوب.";

const ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

export function dutyHeading(index: number, title: string) {
  return `الواجب ${ORDINALS[index] ?? index + 1}: ${title}`;
}

function note(r: ExportResult): string {
  if (r.isOverridden) return r.overrideReason ? `تعديل يدوي: ${r.overrideReason}` : "تعديل يدوي من المدير";
  const d = (r.details ?? {}) as Record<string, unknown>;
  if (r.sourceType === "PLAN_SUBMISSION_DELAY") {
    const late = Number(d.daysLate ?? r.achieved) || 0;
    return late > 0 ? `تأخير ${late} يوم عن الموعد` : "سُلّمت في الموعد";
  }
  if (typeof d.note === "string") return d.note;
  return "";
}

function singleRow(r: ExportResult): ExportRow {
  const counts = ["WEEKLY_PLANS_PREPARED", "WEEKLY_REPORTS_SUBMITTED", "MONTHLY_REPORT_SUBMITTED"].includes(r.sourceType) && !r.isOverridden;
  const v = counts ? rowValues(r.achieved, r.target, r.achievementRate) : { achieved: round2(cap(r.achievementRate)), target: 100 };
  return { name: r.name, indicator: INDICATORS[r.sourceType] ?? r.name, note: note(r), ...v, weight: 100 };
}

type GoalSnapshot = { name: string; progress: number; weight: number; dutyName?: string | null; category?: string | null };

/** One row per goal (tagged with its duty), only when it reproduces the stored rate. */
function goalRows(r: ExportResult, goals: ExportGoal[]): (ExportRow & { duty: string })[] | null {
  if (r.isOverridden) return null;
  const snapshot = ((r.details as { goals?: GoalSnapshot[] } | null)?.goals ?? []).filter((g) => g && typeof g.name === "string");
  if (snapshot.length === 0) return null;
  const weights = normalizeWeights(snapshot.map((g) => Number(g.weight) || 0));
  const rows = snapshot.map((g, i) => {
    const current = goals.find((x) => x.name === g.name);
    const v = current ? rowValues(current.achieved, current.target, Number(g.progress) || 0) : { achieved: round2(cap(Number(g.progress) || 0)), target: 100 };
    const unit = current?.unit ?? "";
    return {
      name: g.name,
      indicator: current && v.target === current.target ? `المنجز من إجمالي المستهدف (${current.target}${unit ? ` ${unit}` : ""}).` : "نسبة الإنجاز المحسوبة من بيانات العمل.",
      note: current?.status === "AT_RISK" ? "متأخر عن المسار المتوقع" : "",
      ...v,
      weight: weights[i],
      duty: dutyOf({ dutyName: g.dutyName ?? current?.dutyName, category: g.category ?? current?.category ?? r.category }),
    };
  });
  return reproduces(rows, r.achievementRate) ? rows : null;
}

/** One row per assigned task: completed = full credit, unfinished = half of its progress (system rule). */
function adHocRows(r: ExportResult, tasks: ExportAdHoc[]): ExportRow[] | null {
  if (r.isOverridden) return null;
  if (tasks.length === 0) return [{ name: "لا توجد مهام مستجدة هذا الشهر", indicator: ADHOC_INDICATOR, note: "", achieved: 1, target: 1, weight: 100 }];
  const weights = normalizeWeights(tasks.map((t) => t.weight || 1));
  const rows = tasks.map((t, i) => {
    const done = t.status === "COMPLETED";
    return {
      name: t.title,
      indicator: ADHOC_INDICATOR,
      note: done ? "" : `لم تكتمل — إنجاز ${t.progress}% يُحتسب نصفه`,
      achieved: done ? 1 : round2((t.progress * 0.5) / 100),
      target: 1,
      weight: weights[i],
    };
  });
  return reproduces(rows, r.achievementRate) ? rows : null;
}

export function dutyResult(rows: ExportRow[]) {
  return rows.reduce((a, row) => a + (cap(row.target > 0 ? (row.achieved / row.target) * 100 : 0) * row.weight) / 100, 0);
}

function reproduces(rows: ExportRow[], rate: number) {
  return Math.abs(dutyResult(rows) - cap(rate)) <= TOLERANCE;
}

/** A slice of the score: rows (weights within the block total 100) worth `weight` KPI points. */
type Block = { title: string; order: number; weight: number; rows: ExportRow[] };

const CATEGORY_ORDER: Record<ExportCategory, number> = { COMMITMENT: 0, PRODUCTIVITY: 2, QUALITY: 3, DEVELOPMENT: 4 };

export function buildDuties(results: ExportResult[], goals: ExportGoal[], adHoc: ExportAdHoc[]): ExportDuty[] {
  const counted = results.filter((r) => r.weight > 0);
  if (counted.reduce((a, r) => a + r.weight, 0) === 0) return [];

  const blocks: Block[] = [];
  let goalOrder = 0;
  for (const r of counted) {
    if (r.sourceType === "GOALS") {
      const rows = goalRows(r, goals);
      if (!rows) {
        blocks.push({ title: categoryDuty(r.category), order: CATEGORY_ORDER[r.category], weight: r.weight, rows: [singleRow(r)] });
        continue;
      }
      // split the goals KPI into its template duties, each worth its share of the KPI weight
      for (const group of groupByDuty(rows, (x) => x.duty)) {
        const share = group.items.reduce((a, x) => a + x.weight, 0);
        blocks.push({
          title: group.duty,
          order: group.duty === ADHOC_DUTY_TITLE ? 9 : 1 + goalOrder++ / 1000,
          weight: (r.weight * share) / 100,
          rows: group.items.map(({ duty: _duty, ...row }) => ({ ...row, weight: share > 0 ? (row.weight / share) * 100 : 100 / group.items.length })),
        });
      }
    } else if (r.sourceType === "AD_HOC_COMPLETION") {
      blocks.push({ title: ADHOC_DUTY_TITLE, order: 9, weight: r.weight, rows: adHocRows(r, adHoc) ?? [singleRow(r)] });
    } else {
      blocks.push({ title: categoryDuty(r.category), order: CATEGORY_ORDER[r.category], weight: r.weight, rows: [singleRow(r)] });
    }
  }

  // blocks with the same title form one duty; each row keeps its exact share of the duty
  const duties = groupByDuty(blocks, (b) => b.title).map(({ duty, items }) => {
    const weight = items.reduce((a, b) => a + b.weight, 0);
    const rows = items.flatMap((b) => b.rows.map((row) => ({ row, raw: (row.weight * b.weight) / 100 })));
    const w = normalizeWeights(rows.map((x) => x.raw));
    return { title: duty, order: Math.min(...items.map((b) => b.order)), weight, rows: rows.map((x, i) => ({ ...x.row, weight: w[i] })) };
  });
  const ordered = duties.sort((a, b) => a.order - b.order);
  const dutyWeights = normalizeWeights(ordered.map((d) => d.weight));
  return ordered.map((d, i) => ({ title: d.title, weight: dutyWeights[i], rows: d.rows }));
}

/** Final score exactly as the workbook formulas compute it (for verification). */
export function workbookScore(duties: ExportDuty[], adjustment = 0) {
  const base = duties.reduce((a, d) => a + (dutyResult(d.rows) * d.weight) / 100, 0);
  return round2(Math.min(100, Math.max(0, base + adjustment)));
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function exportFileName(employeeName: string, year: number, month: number) {
  const safe = employeeName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-");
  return `مؤشر-أداء-${safe}-${MONTHS[month - 1]}-${year}.xlsx`;
}

export function sheetName(year: number, month: number) {
  return `تقييم شهر ${MONTHS[month - 1]} - ${String(year).slice(2)}`;
}
