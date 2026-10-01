import { describe, expect, it } from "vitest";
import { getRatingLabel, indicatorScore, scoreEvaluation, timelinessMark, validateEvaluation, type DutyInput } from "@/lib/evaluation";

const i = (achieved: number, target: number, weight: number, title = "مؤشر") => ({ title, achieved, target, weight });

/** «تقييم شهر يوليو - 26» exactly as entered in the manager's Excel sheet. */
const JULY: DutyInput[] = [
  {
    title: "الواجب الأول: الالتزام بسلوكيات وآليات العمل.",
    weight: 20,
    indicators: [i(3, 5, 25, "إعداد خطة الشهر."), i(4, 4, 25, "إعداد الخطط الأسبوعية"), i(4, 4, 25, "كتابة التقارير الأسبوعية"), i(3, 5, 25, "كتابة التقارير الشهرية")],
  },
  { title: "الواجب الثاني: إضافة وتعديل المنتجات في المتجر", weight: 40, indicators: [i(100, 100, 100, "إضافة المنتجات الجديدة للمتجر")] },
  {
    title: "الواجب الثالث: التعديل وتطوير واجهة ومظهر المتجر",
    weight: 20,
    indicators: [i(1, 1, 100, "ربط المنتجات بمقاطع الانستقرام"), i(0, 5, 0, "تصميم صور المقالات"), i(0, 3, 0, "تصميم بنرات جديدة")],
  },
  {
    title: "الواجب الرابع: مهام مستجدة كُلّف بها خلال الشهر",
    weight: 20,
    indicators: [i(1, 1, 15), i(1, 1, 15), i(1, 1, 25), i(1, 1, 15), i(1, 1, 15), i(1, 1, 15)],
  },
];

/** «تقييم شهر أغسطس - 26». */
const AUGUST: DutyInput[] = [
  { title: "الواجب الأول", weight: 20, indicators: [i(5, 5, 25), i(4, 4, 25), i(4, 4, 25), i(5, 5, 25)] },
  { title: "الواجب الثاني", weight: 40, indicators: [i(141, 160, 100, "إضافة المنتجات الجديدة للمتجر")] },
  { title: "الواجب الثالث", weight: 20, indicators: [i(6, 6, 30), i(5, 5, 35), i(3, 3, 35)] },
  { title: "الواجب الرابع", weight: 20, indicators: [i(1, 1, 15), i(1, 1, 15), i(1, 1, 25), i(1, 1, 15), i(1, 1, 15), i(1, 1, 15)] },
];

describe("reference: the manager's Excel sheets", () => {
  it("July 2026: duties 80 / 100 / 100 / 100 → 96 → ممتاز", () => {
    const r = scoreEvaluation(JULY);
    expect(r.duties.map((d) => d.score)).toEqual([80, 100, 100, 100]);
    expect(r.duties.map((d) => d.rate)).toEqual([16, 40, 20, 20]);
    expect(r.duties[0].indicators.map((x) => [x.score, x.weightedScore])).toEqual([[60, 15], [100, 25], [100, 25], [60, 15]]);
    expect(r.finalScore).toBe(96);
    expect(r.rating).toBe("ممتاز");
    expect(validateEvaluation(JULY)).toEqual([]);
  });

  it("August 2026: duties 100 / 88.125 / 100 / 100 → 95.25 → ممتاز", () => {
    const r = scoreEvaluation(AUGUST);
    expect(r.duties.map((d) => d.score)).toEqual([100, 88.125, 100, 100]);
    expect(r.duties.map((d) => d.rate)).toEqual([20, 35.25, 20, 20]);
    expect(r.finalScore).toBe(95.25);
    expect(r.rating).toBe("ممتاز");
    expect(validateEvaluation(AUGUST)).toEqual([]);
  });
});

