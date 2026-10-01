import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { createMonthlyPlan, addGoal, approvePlan, updatePlanPeriod } from "@/server/services/plans";
import { currentPlanWhere, assertTaskInPlan, planSpan } from "@/server/services/periods";
import { buildMonthlyContent } from "@/server/services/reports";
import { recomputePlan } from "@/server/services/progress";
import { fromDateKey, toDateKey, diffDays } from "@/lib/dates";
import { num } from "@/lib/num";

let userId: string, employeeId: string, september: string, october: string, goalId: string;
let manager: AuthUser;
beforeAll(async () => {
  const u = await db.user.findUniqueOrThrow({ where: { email: "manager@store.local" }, include: { role: { include: { permissions: { include: { permission: true } } } }, employee: true } });
  const fixture = await db.user.create({ data: { email: `execution-periods-${Date.now()}@test.local`, name: "اختبار فترات التنفيذ", passwordHash: "unused-test-password", roleId: u.roleId, employee: { create: { fullName: "اختبار فترات التنفيذ", managerId: u.employee!.id } } }, include: { employee: true } });
  userId = fixture.id; employeeId = fixture.employee!.id;
  manager = { id: u.id, email: u.email, name: u.name, roleKey: u.role.key, roleName: u.role.name, permissions: new Set(u.role.permissions.map((p) => p.permission.key)), employeeId: u.employee!.id, employeeName: u.employee!.fullName, jobTitle: null, directReportIds: [employeeId], sessionId: "test" };
});
afterAll(async () => { if (userId) await db.user.delete({ where: { id: userId } }); });

