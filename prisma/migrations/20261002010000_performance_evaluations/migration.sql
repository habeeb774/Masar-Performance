-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "EvaluationSourceType" AS ENUM ('MANUAL', 'MONTHLY_GOAL', 'MONTHLY_PLAN', 'WEEKLY_PLAN', 'WEEKLY_REPORT', 'MONTHLY_REPORT', 'AD_HOC_TASK');

-- CreateEnum
CREATE TYPE "EvaluationDutyKind" AS ENUM ('COMMITMENT', 'GOALS', 'AD_HOC', 'MANUAL');

-- CreateTable
CREATE TABLE "EvaluationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "capAt100" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationTemplateDuty" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "EvaluationDutyKind" NOT NULL DEFAULT 'MANUAL',
    "weight" DECIMAL(6,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvaluationTemplateDuty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationTemplateIndicator" (
    "id" TEXT NOT NULL,
    "dutyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "target" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "sourceType" "EvaluationSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceConfig" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvaluationTemplateIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceEvaluation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "monthlyPlanId" TEXT,
    "templateId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "capAt100" BOOLEAN NOT NULL DEFAULT true,
    "computedScore" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "overrideScore" DECIMAL(9,4),
    "overrideReason" TEXT,
    "finalScore" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "ratingLabel" TEXT,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'DRAFT',
    "managerNotes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationDuty" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "EvaluationDutyKind" NOT NULL DEFAULT 'MANUAL',
    "weight" DECIMAL(6,2) NOT NULL,
    "score" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvaluationDuty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationIndicator" (
    "id" TEXT NOT NULL,
    "dutyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "achieved" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "target" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "score" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "weightedScore" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "sourceType" "EvaluationSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvaluationIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationTemplate_jobTitleId_idx" ON "EvaluationTemplate"("jobTitleId");

-- CreateIndex
CREATE INDEX "EvaluationTemplateDuty_templateId_idx" ON "EvaluationTemplateDuty"("templateId");

-- CreateIndex
CREATE INDEX "EvaluationTemplateIndicator_dutyId_idx" ON "EvaluationTemplateIndicator"("dutyId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceEvaluation_monthlyPlanId_key" ON "PerformanceEvaluation"("monthlyPlanId");

-- CreateIndex
CREATE INDEX "PerformanceEvaluation_year_month_idx" ON "PerformanceEvaluation"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceEvaluation_employeeId_year_month_key" ON "PerformanceEvaluation"("employeeId", "year", "month");

-- CreateIndex
CREATE INDEX "EvaluationDuty_evaluationId_idx" ON "EvaluationDuty"("evaluationId");

-- CreateIndex
CREATE INDEX "EvaluationIndicator_dutyId_idx" ON "EvaluationIndicator"("dutyId");

-- AddForeignKey
ALTER TABLE "EvaluationTemplate" ADD CONSTRAINT "EvaluationTemplate_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTemplateDuty" ADD CONSTRAINT "EvaluationTemplateDuty_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTemplateIndicator" ADD CONSTRAINT "EvaluationTemplateIndicator_dutyId_fkey" FOREIGN KEY ("dutyId") REFERENCES "EvaluationTemplateDuty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_monthlyPlanId_fkey" FOREIGN KEY ("monthlyPlanId") REFERENCES "MonthlyPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationDuty" ADD CONSTRAINT "EvaluationDuty_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PerformanceEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationIndicator" ADD CONSTRAINT "EvaluationIndicator_dutyId_fkey" FOREIGN KEY ("dutyId") REFERENCES "EvaluationDuty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

