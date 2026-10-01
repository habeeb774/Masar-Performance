/**
 * Execution periods end-to-end (DATABASE_URL_TEST): a plan runs from executionStartDate for
 * weeksCount × 7 days, whatever its administrative month. Covers creation, overlap, current
 * plan, monthly report span, the clean-start purge + reset, and the protected rebuild.
 * Uses 2034 so the dates mirror Sep / Oct 2026 without touching real-looking data.
 */
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import * as plans from "@/server/services/plans";
import { findCurrentPlan } from "@/server/services/periods";
import { purgePlans, rebuildPlanExecutionPeriod, resetPlanExecutionPeriod } from "@/server/services/plan-execution";
import { buildMonthlyContent, generateWeeklyReport } from "@/server/services/reports";
import { diffDays, toDateKey } from "@/lib/dates";

const Y = 2034;

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

let manager: AuthUser, employee: AuthUser, emp: string;
let septId: string, octId: string;

const cleanup = () => db.monthlyPlan.deleteMany({ where: { employeeId: emp, year: Y } });
const weeksOf = async (planId: string) =>
  (await db.weeklyPlan.findMany({ where: { monthlyPlanId: planId }, orderBy: { weekIndex: "asc" } })).map((w) => [toDateKey(w.startDate), toDateKey(w.endDate)]);
const taskDates = async (planId: string) => (await db.dailyTask.findMany({ where: { monthlyGoal: { planId }, status: { not: "CANCELLED" } }, select: { date: true } })).map((t) => toDateKey(t.date));

beforeAll(async () => {
  [manager, employee] = await Promise.all([authUser("manager@store.local"), authUser("products@store.local")]);
  emp = employee.employeeId!;
  await cleanup();
});
afterAll(cleanup);

describe("execution periods", () => {
  it("September: 5 Sep + 4 weeks → ends 2 Oct, 4 full weeks", async () => {
    const plan = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: 9, templateId: null, useTemplate: false, executionStartDate: `${Y}-09-05`, weeksCount: 4 });
    septId = plan.id;
    await plans.addGoal(manager, septId, goal("إضافة المنتجات", 80));
    await plans.approvePlan(manager, septId, "معتمد");
    expect(await weeksOf(septId)).toEqual([
      [`${Y}-09-05`, `${Y}-09-11`], [`${Y}-09-12`, `${Y}-09-18`], [`${Y}-09-19`, `${Y}-09-25`], [`${Y}-09-26`, `${Y}-10-02`],
    ]);
    const tasks = await taskDates(septId);
    expect(tasks.every((d) => d >= `${Y}-09-05` && d <= `${Y}-10-02`)).toBe(true);
  });

  it("the monthly report of September covers 1–2 Oct", async () => {
    const c = await buildMonthlyContent(septId);
    expect(c.period).toMatchObject({ start: `${Y}-09-05`, end: `${Y}-10-02` });
    expect(c.weeks.at(-1)).toMatchObject({ start: `${Y}-09-26`, end: `${Y}-10-02` });
  });

  it("overlap: 1 Oct – 28 Oct is refused, the default start is 3 Oct", async () => {
    await expect(plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: 10, templateId: null, useTemplate: false, executionStartDate: `${Y}-10-01`, weeksCount: 4 })).rejects.toThrow("تتداخل");
    const oct = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: 10, templateId: null, useTemplate: false, weeksCount: 4 });
    expect(toDateKey(oct.executionStartDate!)).toBe(`${Y}-10-03`);
    expect(toDateKey(oct.executionEndDate!)).toBe(`${Y}-10-30`);
    await db.monthlyPlan.delete({ where: { id: oct.id } });
  });

  it("current plan follows execution dates: 2 Oct → September, 3 Oct → October", async () => {
    const oct = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: 10, templateId: null, useTemplate: false, weeksCount: 4 });
    expect((await findCurrentPlan(emp, `${Y}-10-01`))?.id).toBe(septId);
    expect((await findCurrentPlan(emp, `${Y}-10-02`))?.id).toBe(septId);
    expect((await findCurrentPlan(emp, `${Y}-10-03`))?.id).toBe(oct.id);
    expect((await findCurrentPlan(emp, `${Y}-10-30`))?.id).toBe(oct.id);
    expect(await findCurrentPlan(emp, `${Y}-10-31`)).toBeNull();
    // the October monthly report never includes 1–2 Oct
    expect((await buildMonthlyContent(oct.id)).period).toMatchObject({ start: `${Y}-10-03`, end: `${Y}-10-30` });
    await db.monthlyPlan.delete({ where: { id: oct.id } });
  });
});

