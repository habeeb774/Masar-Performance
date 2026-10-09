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
import { ensureDraftEvaluations, ensureMissingGoalTasks } from "@/server/services/jobs";
import { recomputeForDataSource } from "@/server/services/progress";
import { syncDataSource } from "@/server/notion/sync";
import { encryptSecret } from "@/server/crypto";
import { DEFAULT_TEMPLATE } from "@/server/services/evaluation";
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
  await db.notionConnection.deleteMany({ where: { name: "integration-automation" } });
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

describe("self-healing: a goal of a running plan without any task gets its tasks", () => {
  it("the daily job regenerates the missing tasks and leaves other goals alone", async () => {
    const others = await db.dailyTask.count({ where: { monthlyGoal: { planId }, NOT: { monthlyGoalId: goalId } } });
    await db.dailyTask.deleteMany({ where: { monthlyGoalId: goalId } });
    expect(await ensureMissingGoalTasks()).toBeGreaterThanOrEqual(1);
    const tasks = await db.dailyTask.findMany({ where: { monthlyGoalId: goalId } });
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.weeklyGoalId && toDateKey(t.date) >= `${Y}-03-01` && toDateKey(t.date) <= `${Y}-03-28`)).toBe(true);
    expect(await db.dailyTask.count({ where: { monthlyGoal: { planId }, NOT: { monthlyGoalId: goalId } } })).toBe(others);
    // a second run has nothing left to heal for this goal
    const again = await db.dailyTask.count({ where: { monthlyGoalId: goalId } });
    await ensureMissingGoalTasks();
    expect(await db.dailyTask.count({ where: { monthlyGoalId: goalId } })).toBe(again);
  });
});

describe("self-healing: a running plan from before automation, with no weeks and no tasks", () => {
  it("the daily job creates its weeks, weekly targets and daily tasks", async () => {
    const plan = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: 7, templateId: null, useTemplate: false, executionStartDate: `${Y}-07-01`, weeksCount: 4 });
    await plans.addGoal(manager, plan.id, {
      name: "تصميم بنرات جديدة للمتجر.", description: null, goalType: "NUMERIC", targetValue: 8, unit: "بنر", weight: 100, priority: "HIGH",
      source: "MANUAL", category: "PRODUCTIVITY", notionDataSourceId: null, notionFilter: null, startDate: null, dueDate: null,
    });
    // a legacy plan: approved directly in the database, nothing was ever generated
    await db.monthlyPlan.update({ where: { id: plan.id }, data: { status: "IN_PROGRESS" } });
    expect(await db.weeklyPlan.count({ where: { monthlyPlanId: plan.id } })).toBe(0);
    await ensureMissingGoalTasks();
    const weeks = await db.weeklyPlan.findMany({ where: { monthlyPlanId: plan.id }, include: { goals: true } });
    expect(weeks).toHaveLength(4);
    expect(weeks.reduce((a, w) => a + w.goals.reduce((b, g) => b + num(g.targetValue), 0), 0)).toBe(8);
    const tasks = await db.dailyTask.findMany({ where: { monthlyGoal: { planId: plan.id } } });
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.reduce((a, t) => a + num(t.target), 0)).toBe(8);
  });
});

