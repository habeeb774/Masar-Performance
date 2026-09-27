-- Manual mode: Notion becomes optional automation
ALTER TABLE "MonthlyGoal" ADD COLUMN "manualAdjust" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sourceValue" DECIMAL(12,2),
  ADD COLUMN "overrideValue" DECIMAL(12,2),
  ADD COLUMN "overrideReason" TEXT,
  ADD COLUMN "overrideById" TEXT,
  ADD COLUMN "overrideAt" TIMESTAMP(3),
  ADD COLUMN "overrideKeptAt" TIMESTAMP(3);

ALTER TABLE "WeeklyGoal" ADD COLUMN "manualAdjust" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "ManualBatch" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "imagesApproved" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "needsImprovement" INTEGER NOT NULL DEFAULT 0,
    "waiting" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManualBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManualBatch_employeeId_number_key" ON "ManualBatch"("employeeId", "number");
CREATE INDEX "ManualBatch_weekStart_idx" ON "ManualBatch"("weekStart");
ALTER TABLE "ManualBatch" ADD CONSTRAINT "ManualBatch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep existing achievement: goals not computed from Notion and without tasks kept their stored value.
UPDATE "MonthlyGoal" g SET "manualAdjust" = g."achievedValue"
WHERE NOT (g."source" = 'NOTION' AND g."notionDataSourceId" IS NOT NULL AND g."notionFilter" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "DailyTask" t WHERE t."monthlyGoalId" = g."id" AND t."status" <> 'CANCELLED');

UPDATE "WeeklyGoal" w SET "manualAdjust" = w."achievedValue"
FROM "MonthlyGoal" g
WHERE g."id" = w."monthlyGoalId"
  AND NOT (g."source" = 'NOTION' AND g."notionDataSourceId" IS NOT NULL AND g."notionFilter" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "DailyTask" t WHERE t."weeklyGoalId" = w."id" AND t."status" <> 'CANCELLED');
