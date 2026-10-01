ALTER TABLE "MonthlyPlan"
  ADD COLUMN "executionStartDate" DATE,
  ADD COLUMN "executionEndDate" DATE,
  ADD COLUMN "weeksCount" INTEGER;

-- Existing plans keep their historical span. No tasks/reports are changed.
UPDATE "MonthlyPlan" p SET
  "executionStartDate" = w.start_date,
  "executionEndDate" = w.end_date,
  "weeksCount" = w.weeks
FROM (
  SELECT "monthlyPlanId", MIN("startDate") start_date,
         MAX("endDate") end_date, COUNT(*)::INTEGER weeks
  FROM "WeeklyPlan" GROUP BY "monthlyPlanId"
) w WHERE p.id = w."monthlyPlanId";

ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_weeksCount_positive"
  CHECK ("weeksCount" IS NULL OR "weeksCount" > 0);
ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_execution_dates_order"
  CHECK ("executionStartDate" IS NULL OR "executionEndDate" IS NULL OR "executionEndDate" >= "executionStartDate");
CREATE INDEX "MonthlyPlan_employeeId_execution_dates_idx"
  ON "MonthlyPlan" ("employeeId", "executionStartDate", "executionEndDate");
