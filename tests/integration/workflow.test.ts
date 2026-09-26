/**
 * End-to-end workflow against an isolated Neon branch (DATABASE_URL_TEST):
 * template → monthly plan → approval → weekly split → Notion-derived progress
 * → weekly report → KPI review → manager adjustment → approval.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { encryptSecret } from "@/server/crypto";
import * as plans from "@/server/services/plans";
import { recomputePlan } from "@/server/services/progress";
import { generateWeeklyReport } from "@/server/services/reports";
import { adjustReview, approveReview, calculateReview } from "@/server/services/performance";
import { rebuildStages } from "@/server/notion/sync";
import { getMonthWeeks } from "@/lib/dates";
import { num } from "@/lib/num";

const YEAR = 2031;
const MONTH = 3;

async function authUser(email: string): Promise<AuthUser> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } }, employee: { include: { reports: true, jobTitle: true } } },
  });
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleKey: u.role.key,
    roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((p) => p.permission.key)),
    employeeId: u.employee?.id ?? null,
    employeeName: u.employee?.fullName ?? null,
    jobTitle: u.employee?.jobTitle?.name ?? null,
    directReportIds: u.employee?.reports.map((r) => r.id) ?? [],
    sessionId: "test",
  };
}

let manager: AuthUser;
let employee: AuthUser;
let dataSourceId: string;
let connectionId: string;
let planId: string;

beforeAll(async () => {
  manager = await authUser("manager@store.local");
  employee = await authUser("products@store.local");
  // clean leftovers from previous runs
  await db.performanceReview.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  await db.monthlyPlan.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  await db.notionConnection.deleteMany({ where: { name: "integration-test" } });

  const conn = await db.notionConnection.create({
    data: { name: "integration-test", tokenEncrypted: encryptSecret("ntn_testtoken_not_real_000000000"), tokenHint: "0000" },
  });
  connectionId = conn.id;
  const ds = await db.notionDataSource.create({
    data: { connectionId: conn.id, name: "منتجات (اختبار)", notionDatabaseId: "db-test", notionDataSourceId: "ds-test", syncEnabled: false },
  });
  dataSourceId = ds.id;
  await db.notionFieldMapping.create({ data: { dataSourceId, role: "BATCH", notionProperty: "الدفعة", notionPropertyType: "number", label: "الدفعة" } });
  await db.notionFieldMapping.create({
    data: {
      dataSourceId,
      role: "STATUS",
      notionProperty: "الإضافة للمتجر",
      notionPropertyType: "select",
      stageKey: "store",
      label: "الإضافة للمتجر",
      statusMappings: {
        create: [
          { notionValue: "مضاف نهائي", systemStatus: "COMPLETED" },
          { notionValue: "مضاف ومخفي", systemStatus: "PENDING_APPROVAL" },
          { notionValue: "يحتاج تعديل", systemStatus: "NEEDS_REVISION" },
        ],
      },
    },
  });

  // 15 completed, 4 pending, 2 needing revision in batch 65 during week 2; 3 completed in batch 64
  const week2Day = getMonthWeeks(YEAR, MONTH, 6, [6, 0, 1, 2, 3])[1].workDays[0];
  const rows = [
    ...Array.from({ length: 15 }, () => ({ status: "مضاف نهائي", batch: 65 })),
    ...Array.from({ length: 4 }, () => ({ status: "مضاف ومخفي", batch: 65 })),
    ...Array.from({ length: 2 }, () => ({ status: "يحتاج تعديل", batch: 65 })),
    ...Array.from({ length: 3 }, () => ({ status: "مضاف نهائي", batch: 64 })),
  ];
  const edited = new Date(`${week2Day}T09:00:00Z`);
  for (const [i, r] of rows.entries()) {
    await db.notionSyncedItem.create({
      data: {
        dataSourceId,
        notionPageId: `page-${i}`,
        sourceDatabaseId: "db-test",
        title: `منتج ${i}`,
        properties: { الدفعة: r.batch, "الإضافة للمتجر": r.status },
        createdTime: edited,
        lastEditedTime: edited,
      },
    });
  }
  // derive batch + stages from stored properties via the real mapping pipeline
  await rebuildStages(dataSourceId);
});

afterAll(async () => {
  await db.performanceReview.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  await db.monthlyPlan.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  await db.notionConnection.deleteMany({ where: { id: connectionId } });
  await db.$disconnect();
});

describe("planning → progress → report → evaluation", () => {
  it("rebuilds stages from stored Notion properties", async () => {
    const counts = await db.notionItemStage.groupBy({ by: ["systemStatus"], where: { item: { dataSourceId } }, _count: { _all: true } });
    const map = Object.fromEntries(counts.map((c) => [c.systemStatus, c._count._all]));
    expect(map).toEqual({ COMPLETED: 18, PENDING_APPROVAL: 4, NEEDS_REVISION: 2 });
    const item = await db.notionSyncedItem.findFirstOrThrow({ where: { dataSourceId, notionPageId: "page-0" } });
    expect(item.batch).toBe("65");
  });

  it("creates the plan from the job-title template", async () => {
    const plan = await plans.createMonthlyPlan(manager, { employeeId: employee.employeeId!, year: YEAR, month: MONTH, templateId: null, useTemplate: true });
    planId = plan.id;
    const goals = await db.monthlyGoal.count({ where: { planId } });
    expect(goals).toBeGreaterThan(0);
    await expect(
      plans.createMonthlyPlan(manager, { employeeId: employee.employeeId!, year: YEAR, month: MONTH, templateId: null, useTemplate: true }),
    ).rejects.toThrow();
  });

  it("adds a Notion-synced goal and blocks employees from editing after submission", async () => {
    await plans.addGoal(manager, planId, {
      name: "إضافة 25 منتجًا من الدفعة 65",
      description: null,
      goalType: "NOTION_SYNCED",
      targetValue: 25,
      unit: "منتج",
      weight: 20,
      priority: "HIGH",
      source: "NOTION",
      category: "PRODUCTIVITY",
      notionDataSourceId: dataSourceId,
      notionFilter: {
        stageKey: "store",
        completedStatuses: ["COMPLETED"],
        completedRawValues: [],
        conditions: [{ field: "batch", op: "eq", value: 65 }],
        dateBasis: "STAGE_CHANGED",
        matchEmployee: false,
      },
      startDate: null,
      dueDate: null,
    });
    await plans.submitPlan(employee, planId);
    const goal = await db.monthlyGoal.findFirstOrThrow({ where: { planId, source: "NOTION" } });
    await expect(
      plans.updateGoal(employee, goal.id, {
        name: "x",
        description: null,
        goalType: "NUMERIC",
        targetValue: 1,
        unit: "x",
        weight: 1,
        priority: "LOW",
        source: "MANUAL",
        category: "PRODUCTIVITY",
        notionDataSourceId: null,
        notionFilter: null,
        startDate: null,
        dueDate: null,
      }),
    ).rejects.toThrow();
  });

  it("approval generates working weeks whose targets sum to the monthly target", async () => {
    await plans.approvePlan(manager, planId, "معتمد");
    const weeks = await db.weeklyPlan.findMany({ where: { monthlyPlanId: planId }, include: { goals: true } });
    expect(weeks.length).toBe(getMonthWeeks(YEAR, MONTH, 6, [6, 0, 1, 2, 3]).length);
    const goal = await db.monthlyGoal.findFirstOrThrow({ where: { planId, source: "NOTION" } });
    const sum = weeks.flatMap((w) => w.goals).filter((g) => g.monthlyGoalId === goal.id).reduce((a, g) => a + num(g.targetValue), 0);
    expect(sum).toBe(25);
  });

  it("computes progress automatically from Notion items (no manual entry)", async () => {
    await recomputePlan(planId);
    const goal = await db.monthlyGoal.findFirstOrThrow({ where: { planId, source: "NOTION" } });
    expect(num(goal.achievedValue)).toBe(15);
    expect(num(goal.progressPct)).toBe(60);
    const b = goal.breakdown as Record<string, number>;
    expect(b.worked).toBe(21);
    expect(b.pendingApproval).toBe(4);
    expect(b.needsRevision).toBe(2);
    expect(b.remaining).toBe(10);
    const week2 = await db.weeklyPlan.findFirstOrThrow({ where: { monthlyPlanId: planId, weekIndex: 2 }, include: { goals: true } });
    expect(num(week2.goals.find((g) => g.monthlyGoalId === goal.id)!.achievedValue)).toBe(15);
  });

  it("requires a justification + approval when the weekly split does not match", async () => {
    const plan = await db.monthlyPlan.findUniqueOrThrow({ where: { id: planId }, include: { goals: true, weeklyPlans: true } });
    const goal = plan.goals.find((g) => g.source === "NOTION")!;
    const targets = { [goal.id]: Object.fromEntries(plan.weeklyPlans.map((w) => [String(w.weekIndex), 10])) };
    await expect(plans.saveWeeklyDistribution(employee, { planId, targets, varianceNote: null })).rejects.toThrow();
    const res = await plans.saveWeeklyDistribution(employee, { planId, targets, varianceNote: "ضغط دفعة جديدة" });
    expect(res.needsApproval).toBe(true);
    const pending = await db.weeklyPlan.count({ where: { monthlyPlanId: planId, status: "PENDING_APPROVAL" } });
    expect(pending).toBe(plan.weeklyPlans.length);
    await plans.approveWeeklyVariance(manager, planId);
    expect(await db.weeklyPlan.count({ where: { monthlyPlanId: planId, status: "ACTIVE" } })).toBe(plan.weeklyPlans.length);
  });

  it("generates the weekly report from live data", async () => {
    const week2 = await db.weeklyPlan.findFirstOrThrow({ where: { monthlyPlanId: planId, weekIndex: 2 } });
    const report = await generateWeeklyReport(week2.id);
    const content = report.content as { totals: { approved: number; needsRevision: number; approvalRate: number } };
    expect(content.totals.approved).toBe(15);
    expect(content.totals.needsRevision).toBe(2);
    expect(content.totals.approvalRate).toBeCloseTo(88.24, 1);
    expect(report.generatedText).toContain("إضافة 25 منتجًا من الدفعة 65");
  });

  it("calculates the KPI review, applies an audited manager adjustment and approves it", async () => {
    const review = await calculateReview(manager, employee.employeeId!, YEAR, MONTH);
    const results = await db.kpiResult.findMany({ where: { reviewId: review.id } });
    expect(results.length).toBeGreaterThan(5);
    const auto = num(review.autoScore);
    expect(auto).toBeGreaterThanOrEqual(0);
    expect(auto).toBeLessThanOrEqual(100);
    // quality KPI reflects approval rate, not volume
    const imageQuality = results.find((r) => r.name.includes("اعتماد الصور"));
    if (imageQuality) expect(num(imageQuality.achieved)).toBeLessThanOrEqual(100);

    const adjusted = await adjustReview(manager, review.id, { adjustment: 3, reason: "مبادرة إضافية في تحسين الواجهة", managerNotes: "عمل ممتاز", strengths: null, improvements: null });
    expect(num(adjusted.finalScore)).toBeCloseTo(Math.min(100, auto + 3), 2);
    const auditRows = await db.auditLog.count({ where: { entityType: "PerformanceReview", entityId: review.id, action: "review.adjust" } });
    expect(auditRows).toBeGreaterThan(0);

    await expect(approveReview(employee, review.id)).rejects.toThrow();
    await approveReview(manager, review.id);
    const approved = await db.performanceReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.ratingLabel).toBeTruthy();
    await expect(calculateReview(manager, employee.employeeId!, YEAR, MONTH)).rejects.toThrow();
  });

  it("scopes employees to their own data", async () => {
    const other = await authUser("content@store.local");
    await expect(plans.submitPlan(other, planId)).rejects.toThrow();
  });
});

