-- AlterTable
ALTER TABLE "GoalTemplateItem" ADD COLUMN     "dutyName" TEXT;

-- AlterTable
ALTER TABLE "MonthlyGoal" ADD COLUMN     "dutyName" TEXT;

-- HR rating scale («مؤشرات التقييم»): becomes the bands of the active scale (or the oldest one).
-- >97 متميز · 91–97 ممتاز · 80–90 جيد جدا · 70–79 جيد · 56–69 مقبول · <56 ضعيف
WITH target AS (
  SELECT "id" FROM "PerformanceRatingScale"
  ORDER BY "isActive" DESC, "createdAt" ASC
  LIMIT 1
), cleared AS (
  DELETE FROM "PerformanceRatingBand" WHERE "scaleId" IN (SELECT "id" FROM target) RETURNING 1
)
INSERT INTO "PerformanceRatingBand" ("id", "scaleId", "label", "minScore", "maxScore", "color", "sortOrder")
SELECT gen_random_uuid()::text, target."id", b.label, b.min, b.max, b.color, b.ord
FROM target, (VALUES
  ('متميز', 97.01, 100, 'emerald', 1),
  ('ممتاز', 91, 97, 'green', 2),
  ('جيد جدا', 80, 90.99, 'blue', 3),
  ('جيد', 70, 79.99, 'amber', 4),
  ('مقبول', 56, 69.99, 'orange', 5),
  ('ضعيف', 0, 55.99, 'red', 6)
) AS b(label, min, max, color, ord)
WHERE (SELECT count(*) FROM cleared) >= 0;

UPDATE "PerformanceRatingScale" SET "isActive" = true
WHERE "id" = (SELECT "id" FROM "PerformanceRatingScale" ORDER BY "isActive" DESC, "createdAt" ASC LIMIT 1);

-- stored rating labels are derived from the score: re-derive them with the unified scale
UPDATE "PerformanceReview" SET
  "ratingLabel" = CASE
    WHEN "finalScore" >= 97.01 THEN 'متميز'
    WHEN "finalScore" >= 91 THEN 'ممتاز'
    WHEN "finalScore" >= 80 THEN 'جيد جدا'
    WHEN "finalScore" >= 70 THEN 'جيد'
    WHEN "finalScore" >= 56 THEN 'مقبول'
    ELSE 'ضعيف' END,
  "ratingColor" = CASE
    WHEN "finalScore" >= 97.01 THEN 'emerald'
    WHEN "finalScore" >= 91 THEN 'green'
    WHEN "finalScore" >= 80 THEN 'blue'
    WHEN "finalScore" >= 70 THEN 'amber'
    WHEN "finalScore" >= 56 THEN 'orange'
    ELSE 'red' END
WHERE "calculatedAt" IS NOT NULL;