describe("explicit execution periods", () => {
  it("creates September's four full weeks, ending October 2", async () => {
    const plan = await createMonthlyPlan(manager, { employeeId, year: 2026, month: 9, templateId: null, useTemplate: false, executionStartDate: "2026-09-05" });
    september = plan.id;
    expect(plan.weeksCount).toBe(4);
    expect(toDateKey(plan.executionEndDate!)).toBe("2026-10-02");
    const goal = await addGoal(manager, plan.id, { name: "صور المقالات", description: null, goalType: "NUMERIC", targetValue: 24, unit: "صورة", weight: 100, priority: "MEDIUM", source: "MANUAL", category: "PRODUCTIVITY", notionDataSourceId: null, notionFilter: null, startDate: null, dueDate: null });
    goalId = goal.id;
    await approvePlan(manager, plan.id);
    const weeks = await db.weeklyPlan.findMany({ where: { monthlyPlanId: plan.id }, orderBy: { weekIndex: "asc" } });
    expect(weeks).toHaveLength(4);
    expect(weeks.map((w) => [toDateKey(w.startDate), toDateKey(w.endDate)])).toEqual([["2026-09-05", "2026-09-11"], ["2026-09-12", "2026-09-18"], ["2026-09-19", "2026-09-25"], ["2026-09-26", "2026-10-02"]]);
    expect(weeks.every((w) => diffDays(toDateKey(w.endDate), toDateKey(w.startDate)) === 6)).toBe(true);
  });
  it("chains the automatic start to October 3 and switches current plans by date", async () => {
    const plan = await createMonthlyPlan(manager, { employeeId, year: 2026, month: 10, templateId: null, useTemplate: false });
    october = plan.id;
    expect(toDateKey(plan.executionStartDate!)).toBe("2026-10-03");
    expect(toDateKey(plan.executionEndDate!)).toBe("2026-10-30");
    for (const [day, id] of [["2026-10-02", september], ["2026-10-03", october]]) expect((await db.monthlyPlan.findFirst({ where: { employeeId, ...currentPlanWhere(day) } }))?.id).toBe(id);
  });
  it("rejects overlapping plans and daily tasks outside the owning plan", async () => {
    await expect(createMonthlyPlan(manager, { employeeId, year: 2026, month: 11, templateId: null, useTemplate: false, executionStartDate: "2026-10-01" })).rejects.toThrow("تتداخل");
    const goal = await db.monthlyGoal.create({ data: { planId: october, employeeId, name: "هدف أكتوبر" } });
    await expect(assertTaskInPlan(goal.id, "2026-10-01")).rejects.toThrow("خارج فترة");
    await expect(assertTaskInPlan(goal.id, "2026-10-03")).resolves.toBeUndefined();
  });
  it("September's report includes October 2 achievements, not October's goals", async () => {
    await db.dailyTask.create({ data: { employeeId, monthlyGoalId: goalId, title: "إنجاز 2 أكتوبر", date: fromDateKey("2026-10-02"), target: 3, achieved: 3, status: "COMPLETED" } });
    await recomputePlan(september);
    const content = await buildMonthlyContent(september);
    expect(content.period.end).toBe("2026-10-02");
    expect(content.goals.find((g) => g.goalId === goalId)?.achieved).toBeGreaterThanOrEqual(3);
    expect((await buildMonthlyContent(october)).goals.some((g) => g.goalId === goalId)).toBe(false);
  });
  it("requires confirmation, preserves completed tasks and notes, and redistributes pending tasks", async () => {
    await expect(updatePlanPeriod(manager, september, { executionStartDate: "2026-09-05", weeksCount: 4, confirmed: false })).rejects.toThrow("أكّد");
    const completed = await db.dailyTask.findFirstOrThrow({ where: { monthlyGoalId: goalId, status: "COMPLETED" } });
    await db.dailyTask.update({ where: { id: completed.id }, data: { notes: "لا تضيع الملاحظة" } });
    await updatePlanPeriod(manager, september, { executionStartDate: "2026-09-05", weeksCount: 4, confirmed: true });
    const saved = await db.dailyTask.findUniqueOrThrow({ where: { id: completed.id } });
    expect(saved.notes).toBe("لا تضيع الملاحظة");
    expect(num(saved.achieved)).toBe(3);
    expect(toDateKey(saved.date)).toBe("2026-10-02");
    const tasks = await db.dailyTask.findMany({ where: { monthlyGoalId: goalId, status: { not: "CANCELLED" } } });
    expect(tasks.every((t) => toDateKey(t.date) >= "2026-09-05" && toDateKey(t.date) <= "2026-10-02")).toBe(true);
  });
  it("editing from four to five weeks extends the end without calendar clipping", async () => {
    await updatePlanPeriod(manager, october, { executionStartDate: "2026-10-03", weeksCount: 5, confirmed: false });
    const plan = await db.monthlyPlan.findUniqueOrThrow({ where: { id: october }, include: { weeklyPlans: true } });
    expect(plan.weeksCount).toBe(5);
    expect(toDateKey(plan.executionEndDate!)).toBe("2026-11-06");
    expect(plan.weeklyPlans).toHaveLength(5);
    expect(await planSpan(plan)).toEqual({ start: "2026-10-03", end: "2026-11-06" });
  });
  it("reschedules October 1 pending work from October 3 without losing its notes", async () => {
    const goal = await db.monthlyGoal.findFirstOrThrow({ where: { planId: october } });
    await db.monthlyGoal.update({ where: { id: goal.id }, data: { targetValue: 24 } });
    const task = await db.dailyTask.create({ data: { employeeId, monthlyGoalId: goal.id, title: "عمل أكتوبر", date: fromDateKey("2026-10-01"), target: 1, source: "DISTRIBUTED", notes: "تفاصيل يجب حفظها" } });
    await updatePlanPeriod(manager, october, { executionStartDate: "2026-10-03", weeksCount: 4, confirmed: false });
    const saved = await db.dailyTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(toDateKey(saved.date)).toBe("2026-10-03");
    expect(saved.notes).toBe("تفاصيل يجب حفظها");
    expect(saved.status).not.toBe("CANCELLED");
    expect(saved.weeklyGoalId).toBeTruthy();
  });
  it("blocks completed work outside the new period and rolls the rebuild back", async () => {
    const goal = await db.monthlyGoal.findFirstOrThrow({ where: { planId: october } });
    const task = await db.dailyTask.create({ data: { employeeId, monthlyGoalId: goal.id, title: "يحتاج مراجعة", date: fromDateKey("2026-10-01"), achieved: 1, status: "COMPLETED" } });
    await expect(updatePlanPeriod(manager, october, { executionStartDate: "2026-10-03", weeksCount: 4, confirmed: false })).rejects.toThrow("راجعها");
    expect((await db.dailyTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("COMPLETED");
    expect(toDateKey((await db.monthlyPlan.findUniqueOrThrow({ where: { id: october } })).executionEndDate!)).toBe("2026-10-30");
    await db.dailyTask.delete({ where: { id: task.id } });
  });
  it("keeps a surplus week's report instead of deleting it when shrinking", async () => {
    await updatePlanPeriod(manager, october, { executionStartDate: "2026-10-03", weeksCount: 5, confirmed: false });
    const week = await db.weeklyPlan.findFirstOrThrow({ where: { monthlyPlanId: october, weekIndex: 5 } });
    const report = await db.weeklyReport.create({ data: { weeklyPlanId: week.id, employeeId, weekStart: week.startDate, weekEnd: week.endDate, content: {}, generatedText: "تقرير محفوظ", employeeNotes: "ملاحظة" } });
    await expect(updatePlanPeriod(manager, october, { executionStartDate: "2026-10-03", weeksCount: 4, confirmed: false })).rejects.toThrow("تقارير محفوظة");
    expect((await db.weeklyReport.findUniqueOrThrow({ where: { id: report.id } })).employeeNotes).toBe("ملاحظة");
    expect((await db.monthlyPlan.findUniqueOrThrow({ where: { id: october } })).weeksCount).toBe(5);
  });
  it("serializes concurrent creations so only one overlapping plan succeeds", async () => {
    const results = await Promise.allSettled([11, 12].map((month) => createMonthlyPlan(manager, { employeeId, year: 2026, month, templateId: null, useTemplate: false, executionStartDate: "2026-11-07" })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
  it("uses stored weekly bounds and calendar bounds only for legacy fallback", async () => {
    const legacy = { employeeId, year: 2026, month: 9, weeklyPlans: [{ startDate: fromDateKey("2026-09-05"), endDate: fromDateKey("2026-10-02") }] };
    expect(await planSpan(legacy)).toEqual({ start: "2026-09-05", end: "2026-10-02" });
    expect(await planSpan({ ...legacy, weeklyPlans: [] })).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });
});
