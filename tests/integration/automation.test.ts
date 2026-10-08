/**
 * The normal workflow needs no manual "generate / recalculate / refresh" step (DATABASE_URL_TEST):
 * approving a plan distributes it into weeks and daily tasks, achievement updates progress,
 * the daily job creates the evaluation draft, and later plan changes refresh that draft.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import * as plans from "@/server/services/plans";
import * as manual from "@/server/services/manual";
import { ensureDraftEvaluations } from "@/server/services/jobs";
import { updateTaskProgress } from "@/server/services/tasks";
import { weightedProgress } from "@/lib/weighted-progress";
import { toDateKey } from "@/lib/dates";
import { num } from "@/lib/num";

const Y = 2036;
const M = 3;

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

let manager: AuthUser, employee: AuthUser, emp: string, planId: string, goalId: string;
const cleanup = async () => {
  await db.performanceEvaluation.deleteMany({ where: { employeeId: emp, year: Y } });
  await db.monthlyPlan.deleteMany({ where: { employeeId: emp, year: Y } });
};

beforeAll(async () => {
  [manager, employee] = await Promise.all([authUser("manager@store.local"), authUser("products@store.local")]);
  emp = employee.employeeId!;
  await cleanup();
});
afterAll(cleanup);

describe("automatic workflow", () => {
  it("approving a plan creates its weeks, weekly targets and daily tasks — no extra step", async () => {
    const plan = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: M, templateId: null, useTemplate: false, executionStartDate: `${Y}-03-01`, weeksCount: 4 });
    planId = plan.id;
    await plans.addGoal(manager, planId, {
      name: "إضافة منتجات جديدة", description: null, goalType: "NUMERIC", targetValue: 80, unit: "منتج", weight: 100, priority: "HIGH",
      source: "MANUAL", category: "PRODUCTIVITY", notionDataSourceId: null, notionFilter: null, startDate: null, dueDate: null,
    });
    goalId = (await db.monthlyGoal.findFirstOrThrow({ where: { planId } })).id;
    await plans.approvePlan(manager, planId, "معتمد");

    const weeks = await db.weeklyPlan.findMany({ where: { monthlyPlanId: planId }, include: { goals: true }, orderBy: { weekIndex: "asc" } });
    expect(weeks).toHaveLength(4);
    expect(weeks.reduce((a, w) => a + w.goals.reduce((b, g) => b + num(g.targetValue), 0), 0)).toBe(80);
    const tasks = await db.dailyTask.findMany({ where: { monthlyGoalId: goalId, status: { not: "CANCELLED" } } });
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.weeklyGoalId && toDateKey(t.date) >= `${Y}-03-01` && toDateKey(t.date) <= `${Y}-03-28`)).toBe(true);
  });

  it("entering achievement updates goal, week and progress automatically", async () => {
    await manual.setManualAchievement(employee, goalId, { value: 40, date: `${Y}-03-03` });
    const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalId } });
    expect([num(goal.achievedValue), num(goal.progressPct)]).toEqual([40, 50]);
    const week1 = await db.weeklyGoal.findFirstOrThrow({ where: { monthlyGoalId: goalId, weeklyPlan: { weekIndex: 1 } } });
    expect(num(week1.achievedValue)).toBe(40);
  });

  it("the daily job creates the evaluation draft once (idempotent)", async () => {
    await db.monthlyPlan.update({ where: { id: planId }, data: { status: "IN_PROGRESS" } });
    expect(await db.performanceEvaluation.count({ where: { monthlyPlanId: planId } })).toBe(0);
    const today = `${Y}-03-10`;
    expect(await ensureDraftEvaluations(today)).toBeGreaterThanOrEqual(1);
    const e = await db.performanceEvaluation.findUniqueOrThrow({ where: { monthlyPlanId: planId }, include: { duties: { include: { indicators: true }, orderBy: { sortOrder: "asc" } } } });
    expect(e.status).toBe("DRAFT");
    // the duties are copied from the evaluation template the manager configured
    const template = await db.evaluationTemplate.findUniqueOrThrow({ where: { id: e.templateId! }, include: { duties: { orderBy: { sortOrder: "asc" } } } });
    expect(e.duties.map((d) => num(d.weight))).toEqual(template.duties.map((d) => num(d.weight)));
    expect(e.duties.reduce((a, d) => a + num(d.weight), 0)).toBe(100);
    expect(e.duties[1].indicators.find((i) => i.sourceId === goalId)).toMatchObject({ sourceType: "MONTHLY_GOAL" });
    expect(num(e.duties[1].indicators.find((i) => i.sourceId === goalId)!.achieved)).toBe(40);
    // running it again creates nothing new
    await ensureDraftEvaluations(today);
    expect(await db.performanceEvaluation.count({ where: { monthlyPlanId: planId } })).toBe(1);
  });

  it("a later plan change refreshes the draft evaluation automatically", async () => {
    await manual.setManualAchievement(employee, goalId, { value: 80, date: `${Y}-03-10` });
    const e = await db.performanceEvaluation.findUniqueOrThrow({ where: { monthlyPlanId: planId }, include: { duties: { include: { indicators: true }, orderBy: { sortOrder: "asc" } } } });
    const ind = e.duties[1].indicators.find((i) => i.sourceId === goalId)!;
    expect([num(ind.achieved), num(ind.score)]).toEqual([80, 100]);
    expect(num(e.duties[1].score)).toBe(100);
  });
});

describe("every change recalculates progress and the draft evaluation", () => {
  let editId: string;
  const evaluationIndicators = async () =>
    (await db.performanceEvaluation.findUniqueOrThrow({ where: { monthlyPlanId: planId }, include: { duties: { include: { indicators: true } } } })).duties.flatMap((d) => d.indicators);
  const planProgress = async () => weightedProgress(await db.monthlyGoal.findMany({ where: { planId } }));
  const goalInput = (g: { name: string; targetValue: unknown; unit: string; weight: unknown }, weight: number) => ({
    name: g.name, description: null, goalType: "NUMERIC" as const, targetValue: num(g.targetValue), unit: g.unit, weight, priority: "HIGH" as const,
    source: "MANUAL" as const, category: "PRODUCTIVITY" as const, notionDataSourceId: null, notionFilter: null, startDate: null, dueDate: null,
  });

  it("a goal added to a running plan gets weeks, tasks and an evaluation indicator automatically", async () => {
    await plans.addGoal(manager, planId, goalInput({ name: "تعديل منتجات سابقة", targetValue: 40, unit: "منتج", weight: 50 }, 50));
    editId = (await db.monthlyGoal.findFirstOrThrow({ where: { planId, name: "تعديل منتجات سابقة" } })).id;
    expect(await db.weeklyGoal.count({ where: { monthlyGoalId: editId } })).toBe(4);
    expect(await db.dailyTask.count({ where: { monthlyGoalId: editId, status: { not: "CANCELLED" } } })).toBeGreaterThan(0);
    expect((await evaluationIndicators()).some((i) => i.sourceId === editId)).toBe(true);
  });

  it("completing a daily task: reaching its target completes it and updates goal and evaluation", async () => {
    const task = await db.dailyTask.findFirstOrThrow({ where: { monthlyGoalId: editId, status: { not: "CANCELLED" }, target: { gt: 0 } }, orderBy: { date: "asc" } });
    const updated = await updateTaskProgress(employee, task.id, { status: "IN_PROGRESS", achieved: num(task.target), notes: null, delayReason: null });
    expect(updated.status).toBe("COMPLETED");
    const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: editId } });
    expect(num(goal.achievedValue)).toBe(num(task.target));
    expect(num((await evaluationIndicators()).find((i) => i.sourceId === editId)!.achieved)).toBe(num(task.target));
  });

  it("changing a goal weight changes the weighted progress and the evaluation weights", async () => {
    const before = await planProgress();
    const beforeWeight = num((await evaluationIndicators()).find((i) => i.sourceId === editId)!.weight);
    const g = await db.monthlyGoal.findUniqueOrThrow({ where: { id: editId } });
    await plans.updateGoal(manager, editId, goalInput(g, 10));
    expect(await planProgress()).not.toBe(before);
    expect(num((await evaluationIndicators()).find((i) => i.sourceId === editId)!.weight)).not.toBe(beforeWeight);
  });

  it("cancelling a goal removes it from progress and from the evaluation", async () => {
    await plans.cancelGoal(manager, editId, "لم يعد مطلوبًا");
    const goals = await db.monthlyGoal.findMany({ where: { planId } });
    expect(await planProgress()).toBe(weightedProgress(goals.filter((x) => x.id !== editId)));
    const ind = (await evaluationIndicators()).find((i) => i.sourceId === editId);
    expect(ind === undefined || num(ind.weight) === 0).toBe(true);
  });
});
