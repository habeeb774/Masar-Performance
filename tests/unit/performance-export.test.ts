import { describe, expect, it } from "vitest";
import { aggregateScores } from "@/lib/kpi/engine";
import {
  ADHOC_DUTY_TITLE,
  buildDuties,
  dutyHeading,
  exportFileName,
  normalizeWeights,
  rowValues,
  sheetName,
  workbookScore,
  type ExportResult,
} from "@/lib/performance-export";

const r = (p: Partial<ExportResult> & Pick<ExportResult, "name" | "category" | "sourceType" | "weight" | "achievementRate">): ExportResult => ({
  unit: "%",
  target: 100,
  achieved: p.achievementRate,
  isOverridden: false,
  overrideReason: null,
  details: null,
  ...p,
});

// a month shaped like the HR workbook: commitment KPIs, goals, quality, ad-hoc tasks
const goals = [
  { name: "إضافة منتجات جديدة", unit: "منتج", target: 160, achieved: 141, status: "IN_PROGRESS" },
  { name: "تجهيز صور المنتجات", unit: "صورة", target: 160, achieved: 160, status: "COMPLETED" },
  { name: "تصميم بنرات", unit: "بنر", target: 8, achieved: 5, status: "AT_RISK" },
];
const goalProgress = goals.map((g) => (g.achieved / g.target) * 100);
const goalWeights = [50, 30, 20];
const goalsRate = goalProgress.reduce((a, p, i) => a + Math.min(p, 100) * goalWeights[i], 0) / 100;
const adHoc = [
  { title: "تصميم بنرات العرض السريع", status: "COMPLETED", progress: 100, weight: 15 },
  { title: "تخصيص تطبيق الفايندر", status: "IN_PROGRESS", progress: 40, weight: 25 },
];
const adHocRate = ((15 + 25 * 0.4 * 0.5) / 40) * 100;
const results: ExportResult[] = [
  r({ name: "تسليم خطة الشهر في الموعد", category: "COMMITMENT", sourceType: "PLAN_SUBMISSION_DELAY", weight: 5, achievementRate: 80, achieved: 1, details: { daysLate: 1 } }),
  r({ name: "إعداد الخطط الأسبوعية", category: "COMMITMENT", sourceType: "WEEKLY_PLANS_PREPARED", weight: 5, achievementRate: 100, achieved: 4, target: 4 }),
  r({ name: "كتابة التقارير الأسبوعية في الموعد", category: "COMMITMENT", sourceType: "WEEKLY_REPORTS_SUBMITTED", weight: 5, achievementRate: 75, achieved: 3, target: 4 }),
  r({ name: "كتابة التقرير الشهري", category: "COMMITMENT", sourceType: "MONTHLY_REPORT_SUBMITTED", weight: 5, achievementRate: 0, achieved: 0, target: 1 }),
  r({
    name: "إنجاز أهداف الإنتاجية",
    category: "PRODUCTIVITY",
    sourceType: "GOALS",
    weight: 40,
    achievementRate: goalsRate,
    details: { goals: goals.map((g, i) => ({ name: g.name, progress: goalProgress[i], weight: goalWeights[i] })) },
  }),
  r({ name: "نسبة إعادة العمل", category: "QUALITY", sourceType: "NOTION_REVISION_RATE", weight: 10, achievementRate: 92 }),
  r({ name: "جودة الإنجاز (تقييم المدير)", category: "QUALITY", sourceType: "MANUAL", weight: 5, achievementRate: 90 }),
  r({ name: "إنجاز المهام المستجدة", category: "PRODUCTIVITY", sourceType: "AD_HOC_COMPLETION", weight: 5, achievementRate: adHocRate }),
  r({ name: "مؤشر غير مكلّف به هذا الشهر", category: "DEVELOPMENT", sourceType: "MANUAL", weight: 0, achievementRate: 0 }),
];

