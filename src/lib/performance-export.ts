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

/** Split 100 proportionally to raw weights, 2 decimals, exact total. */
export function normalizeWeights(raw: number[]): number[] {
  if (raw.length === 0) return [];
  const safe = raw.map((w) => (w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  const base = sum > 0 ? safe : raw.map(() => 1);
  const total = base.reduce((a, b) => a + b, 0);
  const out = base.map((w) => round2((w / total) * 100));
  const diff = round2(100 - out.reduce((a, b) => a + b, 0));
  const i = out.indexOf(Math.max(...out));
  out[i] = round2(out[i] + diff);
  return out;
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

const DUTY_TITLES: Record<ExportCategory, string> = {
  COMMITMENT: "الالتزام بسلوكيات وآليات العمل.",
  PRODUCTIVITY: "الإنتاجية",
  QUALITY: "جودة العمل",
  DEVELOPMENT: "التطوير المهني",
};
export const ADHOC_DUTY_TITLE = "مهام مستجدة كُلّف بها خلال الشهر";
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

/** One row per goal, only when it reproduces the stored rate (else the KPI stays one row). */
function goalRows(r: ExportResult, goals: ExportGoal[]): ExportRow[] | null {
  if (r.isOverridden) return null;
  const snapshot = ((r.details as { goals?: { name: string; progress: number; weight: number }[] } | null)?.goals ?? []).filter((g) => g && typeof g.name === "string");
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

export function buildDuties(results: ExportResult[], goals: ExportGoal[], adHoc: ExportAdHoc[]): ExportDuty[] {
  const counted = results.filter((r) => r.weight > 0);
  const total = counted.reduce((a, r) => a + r.weight, 0);
  if (total === 0) return [];

  type Draft = { title: string; order: number; results: ExportResult[]; rows: ExportRow[] };
  const drafts: Draft[] = [];
  const byCategory = new Map<ExportCategory, Draft>();
  const ORDER: Record<ExportCategory, number> = { COMMITMENT: 0, PRODUCTIVITY: 2, QUALITY: 3, DEVELOPMENT: 4 };

  for (const r of counted) {
    if (r.sourceType === "GOALS") {
      const rows = goalRows(r, goals);
      drafts.push({ title: r.name, order: 1, results: [r], rows: rows ?? [singleRow(r)] });
    } else if (r.sourceType === "AD_HOC_COMPLETION") {
      const rows = adHocRows(r, adHoc);
      drafts.push({ title: ADHOC_DUTY_TITLE, order: 9, results: [r], rows: rows ?? [singleRow(r)] });
    } else {
      let d = byCategory.get(r.category);
      if (!d) {
        d = { title: DUTY_TITLES[r.category], order: ORDER[r.category], results: [], rows: [] };
        byCategory.set(r.category, d);
        drafts.push(d);
      }
      d.results.push(r);
    }
  }
  // KPIs grouped under one duty share it by their own weights
  for (const d of byCategory.values()) {
    const w = normalizeWeights(d.results.map((r) => r.weight));
    d.rows = d.results.map((r, i) => ({ ...singleRow(r), weight: w[i] }));
  }

  const ordered = drafts.sort((a, b) => a.order - b.order);
  const dutyWeights = normalizeWeights(ordered.map((d) => d.results.reduce((a, r) => a + r.weight, 0)));
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