describe("Notion: the real sync engine (Notion API stubbed at HTTP) updates goal and draft evaluation", () => {
  const NM = 5;
  const DS_NOTION_ID = "bbbbbbbb-0000-0000-0000-00000000a070";
  const realFetch = globalThis.fetch;
  let pages: { id: string; title: string; store: string | null }[] = [];
  let dsId: string, notionPlanId: string, notionGoalId: string;
  const page = (r: (typeof pages)[number]) => ({
    object: "page", id: r.id, created_time: `${Y}-05-05T09:00:00.000Z`, last_edited_time: `${Y}-05-05T09:00:00.000Z`, archived: false, in_trash: false,
    url: `https://www.notion.so/${r.id.replace(/-/g, "")}`, public_url: null, icon: null, cover: null,
    parent: { type: "data_source_id", data_source_id: DS_NOTION_ID }, created_by: { object: "user", id: "u" }, last_edited_by: { object: "user", id: "u" },
    properties: {
      "اسم المنتج": { id: "title", type: "title", title: [{ type: "text", plain_text: r.title, text: { content: r.title, link: null }, annotations: {}, href: null }] },
      "الإضافة للمتجر": { id: "s", type: "select", select: r.store ? { id: "y", name: r.store, color: "default" } : null },
    },
  });
  const setPages = (done: number, total: number) => {
    pages = Array.from({ length: total }, (_, i) => ({ id: `bbbbbbbb-0000-0000-0070-${String(i).padStart(12, "0")}`, title: `منتج ${i}`, store: i < done ? "تم الإضافة" : null }));
  };
  /** what «مزامنة الآن» does: the sync engine, then the recompute */
  const syncNow = async () => {
    const r = await syncDataSource(dsId, "FULL_RESYNC");
    expect(r.status).not.toBe("FAILED");
    await recomputeForDataSource(dsId);
  };

  beforeAll(async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname !== "api.notion.com") return realFetch(input, init);
      if (url.pathname === `/v1/data_sources/${DS_NOTION_ID}/query`)
        return new Response(JSON.stringify({ object: "list", type: "page_or_data_source", page_or_data_source: {}, results: pages.map(page), next_cursor: null, has_more: false }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ object: "error", status: 404, code: "object_not_found", message: "not stubbed" }), { status: 404, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const conn = await db.notionConnection.create({ data: { name: "integration-automation", tokenEncrypted: encryptSecret("ntn_stubbed_token_not_real_0000000"), tokenHint: "0000", status: "CONNECTED" } });
    const ds = await db.notionDataSource.create({ data: { connectionId: conn.id, name: "منتجات (أتمتة)", notionDatabaseId: "db-auto", notionDataSourceId: DS_NOTION_ID, syncEnabled: false, defaultEmployeeId: emp } });
    dsId = ds.id;
    await db.notionFieldMapping.create({ data: { dataSourceId: dsId, role: "TITLE", notionProperty: "اسم المنتج", notionPropertyType: "title", label: "اسم المنتج" } });
    await db.notionFieldMapping.create({
      data: { dataSourceId: dsId, role: "STATUS", notionProperty: "الإضافة للمتجر", notionPropertyType: "select", stageKey: "store", label: "الإضافة للمتجر", statusMappings: { create: [{ notionValue: "تم الإضافة", systemStatus: "COMPLETED" }] } },
    });
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it("first sync: the Notion goal of an approved plan is computed from the pages, the draft evaluation follows", async () => {
    setPages(10, 40);
    const plan = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: NM, templateId: null, useTemplate: false, executionStartDate: `${Y}-05-01`, weeksCount: 4 });
    notionPlanId = plan.id;
    await plans.addGoal(manager, notionPlanId, {
      name: "إضافة منتجات جديدة", description: null, goalType: "NOTION_SYNCED", targetValue: 40, unit: "منتج", weight: 100, priority: "HIGH",
      source: "NOTION", category: "PRODUCTIVITY", notionDataSourceId: dsId,
      notionFilter: { stageKey: "store", completedStatuses: ["COMPLETED"], completedRawValues: [], conditions: [], dateBasis: "NONE", matchEmployee: false },
      startDate: null, dueDate: null,
    });
    notionGoalId = (await db.monthlyGoal.findFirstOrThrow({ where: { planId: notionPlanId } })).id;
    await plans.approvePlan(manager, notionPlanId, "معتمد");
    await db.monthlyPlan.update({ where: { id: notionPlanId }, data: { status: "IN_PROGRESS" } });
    await syncNow();
    expect(await db.notionSyncedItem.count({ where: { dataSourceId: dsId } })).toBe(40);
    expect(num((await db.monthlyGoal.findUniqueOrThrow({ where: { id: notionGoalId } })).achievedValue)).toBe(10);
    await ensureDraftEvaluations(`${Y}-05-10`);
    const e = await db.performanceEvaluation.findUniqueOrThrow({ where: { monthlyPlanId: notionPlanId }, include: { duties: { include: { indicators: true } } } });
    expect(num(e.duties.flatMap((d) => d.indicators).find((i) => i.sourceId === notionGoalId)!.achieved)).toBe(10);
  });

  it("next sync: more products added in Notion update goal, progress and the draft evaluation", async () => {
    setPages(30, 40);
    await syncNow();
    const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: notionGoalId } });
    expect([num(goal.achievedValue), num(goal.progressPct)]).toEqual([30, 75]);
    const e = await db.performanceEvaluation.findUniqueOrThrow({ where: { monthlyPlanId: notionPlanId }, include: { duties: { include: { indicators: true } } } });
    const ind = e.duties.flatMap((d) => d.indicators).find((i) => i.sourceId === notionGoalId)!;
    expect([num(ind.achieved), num(ind.score)]).toEqual([30, 75]);
  });
});

