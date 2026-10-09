/**
 * «ماذا أنجزت؟» against the test DB: the employee writes a sentence, the system finds the task,
 * and recording it runs the normal automation (auto-completion, goal progress). Notes are kept.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import * as plans from "@/server/services/plans";
import { applyQuickUpdate, previewQuickUpdate } from "@/server/services/quick-update";
import { toDateKey } from "@/lib/dates";
import { num } from "@/lib/num";

const Y = 2037;
const M = 2;

async function authUser(email: string): Promise<AuthUser> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } }, employee: { include: { reports: true, jobTitle: true } } },
  });
  return {
    id: u.id, email: u.email, name: u.name, roleKey: u.role.key, roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((p) => p.permission.key)),
    employeeId: u.employee?.id ?? null, employeeName: u.employee?.fullName ?? null, jobTitle: u.employee?.jobTitle?.name ?? null,
    directReportIds: u.employee?.reports.map((r) => r.id) ?? [], sessionId: "test",
  };
}
const goal = (name: string, target: number) => ({
  name, description: null, goalType: "NUMERIC" as const, targetValue: target, unit: "منتج", weight: 50, priority: "HIGH" as const,
  source: "MANUAL" as const, category: "PRODUCTIVITY" as const, notionDataSourceId: null, notionFilter: null, startDate: null, dueDate: null,
});

let manager: AuthUser, employee: AuthUser, emp: string, planId: string, addGoal: string, editGoal: string, today: string;
const cleanup = () => db.monthlyPlan.deleteMany({ where: { employeeId: emp, year: Y } });
const firstTask = (goalId: string) => db.dailyTask.findFirstOrThrow({ where: { monthlyGoalId: goalId, status: { not: "CANCELLED" } }, orderBy: { date: "asc" } });

beforeAll(async () => {
  [manager, employee] = await Promise.all([authUser("manager@store.local"), authUser("products@store.local")]);
  emp = employee.employeeId!;
  await cleanup();
  const plan = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: M, templateId: null, useTemplate: false, executionStartDate: `${Y}-02-01`, weeksCount: 4 });
  planId = plan.id;
  await plans.addGoal(manager, planId, goal("إضافة منتجات جديدة", 80));
  await plans.addGoal(manager, planId, goal("تعديل منتجات سابقة", 40));
  await plans.approvePlan(manager, planId, "معتمد");
  [addGoal, editGoal] = (await db.monthlyGoal.findMany({ where: { planId }, orderBy: { sortOrder: "asc" } })).map((g) => g.id);
  // "today" for the employee = the day of the first task
  today = toDateKey((await firstTask(addGoal)).date);
});
afterAll(cleanup);

describe("«ماذا أنجزت؟»", () => {
  it("«أضفت 3 منتجات جديدة» → understood as +3 on the add task, saved, notes kept, goal updated", async () => {
    const task = await firstTask(addGoal);
    await db.dailyTask.update({ where: { id: task.id }, data: { notes: "ملاحظتي" } });
    const p = await previewQuickUpdate(employee, "أضفت 3 منتجات جديدة", today);
    expect([p.kind, p.amount]).toEqual(["add", 3]);
    expect(p.options[0]).toMatchObject({ taskId: task.id, from: 0, to: 3 });
    await applyQuickUpdate(employee, p.options[0].taskId, p.kind, p.amount);
    const after = await db.dailyTask.findUniqueOrThrow({ where: { id: task.id } });
    expect([num(after.achieved), after.notes]).toEqual([3, "ملاحظتي"]);
    expect(num((await db.monthlyGoal.findUniqueOrThrow({ where: { id: addGoal } })).achievedValue)).toBe(3);
  });

  it("«عدلت 2 منتجات سابقة» → the edit task, not the add task", async () => {
    const p = await previewQuickUpdate(employee, "عدلت 2 منتجات سابقة", today);
    const editTask = await firstTask(editGoal);
    expect(p.options[0].taskId).toBe(editTask.id);
  });

  it("reaching the target with a sentence completes the task automatically", async () => {
    const task = await firstTask(addGoal);
    const left = num(task.target) - num(task.achieved);
    const p = await previewQuickUpdate(employee, `أضفت ${left} منتجات جديدة`, today);
    expect(p.options[0].to).toBe(num(task.target));
    await applyQuickUpdate(employee, p.options[0].taskId, p.kind, p.amount);
    expect((await db.dailyTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("COMPLETED");
  });

  it("«خلصت تعديل المنتجات» → completes the edit task", async () => {
    const task = await firstTask(editGoal);
    const p = await previewQuickUpdate(employee, "خلصت تعديل المنتجات السابقة", today);
    expect(p.kind).toBe("complete");
    expect(p.options[0].taskId).toBe(task.id);
    await applyQuickUpdate(employee, task.id, p.kind, p.amount);
    const after = await db.dailyTask.findUniqueOrThrow({ where: { id: task.id } });
    expect([after.status, num(after.achieved)]).toEqual(["COMPLETED", num(after.target)]);
  });

  it("a sentence that matches nothing offers the open tasks instead of guessing", async () => {
    const p = await previewQuickUpdate(employee, "حضرت اجتماع الفريق", today);
    expect(p.options).toEqual([]);
    expect(p.openTitles.length).toBeGreaterThan(0);
  });

  it("another employee's task cannot be updated", async () => {
    const task = await db.dailyTask.findFirstOrThrow({ where: { monthlyGoalId: editGoal } });
    await expect(applyQuickUpdate(manager, task.id, "add", 1)).rejects.toThrow("المهمة غير موجودة");
  });
});