describe("clean start: purge the old plan, reset the wrong October plan", () => {
  it("purge: dry run writes nothing, apply deletes the plan and its tasks (no orphans)", async () => {
    await generateWeeklyReport((await db.weeklyPlan.findFirstOrThrow({ where: { monthlyPlanId: septId, weekIndex: 1 } })).id);
    const goalIds = (await db.monthlyGoal.findMany({ where: { planId: septId }, select: { id: true } })).map((g) => g.id);
    const taskIds = (await db.dailyTask.findMany({ where: { monthlyGoalId: { in: goalIds } }, select: { id: true } })).map((t) => t.id);
    const taskCount = taskIds.length;
    expect(taskCount).toBeGreaterThan(0);

    const dry = await purgePlans({ employeeId: emp, year: Y, month: { lt: 10 } }, false);
    expect(dry).toMatchObject({ applied: false, counts: { monthlyPlans: 1, weeklyPlans: 4, weeklyReports: 1, dailyTasks: taskCount } });
    expect(await db.monthlyPlan.count({ where: { id: septId } })).toBe(1);

    const done = await purgePlans({ employeeId: emp, year: Y, month: { lt: 10 } }, true);
    expect(done.applied).toBe(true);
    expect(await db.monthlyPlan.count({ where: { id: septId } })).toBe(0);
    // DailyTask → MonthlyGoal is SetNull: the tasks are deleted explicitly, none is left orphaned
    expect(await db.dailyTask.count({ where: { id: { in: taskIds } } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "plan.purged", createdAt: { gte: new Date(Date.now() - 60_000) } } })).toBeGreaterThan(0);
  });

  it("an October plan built the old way (1 Oct, 5 weeks) has tasks on 1–2 Oct", async () => {
    const oct = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: 10, templateId: null, useTemplate: false, executionStartDate: `${Y}-10-01`, weeksCount: 5 });
    octId = oct.id;
    await plans.addGoal(manager, octId, goal("إضافة المنتجات", 100));
    await plans.addGoal(manager, octId, goal("تجهيز الصور", 100));
    await plans.approvePlan(manager, octId, "معتمد");
    expect(await weeksOf(octId)).toHaveLength(5);
    expect((await taskDates(octId)).some((d) => d === `${Y}-10-01` || d === `${Y}-10-02`)).toBe(true);
  });

  it("reset dry run writes nothing", async () => {
    const before = await taskDates(octId);
    const r = await resetPlanExecutionPeriod(octId, { executionStartDate: `${Y}-10-03`, weeksCount: 4, apply: false });
    expect(r).toMatchObject({ applied: false, conflicts: [], weeklyPlansRemoved: 5 });
    expect(r.after.weeks).toHaveLength(4);
    expect(await weeksOf(octId)).toHaveLength(5);
    expect((await taskDates(octId)).sort()).toEqual(before.sort());
  });

  it("reset apply: 4 weeks 3 → 30 Oct, no 5th week, no task on 1–2 Oct, all tasks inside the period", async () => {
    const r = await resetPlanExecutionPeriod(octId, { executionStartDate: `${Y}-10-03`, weeksCount: 4, apply: true });
    expect(r.applied).toBe(true);
    const weeks = await weeksOf(octId);
    expect(weeks).toEqual([[`${Y}-10-03`, `${Y}-10-09`], [`${Y}-10-10`, `${Y}-10-16`], [`${Y}-10-17`, `${Y}-10-23`], [`${Y}-10-24`, `${Y}-10-30`]]);
    for (const [s, e] of weeks) expect(diffDays(e, s)).toBe(6);
    const plan = await db.monthlyPlan.findUniqueOrThrow({ where: { id: octId } });
    expect([toDateKey(plan.executionStartDate!), toDateKey(plan.executionEndDate!), plan.weeksCount]).toEqual([`${Y}-10-03`, `${Y}-10-30`, 4]);
    const dates = await taskDates(octId);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((d) => d >= `${Y}-10-03` && d <= `${Y}-10-30`)).toBe(true);
    // weekly targets never exceed the monthly target
    for (const g of await db.monthlyGoal.findMany({ where: { planId: octId }, include: { weeklyGoals: true } }))
      expect(g.weeklyGoals.reduce((a, w) => a + Number(w.targetValue), 0)).toBeLessThanOrEqual(Number(g.targetValue) + 1e-9);
    expect((await findCurrentPlan(emp, `${Y}-10-02`))).toBeNull();
    expect((await findCurrentPlan(emp, `${Y}-10-03`))?.id).toBe(octId);
    expect(await db.auditLog.count({ where: { entityId: octId, action: "plan.execution_period_rebuilt" } })).toBe(1);
  });

  it("rebuild protects a completed task: moving it out of the period is a conflict and nothing changes", async () => {
    const first = await db.dailyTask.findFirstOrThrow({ where: { monthlyGoal: { planId: octId }, date: { lte: new Date(`${Y}-10-09T00:00:00Z`) } }, orderBy: { date: "asc" } });
    await db.dailyTask.update({ where: { id: first.id }, data: { status: "COMPLETED", achieved: first.target, completedAt: new Date() } });
    const before = await weeksOf(octId);
    const r = await rebuildPlanExecutionPeriod(octId, { executionStartDate: `${Y}-10-10`, weeksCount: 3, apply: true });
    expect(r.applied).toBe(false);
    expect(r.conflicts.length).toBeGreaterThan(0);
    expect(await weeksOf(octId)).toEqual(before);
    expect((await db.dailyTask.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("COMPLETED");
    // a preview that keeps the task inside works and still writes nothing
    const preview = await rebuildPlanExecutionPeriod(octId, { executionStartDate: `${Y}-10-03`, weeksCount: 5, apply: false });
    expect(preview).toMatchObject({ applied: false, conflicts: [], protectedCompletedTasks: 1, weeklyPlansCreated: 1 });
    expect(await weeksOf(octId)).toEqual(before);
  });

  it("the migration script is a dry run by default", () => {
    const out = execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate-plan-execution-periods.ts", `--plan=${octId}`, "--start=2034-10-03", "--weeks=5", "--test-db"], { encoding: "utf8", env: process.env });
    expect(out).toContain("DRY RUN");
    expect(out).toContain("2034-10-03 → 2034-11-06");
    expect(out).toContain("Dry run — nothing written.");
  });
});