describe("one evaluation template for every automatic path", () => {
  it("every draft is built from the official template; a drifted template is restored; approved evaluations never change", async () => {
    const official = DEFAULT_TEMPLATE.duties.map((d) => d.weight);
    expect(official).toEqual([20, 40, 20, 20]);
    // every automatic draft so far (daily job, Notion plan, legacy plan) uses the official weights
    const drafts = await db.performanceEvaluation.findMany({ where: { employeeId: emp, year: Y }, include: { duties: { orderBy: { sortOrder: "asc" } } } });
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    for (const d of drafts) expect(d.duties.map((x) => num(x.weight))).toEqual(official);

    // approve one, then let the stored template drift
    const approved = drafts.find((d) => d.monthlyPlanId === planId)!;
    await db.performanceEvaluation.update({ where: { id: approved.id }, data: { status: "APPROVED" } });
    const template = await db.evaluationTemplate.findFirstOrThrow({ where: { name: DEFAULT_TEMPLATE.name }, include: { duties: { orderBy: { sortOrder: "asc" } } } });
    await db.evaluationTemplateDuty.update({ where: { id: template.duties[1].id }, data: { weight: 25 } });
    await db.evaluationTemplateDuty.update({ where: { id: template.duties[3].id }, data: { weight: 35 } });

    // the next automatic draft restores the official template and uses it
    const plan = await plans.createMonthlyPlan(manager, { employeeId: emp, year: Y, month: 9, templateId: null, useTemplate: false, executionStartDate: `${Y}-09-01`, weeksCount: 4 });
    await plans.addGoal(manager, plan.id, {
      name: "إضافة منتجات جديدة", description: null, goalType: "NUMERIC", targetValue: 10, unit: "منتج", weight: 100, priority: "HIGH",
      source: "MANUAL", category: "PRODUCTIVITY", notionDataSourceId: null, notionFilter: null, startDate: null, dueDate: null,
    });
    await plans.approvePlan(manager, plan.id, "معتمد");
    await db.monthlyPlan.update({ where: { id: plan.id }, data: { status: "IN_PROGRESS" } });
    await ensureDraftEvaluations(`${Y}-09-10`);
    const fresh = await db.performanceEvaluation.findUniqueOrThrow({ where: { monthlyPlanId: plan.id }, include: { duties: { orderBy: { sortOrder: "asc" } } } });
    expect(fresh.duties.map((x) => num(x.weight))).toEqual(official);
    const restored = await db.evaluationTemplate.findFirstOrThrow({ where: { name: DEFAULT_TEMPLATE.name }, include: { duties: { orderBy: { sortOrder: "asc" } } } });
    expect(restored.duties.map((x) => num(x.weight))).toEqual(official);
    // the approved evaluation kept its own copy
    const kept = await db.performanceEvaluation.findUniqueOrThrow({ where: { id: approved.id }, include: { duties: { orderBy: { sortOrder: "asc" } } } });
    expect(kept.duties.map((x) => num(x.weight))).toEqual(official);
    expect(kept.status).toBe("APPROVED");
  });
});