describe("validation", () => {
  const duty = (weight: number, weights: number[]) => ({ title: "واجب", weight, indicators: weights.map((w) => i(1, 1, w)) });

  it("case 1: duty weights 20 + 40 + 20 + 20 = 100 → valid", () => {
    expect(validateEvaluation([duty(20, [100]), duty(40, [100]), duty(20, [100]), duty(20, [100])])).toEqual([]);
  });
  it("case 2: 20 + 40 + 30 + 20 = 110 → rejected", () => {
    expect(validateEvaluation([duty(20, [100]), duty(40, [100]), duty(30, [100]), duty(20, [100])])).toEqual(["مجموع أوزان الواجبات 110% ويجب أن يساوي 100%"]);
  });
  it("case 3: indicator weights 30 + 35 + 35 = 100 → valid", () => {
    expect(validateEvaluation([duty(100, [30, 35, 35])])).toEqual([]);
  });
  it("case 4: 100 + 0 + 0 = 100 → valid; the 0-weight indicators do not count", () => {
    expect(validateEvaluation([duty(100, [100, 0, 0])])).toEqual([]);
    const r = scoreEvaluation([{ title: "واجب", weight: 100, indicators: [i(1, 1, 100), i(0, 5, 0), i(0, 3, 0)] }]);
    expect(r.finalScore).toBe(100);
  });
  it("rejects indicator weights that do not reach 100, a duty without indicators, and a weighted indicator without a target", () => {
    expect(validateEvaluation([duty(100, [30, 35])])).toEqual(["«واجب»: مجموع أوزان المؤشرات 65% ويجب أن يساوي 100%"]);
    expect(validateEvaluation([{ title: "فارغ", weight: 100, indicators: [] }])).toEqual(["«فارغ»: لا يحتوي على مؤشرات بعد"]);
    expect(validateEvaluation([{ title: "واجب", weight: 100, indicators: [i(1, 0, 100, "بلا مستهدف")] }])).toEqual(["«واجب» — «بلا مستهدف»: المستهدف (من أصل) يجب أن يكون أكبر من صفر"]);
  });
});

describe("scores", () => {
  it("case 5: 141 / 160 → 88.125", () => expect(indicatorScore(141, 160)).toBe(88.125));
  it("case 6: achieved > target with capAt100 → 100 (without the cap the raw ratio)", () => {
    expect(indicatorScore(29, 20)).toBe(100);
    expect(indicatorScore(29, 20, { capAt100: false })).toBe(145);
  });
  it("case 7: final = Σ duty score × duty weight / 100", () => {
    const r = scoreEvaluation([
      { title: "أ", weight: 20, indicators: [i(90, 100, 100)] },
      { title: "ب", weight: 40, indicators: [i(80.5, 100, 100)] },
      { title: "ج", weight: 20, indicators: [i(95, 100, 100)] },
      { title: "د", weight: 20, indicators: [i(1, 1, 100)] },
    ]);
    expect(r.duties.map((d) => d.rate)).toEqual([18, 32.2, 19, 20]);
    expect(r.finalScore).toBeCloseTo(89.2, 10);
    expect(r.rating).toBe("جيد جدا");
  });
  it("a missing target scores 0 instead of dividing by zero", () => expect(indicatorScore(3, 0)).toBe(0));
  it("plan / monthly report timeliness: 5 on time, −1 per day late, 0 when not submitted", () => {
    expect([timelinessMark(0), timelinessMark(-2), timelinessMark(2), timelinessMark(9), timelinessMark(null)]).toEqual([5, 5, 3, 0, 0]);
  });
});

describe("case 8: rating labels", () => {
  it.each([
    [98, "متميز"],
    [97.01, "متميز"],
    [97, "ممتاز"],
    [95, "ممتاز"],
    [91, "ممتاز"],
    [90.99, "جيد جدا"],
    [85, "جيد جدا"],
    [80, "جيد جدا"],
    [75, "جيد"],
    [70, "جيد"],
    [60, "مقبول"],
    [56, "مقبول"],
    [55.99, "ضعيف"],
    [50, "ضعيف"],
  ])("%d → %s", (score, label) => expect(getRatingLabel(score as number)).toBe(label));
});
