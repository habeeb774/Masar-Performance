-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "DepartmentType" AS ENUM ('ADMINISTRATION', 'SECTION');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('NUMERIC', 'BOOLEAN', 'PERCENTAGE', 'RECURRING', 'MANUAL', 'NOTION_SYNCED');

-- CreateEnum
CREATE TYPE "GoalSource" AS ENUM ('MANUAL', 'NOTION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "KpiCategory" AS ENUM ('PRODUCTIVITY', 'QUALITY', 'COMMITMENT', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'COMPLETED', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WeeklyPlanStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'DELAYED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('DISTRIBUTED', 'MANUAL', 'NOTION', 'AD_HOC_TASK');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'RETURNED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'CALCULATED', 'MANAGER_REVIEW', 'APPROVED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "KpiCalculationMethod" AS ENUM ('RATIO', 'INVERSE_RATIO', 'THRESHOLD_TABLE', 'FORMULA', 'MANUAL');

-- CreateEnum
CREATE TYPE "KpiSourceType" AS ENUM ('GOALS', 'NOTION_APPROVAL_RATE', 'NOTION_REVISION_RATE', 'NOTION_COUNT', 'PLAN_SUBMISSION_DELAY', 'WEEKLY_PLANS_PREPARED', 'WEEKLY_REPORTS_SUBMITTED', 'MONTHLY_REPORT_SUBMITTED', 'AD_HOC_COMPLETION', 'DEADLINE_COMMITMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "NotionSystemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'NEEDS_REVISION', 'IN_PROGRESS_AFTER_REVISION', 'COMPLETED', 'BLOCKED', 'CANCELLED', 'NOT_APPLICABLE', 'UNMAPPED');

-- CreateEnum
CREATE TYPE "NotionFieldRole" AS ENUM ('TITLE', 'STATUS', 'DATE', 'BATCH', 'PRODUCT_CODE', 'EMPLOYEE', 'TASK_TYPE', 'TEXT', 'NUMBER');

-- CreateEnum
CREATE TYPE "NotionConnectionStatus" AS ENUM ('UNTESTED', 'CONNECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'RETRY', 'FULL_RESYNC');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'SLACK');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('WEEK_ENDING', 'LOW_WEEKLY_PROGRESS', 'ITEM_RETURNED_FOR_REVISION', 'PENDING_APPROVAL_ITEMS', 'TASK_ASSIGNED', 'WEEKLY_REPORT_READY', 'REPORT_RETURNED', 'REPORT_SUBMITTED', 'REPORT_APPROVED', 'MONTH_ENDING', 'PLAN_SUBMITTED', 'PLAN_APPROVED', 'PLAN_RETURNED', 'REVIEW_APPROVED', 'SYNC_FAILED', 'GENERAL');

-- CreateEnum
CREATE TYPE "AttachmentEntity" AS ENUM ('DAILY_TASK', 'AD_HOC_TASK', 'WEEKLY_REPORT', 'MONTHLY_REPORT', 'MONTHLY_GOAL');

-- CreateEnum
CREATE TYPE "CommentEntity" AS ENUM ('MONTHLY_PLAN', 'MONTHLY_GOAL', 'DAILY_TASK', 'AD_HOC_TASK', 'WEEKLY_REPORT', 'MONTHLY_REPORT', 'PERFORMANCE_REVIEW');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordSetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "weekStartDay" INTEGER NOT NULL DEFAULT 6,
    "workDays" INTEGER[] DEFAULT ARRAY[6, 0, 1, 2, 3]::INTEGER[],
    "planSubmissionDeadlineDay" INTEGER NOT NULL DEFAULT 3,
    "weeklyReportDueDays" INTEGER NOT NULL DEFAULT 1,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "DepartmentType" NOT NULL DEFAULT 'ADMINISTRATION',
    "description" TEXT,
    "headEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeNo" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "departmentId" TEXT,
    "jobTitleId" TEXT,
    "managerId" TEXT,
    "hireDate" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "notionUserId" TEXT,
    "notionAlias" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "jobTitleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goalType" "GoalType" NOT NULL DEFAULT 'NUMERIC',
    "targetValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'عنصر',
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "source" "GoalSource" NOT NULL DEFAULT 'MANUAL',
    "category" "KpiCategory" NOT NULL DEFAULT 'PRODUCTIVITY',
    "notionFilter" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GoalTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPlan" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "notes" TEXT,
    "managerNotes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyGoal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goalType" "GoalType" NOT NULL DEFAULT 'NUMERIC',
    "targetValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'عنصر',
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "startDate" DATE,
    "dueDate" DATE,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "source" "GoalSource" NOT NULL DEFAULT 'MANUAL',
    "category" "KpiCategory" NOT NULL DEFAULT 'PRODUCTIVITY',
    "notionDataSourceId" TEXT,
    "notionFilter" JSONB,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "achievedValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "progressPct" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "lastComputedAt" TIMESTAMP(3),
    "isAdHoc" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL,
    "monthlyPlanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "workDays" INTEGER NOT NULL DEFAULT 5,
    "status" "WeeklyPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "varianceNote" TEXT,
    "varianceApprovedById" TEXT,
    "varianceApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyGoal" (
    "id" TEXT NOT NULL,
    "weeklyPlanId" TEXT NOT NULL,
    "monthlyGoalId" TEXT NOT NULL,
    "targetValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "achievedValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "progressPct" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "lastComputedAt" TIMESTAMP(3),

    CONSTRAINT "WeeklyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weeklyGoalId" TEXT,
    "monthlyGoalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "deadline" DATE,
    "target" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "achieved" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "source" "TaskSource" NOT NULL DEFAULT 'MANUAL',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "notionFilter" JSONB,
    "breakdown" JSONB,
    "notes" TEXT,
    "delayReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdHocTask" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedById" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedDate" DATE NOT NULL,
    "dueDate" DATE,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "includeInEvaluation" BOOLEAN NOT NULL DEFAULT true,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "isOutOfPlan" BOOLEAN NOT NULL DEFAULT true,
    "compensatesGoalId" TEXT,
    "notes" TEXT,
    "delayReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdHocTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "weeklyPlanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "generatedText" TEXT NOT NULL,
    "employeeNotes" TEXT,
    "highlights" TEXT,
    "blockers" TEXT,
    "carryOver" TEXT,
    "managerComment" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL,
    "monthlyPlanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "generatedText" TEXT NOT NULL,
    "employeeNotes" TEXT,
    "managerNotes" TEXT,
    "highlights" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "KpiCategory" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '%',
    "defaultTarget" DECIMAL(12,2) NOT NULL DEFAULT 100,
    "defaultWeight" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "calculationMethod" "KpiCalculationMethod" NOT NULL DEFAULT 'RATIO',
    "methodConfig" JSONB,
    "maxScore" DECIMAL(8,2) NOT NULL DEFAULT 100,
    "sourceType" "KpiSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceConfig" JSONB,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "jobTitleId" TEXT,
    "weight" DECIMAL(6,2) NOT NULL,
    "target" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiResult" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "kpiId" TEXT,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "KpiCategory" NOT NULL,
    "unit" TEXT NOT NULL,
    "target" DECIMAL(12,2) NOT NULL,
    "achieved" DECIMAL(12,2) NOT NULL,
    "achievementRate" DECIMAL(7,2) NOT NULL,
    "score" DECIMAL(8,2) NOT NULL,
    "maxScore" DECIMAL(8,2) NOT NULL,
    "weight" DECIMAL(6,2) NOT NULL,
    "weightedScore" DECIMAL(8,2) NOT NULL,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT true,
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "monthlyPlanId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "autoScore" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "managerAdjustment" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "adjustmentReason" TEXT,
    "finalScore" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "productivityScore" DECIMAL(7,2),
    "qualityScore" DECIMAL(7,2),
    "ratingLabel" TEXT,
    "ratingColor" TEXT,
    "managerNotes" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "calculatedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceRatingScale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceRatingScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceRatingBand" (
    "id" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minScore" DECIMAL(6,2) NOT NULL,
    "maxScore" DECIMAL(6,2) NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PerformanceRatingBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "workspaceName" TEXT,
    "botName" TEXT,
    "status" "NotionConnectionStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionDataSource" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'PRODUCTS',
    "notionDatabaseId" TEXT NOT NULL,
    "notionDataSourceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "lastSyncedAt" TIMESTAMP(3),
    "syncCursor" TIMESTAMP(3),
    "defaultEmployeeId" TEXT,
    "schemaCache" JSONB,
    "schemaFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionDataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionFieldMapping" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "role" "NotionFieldRole" NOT NULL,
    "notionProperty" TEXT NOT NULL,
    "notionPropertyType" TEXT NOT NULL,
    "stageKey" TEXT,
    "label" TEXT NOT NULL,
    "ownerEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionStatusMapping" (
    "id" TEXT NOT NULL,
    "fieldMappingId" TEXT NOT NULL,
    "notionValue" TEXT NOT NULL,
    "systemStatus" "NotionSystemStatus" NOT NULL,
    "precedence" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,

    CONSTRAINT "NotionStatusMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionSyncedItem" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "sourceDatabaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "batch" TEXT,
    "batchNumber" DECIMAL(12,2),
    "productCode" TEXT,
    "taskType" TEXT,
    "itemDate" DATE,
    "employeeId" TEXT,
    "properties" JSONB NOT NULL,
    "createdTime" TIMESTAMP(3) NOT NULL,
    "lastEditedTime" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotionSyncedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionItemStage" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "rawValues" TEXT[],
    "systemStatus" "NotionSystemStatus" NOT NULL,
    "statusChangedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionItemStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionItemEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "fromStatus" "NotionSystemStatus",
    "toStatus" "NotionSystemStatus" NOT NULL,
    "fromRaw" TEXT[],
    "toRaw" TEXT[],
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionItemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionSyncLog" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "cursorFrom" TIMESTAMP(3),
    "cursorTo" TIMESTAMP(3),
    "recordsScanned" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "retryOfId" TEXT,
    "triggeredById" TEXT,

    CONSTRAINT "NotionSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "entityType" "AttachmentEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "entityType" "CommentEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNo_key" ON "Employee"("employeeNo");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_jobTitleId_idx" ON "Employee"("jobTitleId");

-- CreateIndex
CREATE INDEX "GoalTemplate_jobTitleId_idx" ON "GoalTemplate"("jobTitleId");

-- CreateIndex
CREATE INDEX "GoalTemplateItem_templateId_idx" ON "GoalTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "MonthlyPlan_year_month_idx" ON "MonthlyPlan"("year", "month");

-- CreateIndex
CREATE INDEX "MonthlyPlan_status_idx" ON "MonthlyPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPlan_employeeId_year_month_key" ON "MonthlyPlan"("employeeId", "year", "month");

-- CreateIndex
CREATE INDEX "MonthlyGoal_planId_idx" ON "MonthlyGoal"("planId");

-- CreateIndex
CREATE INDEX "MonthlyGoal_employeeId_idx" ON "MonthlyGoal"("employeeId");

-- CreateIndex
CREATE INDEX "MonthlyGoal_notionDataSourceId_idx" ON "MonthlyGoal"("notionDataSourceId");

-- CreateIndex
CREATE INDEX "WeeklyPlan_employeeId_startDate_idx" ON "WeeklyPlan"("employeeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_monthlyPlanId_weekIndex_key" ON "WeeklyPlan"("monthlyPlanId", "weekIndex");

-- CreateIndex
CREATE INDEX "WeeklyGoal_monthlyGoalId_idx" ON "WeeklyGoal"("monthlyGoalId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyGoal_weeklyPlanId_monthlyGoalId_key" ON "WeeklyGoal"("weeklyPlanId", "monthlyGoalId");

-- CreateIndex
CREATE INDEX "DailyTask_employeeId_date_idx" ON "DailyTask"("employeeId", "date");

-- CreateIndex
CREATE INDEX "DailyTask_weeklyGoalId_idx" ON "DailyTask"("weeklyGoalId");

-- CreateIndex
CREATE INDEX "DailyTask_status_idx" ON "DailyTask"("status");

-- CreateIndex
CREATE INDEX "AdHocTask_employeeId_assignedDate_idx" ON "AdHocTask"("employeeId", "assignedDate");

-- CreateIndex
CREATE INDEX "AdHocTask_status_idx" ON "AdHocTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_weeklyPlanId_key" ON "WeeklyReport"("weeklyPlanId");

-- CreateIndex
CREATE INDEX "WeeklyReport_employeeId_weekStart_idx" ON "WeeklyReport"("employeeId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyReport_status_idx" ON "WeeklyReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_monthlyPlanId_key" ON "MonthlyReport"("monthlyPlanId");

-- CreateIndex
CREATE INDEX "MonthlyReport_employeeId_year_month_idx" ON "MonthlyReport"("employeeId", "year", "month");

-- CreateIndex
CREATE INDEX "MonthlyReport_status_idx" ON "MonthlyReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTemplate_code_key" ON "KpiTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Kpi_templateId_jobTitleId_key" ON "Kpi"("templateId", "jobTitleId");

-- CreateIndex
CREATE INDEX "KpiResult_reviewId_idx" ON "KpiResult"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_monthlyPlanId_key" ON "PerformanceReview"("monthlyPlanId");

-- CreateIndex
CREATE INDEX "PerformanceReview_year_month_idx" ON "PerformanceReview"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_employeeId_year_month_key" ON "PerformanceReview"("employeeId", "year", "month");

-- CreateIndex
CREATE INDEX "PerformanceRatingBand_scaleId_idx" ON "PerformanceRatingBand"("scaleId");

-- CreateIndex
CREATE UNIQUE INDEX "NotionDataSource_connectionId_notionDataSourceId_key" ON "NotionDataSource"("connectionId", "notionDataSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "NotionFieldMapping_dataSourceId_role_notionProperty_key" ON "NotionFieldMapping"("dataSourceId", "role", "notionProperty");

-- CreateIndex
CREATE UNIQUE INDEX "NotionFieldMapping_dataSourceId_stageKey_key" ON "NotionFieldMapping"("dataSourceId", "stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotionStatusMapping_fieldMappingId_notionValue_key" ON "NotionStatusMapping"("fieldMappingId", "notionValue");

-- CreateIndex
CREATE INDEX "NotionSyncedItem_dataSourceId_lastEditedTime_idx" ON "NotionSyncedItem"("dataSourceId", "lastEditedTime");

-- CreateIndex
CREATE INDEX "NotionSyncedItem_dataSourceId_batchNumber_idx" ON "NotionSyncedItem"("dataSourceId", "batchNumber");

-- CreateIndex
CREATE INDEX "NotionSyncedItem_dataSourceId_itemDate_idx" ON "NotionSyncedItem"("dataSourceId", "itemDate");

-- CreateIndex
CREATE INDEX "NotionSyncedItem_employeeId_idx" ON "NotionSyncedItem"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "NotionSyncedItem_dataSourceId_notionPageId_key" ON "NotionSyncedItem"("dataSourceId", "notionPageId");

-- CreateIndex
CREATE INDEX "NotionItemStage_stageKey_systemStatus_idx" ON "NotionItemStage"("stageKey", "systemStatus");

-- CreateIndex
CREATE UNIQUE INDEX "NotionItemStage_itemId_stageKey_key" ON "NotionItemStage"("itemId", "stageKey");

-- CreateIndex
CREATE INDEX "NotionItemEvent_itemId_idx" ON "NotionItemEvent"("itemId");

-- CreateIndex
CREATE INDEX "NotionItemEvent_stageKey_toStatus_occurredAt_idx" ON "NotionItemEvent"("stageKey", "toStatus", "occurredAt");

-- CreateIndex
CREATE INDEX "NotionSyncLog_dataSourceId_startTime_idx" ON "NotionSyncLog"("dataSourceId", "startTime");

-- CreateIndex
CREATE INDEX "NotionSyncLog_status_idx" ON "NotionSyncLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Comment_entityType_entityId_idx" ON "Comment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTitle" ADD CONSTRAINT "JobTitle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalTemplate" ADD CONSTRAINT "GoalTemplate_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalTemplateItem" ADD CONSTRAINT "GoalTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "GoalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "GoalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyGoal" ADD CONSTRAINT "MonthlyGoal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MonthlyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyGoal" ADD CONSTRAINT "MonthlyGoal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyGoal" ADD CONSTRAINT "MonthlyGoal_notionDataSourceId_fkey" FOREIGN KEY ("notionDataSourceId") REFERENCES "NotionDataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_monthlyPlanId_fkey" FOREIGN KEY ("monthlyPlanId") REFERENCES "MonthlyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_monthlyGoalId_fkey" FOREIGN KEY ("monthlyGoalId") REFERENCES "MonthlyGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_weeklyGoalId_fkey" FOREIGN KEY ("weeklyGoalId") REFERENCES "WeeklyGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_monthlyGoalId_fkey" FOREIGN KEY ("monthlyGoalId") REFERENCES "MonthlyGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHocTask" ADD CONSTRAINT "AdHocTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHocTask" ADD CONSTRAINT "AdHocTask_compensatesGoalId_fkey" FOREIGN KEY ("compensatesGoalId") REFERENCES "MonthlyGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_monthlyPlanId_fkey" FOREIGN KEY ("monthlyPlanId") REFERENCES "MonthlyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiResult" ADD CONSTRAINT "KpiResult_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiResult" ADD CONSTRAINT "KpiResult_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiResult" ADD CONSTRAINT "KpiResult_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_monthlyPlanId_fkey" FOREIGN KEY ("monthlyPlanId") REFERENCES "MonthlyPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRatingScale" ADD CONSTRAINT "PerformanceRatingScale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRatingBand" ADD CONSTRAINT "PerformanceRatingBand_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "PerformanceRatingScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionDataSource" ADD CONSTRAINT "NotionDataSource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "NotionConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionDataSource" ADD CONSTRAINT "NotionDataSource_defaultEmployeeId_fkey" FOREIGN KEY ("defaultEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionFieldMapping" ADD CONSTRAINT "NotionFieldMapping_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "NotionDataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionFieldMapping" ADD CONSTRAINT "NotionFieldMapping_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionStatusMapping" ADD CONSTRAINT "NotionStatusMapping_fieldMappingId_fkey" FOREIGN KEY ("fieldMappingId") REFERENCES "NotionFieldMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionSyncedItem" ADD CONSTRAINT "NotionSyncedItem_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "NotionDataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionSyncedItem" ADD CONSTRAINT "NotionSyncedItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionItemStage" ADD CONSTRAINT "NotionItemStage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NotionSyncedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionItemEvent" ADD CONSTRAINT "NotionItemEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NotionSyncedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionSyncLog" ADD CONSTRAINT "NotionSyncLog_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "NotionDataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
