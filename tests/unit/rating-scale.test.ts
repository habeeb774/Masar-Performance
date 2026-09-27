import { describe, expect, it } from "vitest";
import { resolveRating } from "@/lib/kpi/engine";
import { bandRangeText, HR_RATING_BANDS } from "@/lib/kpi/rating-scale";

const bands = HR_RATING_BANDS.map((b) => ({ ...b }));
const label = (score: number) => resolveRating(score, bands)?.label;

describe("HR rating scale", () => {
  it.each([
    [100, "متميز"],
    [97.01, "متميز"],
    [97, "ممتاز"],
    [91, "ممتاز"],
    [90.99, "جيد جدا"],
    [80, "جيد جدا"],
    [79.99, "جيد"],
    [70, "جيد"],
    [69.99, "مقبول"],
    [56, "مقبول"],
    [55.99, "ضعيف"],
    [0, "ضعيف"],
  ])("%s → %s (same as the workbook IFS)", (score, expected) => {
    expect(label(score)).toBe(expected);
  });

  it("describes ranges like the «مؤشرات التقييم» sheet", () => {
    expect(bands.map((_, i) => bandRangeText(bands, i))).toEqual(["أكثر من 97", "من 91\nإلى 97", "من 80\nإلى 90", "من 70\nإلى 79", "من 56\nإلى 69", "أقل من 56"]);
  });

  it("covers 0–100 without gaps at 2-decimal precision", () => {
    const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
    for (let i = 1; i < sorted.length; i++) expect(Math.round((sorted[i].minScore - sorted[i - 1].maxScore) * 100)).toBe(1);
  });
});
