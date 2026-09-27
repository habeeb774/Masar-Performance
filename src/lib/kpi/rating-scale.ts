/**
 * The HR rating scale («مؤشرات التقييم» sheet). The only default scale in code:
 * seeding, the settings "reset" preset and the data migration all use it; at
 * runtime the active scale in the database is the reference everywhere
 * (reviews, «أدائي», «أداء الفريق», reports and the Excel export).
 *
 * Scores are stored with 2 decimals, so «أكثر من 97» is a minimum of 97.01.
 */
export const HR_RATING_BANDS = [
  { label: "متميز", minScore: 97.01, maxScore: 100, color: "emerald" },
  { label: "ممتاز", minScore: 91, maxScore: 97, color: "green" },
  { label: "جيد جدا", minScore: 80, maxScore: 90.99, color: "blue" },
  { label: "جيد", minScore: 70, maxScore: 79.99, color: "amber" },
  { label: "مقبول", minScore: 56, maxScore: 69.99, color: "orange" },
  { label: "ضعيف", minScore: 0, maxScore: 55.99, color: "red" },
] as const;

/** Human wording of a band's range, as in the HR sheet («أكثر من 97», «من 91 إلى 97», «أقل من 56»). */
export function bandRangeText(bands: readonly { minScore: number; maxScore: number }[], index: number): string {
  const b = bands[index];
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  if (index === 0) return b.maxScore >= 100 && b.minScore % 1 !== 0 ? `أكثر من ${fmt(b.minScore - 0.01)}` : `${fmt(b.minScore)} فأكثر`;
  if (index === bands.length - 1) return `أقل من ${fmt(bands[index - 1].minScore)}`;
  return `من ${fmt(b.minScore)}\nإلى ${fmt(Math.floor(b.maxScore))}`;
}
