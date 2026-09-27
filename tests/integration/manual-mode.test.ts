/**
 * Manual mode against the isolated test branch (DATABASE_URL_TEST):
 * Masar works fully without Notion; Notion linked later never loses manual data;
 * manual overrides keep the Notion value and survive syncs; a failed sync stops nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { encryptSecret } from "@/server/crypto";
import * as plans from "@/server/services/plans";
import * as manual from "@/server/services/manual";
import { recomputePlan } from "@/server/services/progress";
import { buildMonthlyContent, generateWeeklyReport } from "@/server/services/reports";
import { calculateReview } from "@/server/services/performance";
import { buildEmployeePerformanceFile } from "@/server/export/performance-report";
import { batchesForPeriod } from "@/server/queries/batches";
import { rebuildStages, syncDataSource } from "@/server/notion/sync";
import { monthEnd, monthStart, planWeekPeriods } from "@/lib/dates";
import { num } from "@/lib/num";

const YEAR = 2032;
const MONTH = 5;

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

const manualGoal = (name: string, target: number) => ({
  name,
  description: null,
  goalType: "NUMERIC" as const,
  targetValue: target,
  unit: "منتج",
  weight: 50,
  priority: "HIGH" as const,
  source: "MANUAL" as const,
  category: "PRODUCTIVITY" as const,
  notionDataSourceId: null,
  notionFilter: null,
  startDate: null,
  dueDate: null,
});
const notionFilter = { stageKey: "store", completedStatuses: ["COMPLETED" as const], completedRawValues: [], conditions: [], dateBasis: "NONE" as const, matchEmployee: false };

let admin: AuthUser, manager: AuthUser, employee: AuthUser;
let planId: string;
let addGoalId: string, photoGoalId: string;
let dataSourceId: string, connectionId: string;
const weeks = planWeekPeriods(monthStart(YEAR, MONTH), monthEnd(YEAR, MONTH), [6, 0, 1, 2, 3]);
const week2Day = weeks[1].workDays[0];
const goal = (id: string) => db.monthlyGoal.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  [admin, manager, employee] = await Promise.all([authUser("admin@store.local"), authUser("manager@store.local"), authUser("products@store.local")]);
  await db.performanceReview.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  await db.monthlyPlan.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  await db.manualBatch.deleteMany({ where: { employeeId: employee.employeeId!, number: { in: [9065, 9066] } } });
  await db.notionConnection.deleteMany({ where: { name: "integration-manual" } });
});

afterAll(async () => {
  await db.performanceReview.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  await db.monthlyPlan.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  await db.manualBatch.deleteMany({ where: { employeeId: employee.employeeId!, number: { in: [9065, 9066] } } });
  await db.notionConnection.deleteMany({ where: { name: "integration-manual" } });
});

describe("without Notion: full manual management", () => {
  it("manual monthly plan", async () => {
    const plan = await plans.createMonthlyPlan(manager, { employeeId: employee.employeeId!, year: YEAR, month: MONTH, templateId: null, useTemplate: false });
    planId = plan.id;
    await plans.addGoal(manager, planId, manualGoal("إضافة المنتجات", 160));
    await plans.addGoal(manager, planId, manualGoal("تجهيز الصور", 160));
    const goals = await db.monthlyGoal.findMany({ where: { planId }, orderBy: { sortOrder: "asc" } });
    [addGoalId, photoGoalId] = goals.map((g) => g.id);
    await expect(manual.setManualAchievement(employee, addGoalId, { value: 5 })).rejects.toThrow(); // not approved yet
    await plans.approvePlan(manager, planId, "معتمد");
  });

  it("the employee updates achievement by hand; the week gets it too; tasks add on top", async () => {
    await manual.setManualAchievement(employee, addGoalId, { value: 85, date: week2Day, note: "حتى الآن" });
    expect(num((await goal(addGoalId)).achievedValue)).toBe(85);
    await manual.setManualAchievement(employee, addGoalId, { delta: 5, date: week2Day });
    const g = await goal(addGoalId);
    expect(num(g.achievedValue)).toBe(90);
    expect(num(g.progressPct)).toBe(56.25);
    const wg = await db.weeklyGoal.findFirstOrThrow({ where: { monthlyGoalId: addGoalId, weeklyPlan: { weekIndex: 2 } } });
    expect(num(wg.achievedValue)).toBe(90);
    await manual.setManualAchievement(manager, photoGoalId, { value: 92 });
    expect(num((await goal(photoGoalId)).achievedValue)).toBe(92);
    const log = await db.auditLog.findMany({ where: { entityId: addGoalId, action: "goal.manual_progress" }, orderBy: { createdAt: "asc" } });
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ userId: employee.id, reason: "حتى الآن" });
    await expect(manual.setManualAchievement(employee, addGoalId, { value: -3 })).rejects.toThrow();
  });

  it("manual weekly batch (aggregate numbers only)", async () => {
    const base = { employeeId: employee.employeeId!, total: 40, weekStart: weeks[1].start, imagesApproved: 30, added: 24, needsImprovement: 4, waiting: 6 };
    await manual.saveManualBatch(employee, { ...base, number: 9065 });
    await expect(manual.saveManualBatch(employee, { ...base, number: 9065 })).rejects.toThrow();
    await expect(manual.saveManualBatch(employee, { ...base, number: 9066, added: 41 })).rejects.toThrow();
    const [b] = await batchesForPeriod(employee.employeeId!, weeks[0].start, weeks.at(-1)!.end);
    expect(b).toMatchObject({ label: "دفعة 9065", total: 40, store: { added: 24 }, readyToAdd: 6 });
    expect(b.images).toMatchObject({ approved: 30, needsImprovement: 4, waiting: 6 });
  });

  it("reports, performance and the HR Excel come from the same manual numbers", async () => {
    const week2 = await db.weeklyPlan.findFirstOrThrow({ where: { monthlyPlanId: planId, weekIndex: 2 } });
    const report = await generateWeeklyReport(week2.id);
    const content = report.content as { goals: { goalId: string; achieved: number }[]; batches?: { label: string }[] };
    expect(content.goals.find((g) => g.goalId === addGoalId)?.achieved).toBe(90);
    expect(content.batches?.map((b) => b.label)).toContain("دفعة 9065");
    const monthly = await buildMonthlyContent(planId);
    expect(monthly.goals.find((g) => g.goalId === photoGoalId)?.achieved).toBe(92);
    const review = await calculateReview(manager, employee.employeeId!, YEAR, MONTH);
    expect(review).toBeTruthy();
    const file = (await buildEmployeePerformanceFile(employee.employeeId!, YEAR, MONTH)) as unknown;
    const buf = Buffer.isBuffer(file) ? file : ((file as { buffer?: Buffer }).buffer ?? Buffer.alloc(0));
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe("Notion linked later, overrides and failures", () => {
  beforeAll(async () => {
    const conn = await db.notionConnection.create({ data: { name: "integration-manual", tokenEncrypted: encryptSecret("ntn_stubbed_token_not_real_0000000"), tokenHint: "0000", status: "CONNECTED" } });
    connectionId = conn.id;
    const ds = await db.notionDataSource.create({ data: { connectionId, name: "منتجات (يدوي→تلقائي)", notionDatabaseId: "db-manual", notionDataSourceId: "ds-manual", syncEnabled: false } });
    dataSourceId = ds.id;
    await db.notionFieldMapping.create({
      data: {
        dataSourceId,
        role: "STATUS",
        notionProperty: "الإضافة للمتجر",
        notionPropertyType: "select",
        stageKey: "store",
        label: "الإضافة للمتجر",
        statusMappings: { create: [{ notionValue: "تم الإضافة", systemStatus: "COMPLETED" }] },
      },
    });
    const at = new Date(`${week2Day}T09:00:00Z`);
    for (let i = 0; i < 26; i++) {
      await db.notionSyncedItem.create({
        data: { dataSourceId, notionPageId: `m-${i}`, sourceDatabaseId: "db-manual", title: `منتج ${i}`, properties: { "الإضافة للمتجر": "تم الإضافة" }, createdTime: at, lastEditedTime: at },
      });
    }
    await rebuildStages(dataSourceId);
  });

  const toNotion = (name: string) => ({ ...manualGoal(name, 160), goalType: "NOTION_SYNCED" as const, source: "NOTION" as const, notionDataSourceId: dataSourceId, notionFilter });

  it("linking Notion keeps the manual value and shows the difference (24 vs 26 style)", async () => {
    await plans.updateGoal(manager, addGoalId, toNotion("إضافة المنتجات"));
    const g = await goal(addGoalId);
    expect(num(g.sourceValue)).toBe(26);
    expect(num(g.overrideValue)).toBe(90);
    expect(num(g.achievedValue)).toBe(90);
    const pending = await manual.pendingOverrides(admin);
    expect(pending.find((p) => p.id === addGoalId)).toMatchObject({ overrideValue: 90, sourceValue: 26 });
    expect(await manual.pendingOverrides(employee)).toEqual([]);
  });

  it("no conflict → switches to automatic directly", async () => {
    await manual.setManualAchievement(manager, photoGoalId, { value: 26 });
    await plans.updateGoal(manager, photoGoalId, toNotion("تجهيز الصور"));
    const g = await goal(photoGoalId);
    expect(g.overrideValue).toBeNull();
    expect(num(g.achievedValue)).toBe(26);
  });

  it("admin goes back to the Notion value", async () => {
    await expect(manual.resolveOverride(employee, addGoalId, "notion")).rejects.toThrow();
    await manual.resolveOverride(admin, addGoalId, "notion");
    const g = await goal(addGoalId);
    expect(g.overrideValue).toBeNull();
    expect(num(g.achievedValue)).toBe(26);
  });

  it("manual override keeps both values and survives every sync", async () => {
    await expect(manual.setManualAchievement(manager, addGoalId, { value: 88 })).rejects.toThrow(); // auto goal → «تعديل يدوي»
    await expect(manual.overrideGoal(employee, addGoalId, 30, "x")).rejects.toThrow(); // Notion healthy → manager only
    await expect(manual.overrideGoal(manager, addGoalId, 30, " ")).rejects.toThrow(); // reason required
    await manual.overrideGoal(manager, addGoalId, 28, "منتجان أضيفا خارج Notion");
    await recomputePlan(planId); // what every sync does
    let g = await goal(addGoalId);
    expect([num(g.sourceValue), num(g.overrideValue), num(g.achievedValue)]).toEqual([26, 28, 28]);
    expect(g.overrideById).toBe(manager.id);
    await manual.resolveOverride(admin, addGoalId, "keep");
    await recomputePlan(planId);
    g = await goal(addGoalId);
    expect(g.overrideKeptAt).not.toBeNull();
    expect(num(g.achievedValue)).toBe(28);
    expect((await manual.pendingOverrides(admin)).some((p) => p.id === addGoalId)).toBe(false);
    const a = await db.auditLog.findFirstOrThrow({ where: { entityId: addGoalId, action: "goal.override" } });
    expect(a.before).toMatchObject({ achievedValue: 26, sourceValue: 26 });
    expect(a.after).toMatchObject({ overrideValue: 28 });
  });

  it("a failed sync stops nothing and lets the employee continue by hand", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    try {
      await syncDataSource(dataSourceId, "MANUAL").catch(() => null);
    } finally {
      globalThis.fetch = realFetch;
    }
    const last = await db.notionSyncLog.findFirstOrThrow({ where: { dataSourceId }, orderBy: { startTime: "desc" } });
    expect(last.status).toBe("FAILED");
    expect((await manual.unhealthySourceIds([dataSourceId])).has(dataSourceId)).toBe(true);
    // plans, reports and performance keep working from the last known values
    await recomputePlan(planId);
    expect(num((await goal(photoGoalId)).achievedValue)).toBe(26);
    const week2 = await db.weeklyPlan.findFirstOrThrow({ where: { monthlyPlanId: planId, weekIndex: 2 } });
    await expect(generateWeeklyReport(week2.id)).resolves.toBeTruthy();
    await expect(calculateReview(manager, employee.employeeId!, YEAR, MONTH)).resolves.toBeTruthy();
    // the employee may now update by hand
    await manual.overrideGoal(employee, photoGoalId, 31, "تعذر التحديث التلقائي");
    expect(num((await goal(photoGoalId)).achievedValue)).toBe(31);
  });

  it("switching back to manual keeps the current value", async () => {
    await plans.updateGoal(manager, photoGoalId, manualGoal("تجهيز الصور", 160));
    const g = await goal(photoGoalId);
    expect(g.overrideValue).toBeNull();
    expect(num(g.achievedValue)).toBe(31);
  });
});