describe("buildDuties", () => {
  const duties = buildDuties(results, goals, adHoc);

  it("reproduces the system score exactly through the workbook formulas", () => {
    const system = aggregateScores(results.map((x) => ({ category: x.category, weight: x.weight, achievementRate: x.achievementRate, weightedScore: 0 }))).autoScore;
    expect(workbookScore(duties)).toBeCloseTo(system, 1);
  });

  it("orders duties like the workbook: commitment, goals, quality, then new tasks last", () => {
    expect(duties.map((d) => d.title)).toEqual(["الالتزام بسلوكيات وآليات العمل.", "إنجاز أهداف الإنتاجية", "جودة العمل", ADHOC_DUTY_TITLE]);
    expect(dutyHeading(0, duties[0].title)).toBe("الواجب الأول: الالتزام بسلوكيات وآليات العمل.");
  });

  it("weights: duties total 100 and each duty's rows total 100", () => {
    const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum(duties.map((d) => d.weight))).toBe(100);
    for (const d of duties) expect(sum(d.rows.map((x) => x.weight))).toBe(100);
    expect(duties.map((d) => d.weight)).toEqual([25, 50, 18.75, 6.25]);
  });

  it("expands goals into one row each with real counts (المحقق / من أصل)", () => {
    const g = duties[1].rows;
    expect(g.map((x) => [x.name, x.achieved, x.target, x.weight])).toEqual([
      ["إضافة منتجات جديدة", 141, 160, 50],
      ["تجهيز صور المنتجات", 160, 160, 30],
      ["تصميم بنرات", 5, 8, 20],
    ]);
    expect(g[2].note).toContain("متأخر");
  });

  it("expands new tasks with the half-credit rule for unfinished work", () => {
    const t = duties[3].rows;
    expect(t.map((x) => [x.name, x.achieved, x.target])).toEqual([
      ["تصميم بنرات العرض السريع", 1, 1],
      ["تخصيص تطبيق الفايندر", 0.2, 1],
    ]);
    expect(t[1].note).toContain("40%");
  });

  it("keeps counts for report KPIs and explains plan delay in the notes", () => {
    const c = duties[0].rows;
    expect(c.find((x) => x.name === "كتابة التقارير الأسبوعية في الموعد")).toMatchObject({ achieved: 3, target: 4 });
    expect(c.find((x) => x.name === "تسليم خطة الشهر في الموعد")).toMatchObject({ achieved: 80, target: 100, note: "تأخير 1 يوم عن الموعد" });
  });

  it("drops KPIs not assigned this month (zero weight)", () => {
    expect(duties.flatMap((d) => d.rows).some((x) => x.name.includes("غير مكلّف"))).toBe(false);
  });

  it("falls back to one row when a KPI was overridden or goals changed since calculation", () => {
    const overridden = results.map((x) => (x.sourceType === "GOALS" ? { ...x, isOverridden: true, overrideReason: "ظروف السوق", achievementRate: 95 } : x));
    const d = buildDuties(overridden, goals, adHoc);
    const goalsDuty = d.find((x) => x.title === "إنجاز أهداف الإنتاجية")!;
    expect(goalsDuty.rows).toHaveLength(1);
    expect(goalsDuty.rows[0]).toMatchObject({ achieved: 95, target: 100, note: "تعديل يدوي: ظروف السوق" });
    const system = aggregateScores(overridden.map((x) => ({ category: x.category, weight: x.weight, achievementRate: x.achievementRate, weightedScore: 0 }))).autoScore;
    expect(workbookScore(d)).toBeCloseTo(system, 1);
  });

  it("shows a placeholder row when no new tasks were assigned", () => {
    const d = buildDuties(results.map((x) => (x.sourceType === "AD_HOC_COMPLETION" ? { ...x, achievementRate: 100 } : x)), goals, []);
    expect(d.at(-1)!.rows[0].name).toBe("لا توجد مهام مستجدة هذا الشهر");
  });
});

describe("helpers", () => {
  it("normalizeWeights totals exactly 100", () => {
    expect(normalizeWeights([1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    expect(normalizeWeights([0, 0])).toEqual([50, 50]);
  });
  it("rowValues keeps counts only when they reproduce the rate", () => {
    expect(rowValues(3, 4, 75)).toEqual({ achieved: 3, target: 4 });
    expect(rowValues(2, 0, 80)).toEqual({ achieved: 80, target: 100 });
  });
  it("file and sheet names follow the HR convention", () => {
    expect(exportFileName("حبيب ناظر", 2026, 9)).toBe("مؤشر-أداء-حبيب-ناظر-سبتمبر-2026.xlsx");
    expect(sheetName(2026, 8)).toBe("تقييم شهر أغسطس - 26");
  });
});
