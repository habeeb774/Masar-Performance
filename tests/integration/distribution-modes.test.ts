import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import * as plans from "@/server/services/plans";
import { recomputePlan } from "@/server/services/progress";
import { num } from "@/lib/num";
import { toDateKey } from "@/lib/dates";

const YEAR = 2036;
const MONTH = 9;
let manager: AuthUser;
let employee: AuthUser;
let planId: string;

async function authUser(email: string): Promise<AuthUser> {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } }, employee: { include: { reports: true, jobTitle: true } } },
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleKey: user.role.key,
    roleName: user.role.name,
    permissions: new Set(user.role.permissions.map((entry) => entry.permission.key)),
    employeeId: user.employee?.id ?? null,
    employeeName: user.employee?.fullName ?? null,
    jobTitle: user.employee?.jobTitle?.name ?? null,
    directReportIds: user.employee?.reports.map((report) => report.id) ?? [],
    sessionId: "test",
  };
}

const goal = (name: string, distributionMode: "DISTRIBUTED" | "ONE_TIME" | "DAILY", targetValue: number, startDate: string | null, dueDate: string | null) => ({
  name,
  description: null,
  goalType: "NUMERIC" as const,
  distributionMode,
  targetValue,
  unit: distributionMode === "DAILY" ? "يوم" : "عنصر",
  weight: 30,
  priority: "MEDIUM" as const,
  source: "MANUAL" as const,
  category: "PRODUCTIVITY" as const,
  notionDataSourceId: null,
  notionFilter: null,
  startDate,
  dueDate,
});

beforeAll(async () => {
  [manager, employee] = await Promise.all([authUser("manager@store.local"), authUser("products@store.local")]);
  await db.monthlyPlan.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
  const plan = await plans.createMonthlyPlan(manager, { employeeId: employee.employeeId!, year: YEAR, month: MONTH, templateId: null, useTemplate: false, executionStartDate: "2036-09-01" });
  planId = plan.id;
  await plans.addGoal(manager, planId, goal("إضافة 100 منتج", "DISTRIBUTED", 100, "2036-09-01", "2036-09-30"));
  await plans.addGoal(manager, planId, goal("تجهيز عروض اليوم الوطني بتاريخ 14", "DISTRIBUTED", 1, "2036-09-01", "2036-09-30"));
  await plans.addGoal(manager, planId, goal("تصميم بنر", "ONE_TIME", 1, "2036-09-01", "2036-09-23"));
  await plans.addGoal(manager, planId, goal("متابعة يومية", "DAILY", 1, "2036-09-01", "2036-09-07"));
  await plans.approvePlan(manager, planId, "اختبار طرق التوزيع");
});

afterAll(async () => {
  await db.monthlyPlan.deleteMany({ where: { id: planId } });
});

describe("distribution modes", () => {
  it("distributes a quantity across weeks and days", async () => {
    const goalRow = await db.monthlyGoal.findFirstOrThrow({ where: { planId, name: "إضافة 100 منتج" } });
    const weekly = await db.weeklyGoal.findMany({ where: { monthlyGoalId: goalRow.id } });
    const tasks = await db.dailyTask.findMany({ where: { monthlyGoalId: goalRow.id, source: "DISTRIBUTED" } });
    expect(weekly.reduce((sum, row) => sum + num(row.targetValue), 0)).toBe(100);
    expect(tasks.reduce((sum, task) => sum + num(task.target), 0)).toBe(100);
  });

  it("repairs a distributed one-task goal from completed legacy work with the same title", async () => {
    const goalRow = await db.monthlyGoal.findFirstOrThrow({ where: { planId, name: "تجهيز عروض اليوم الوطني بتاريخ 14" } });
    await db.dailyTask.updateMany({
      where: { monthlyGoalId: goalRow.id },
      data: { status: "NOT_STARTED", achieved: 0, progress: 0 },
    });
    await db.dailyTask.create({
      data: {
        employeeId: employee.employeeId!,
        title: "تجهيز عروض اليوم الوطني",
        date: new Date("2036-09-14T00:00:00.000Z"),
        target: 1,
        achieved: 1,
        progress: 100,
        status: "COMPLETED",
        source: "MANUAL",
      },
    });

    await recomputePlan(planId);
    const updated = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalRow.id } });
    expect(num(updated.achievedValue)).toBe(1);
    expect(num(updated.progressPct)).toBe(100);
    expect(updated.status).toBe("COMPLETED");
  });

  it("creates one one-time week/task on the due date and stays idempotent", async () => {
    const goalRow = await db.monthlyGoal.findFirstOrThrow({ where: { planId, name: "تصميم بنر" } });
    expect(await db.weeklyGoal.count({ where: { monthlyGoalId: goalRow.id } })).toBe(1);
    let tasks = await db.dailyTask.findMany({ where: { monthlyGoalId: goalRow.id, source: "DISTRIBUTED" } });
    expect(tasks).toHaveLength(1);
    expect(toDateKey(tasks[0].date)).toBe("2036-09-23");

    await plans.autoDistributePlan(planId, manager.id);
    expect(await db.dailyTask.count({ where: { monthlyGoalId: goalRow.id, source: "DISTRIBUTED" } })).toBe(1);

    await db.dailyTask.update({ where: { id: tasks[0].id }, data: { status: "COMPLETED", achieved: 1 } });
    await recomputePlan(planId);
    await plans.autoDistributePlan(planId, manager.id);
    tasks = await db.dailyTask.findMany({ where: { monthlyGoalId: goalRow.id, source: "DISTRIBUTED" } });
    expect(tasks).toHaveLength(1);
    const completed = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalRow.id } });
    expect(num(completed.progressPct)).toBe(100);
  });

  it("creates every expected daily task and computes 3/5 as 60%", async () => {
    const goalRow = await db.monthlyGoal.findFirstOrThrow({ where: { planId, name: "متابعة يومية" } });
    const tasks = await db.dailyTask.findMany({ where: { monthlyGoalId: goalRow.id, source: "DISTRIBUTED" }, orderBy: { date: "asc" } });
    expect(tasks).toHaveLength(5);
    await db.dailyTask.updateMany({ where: { id: { in: tasks.slice(0, 3).map((task) => task.id) } }, data: { status: "COMPLETED", achieved: 1 } });
    await recomputePlan(planId);
    const updated = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalRow.id } });
    expect(num(updated.progressPct)).toBe(60);
  });
});
