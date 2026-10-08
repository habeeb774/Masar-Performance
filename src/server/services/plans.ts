import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { eachDay, executionEndDate, fromDateKey, isWorkDay, monthEnd, monthLabel, monthStart, planWeekPeriods, toDateKey, todayKey, type MonthWeek } from "@/lib/dates";
import { checkDistribution, suggestDailyTargets, suggestWeeklyTargets } from "@/lib/distribution";
import { num } from "@/lib/num";
import type { createPlanSchema, dailyDistributionSchema, monthlyGoalSchema, weeklyDistributionSchema } from "@/lib/validation";
import { getCompany } from "./company";
import { notifyUsers, managerUserIdsFor } from "./notifications";
import { recomputePlan } from "./progress";
import { assertNoPlanOverlap, firstPeriodStart, lockEmployeePeriods, planSpan } from "./periods";
import { isNotionGoal, reconcileSourceChange } from "./manual";
import { rebuildPlanExecutionPeriod } from "./plan-execution";

export async function updatePlanPeriod(user: AuthUser, planId: string, input: { executionStartDate: string; weeksCount: number; confirmed: boolean }) {
  const plan = await getPlanOrThrow(planId);
  assertEmployeeAccess(user, plan.employeeId);
  if (!canManagePlans(user)) throw new UserError("تغيير فترة التنفيذ متاح للمدير فقط");
  if (!["DRAFT", "SUBMITTED"].includes(plan.status) && !input.confirmed) throw new UserError("تغيير فترة التنفيذ سيعيد بناء الأسابيع والمهام غير المكتملة. أكّد التغيير أولًا");
  // transactional rebuild + audit «plan.execution_period_rebuilt» + recompute
  const report = await rebuildPlanExecutionPeriod(planId, { executionStartDate: input.executionStartDate, weeksCount: input.weeksCount, apply: true, user });
  if (!report.applied) throw new UserError(report.conflicts.join(" — ") || "تعذر تغيير فترة التنفيذ");
  return report;
}

/** What a period change would do — the same rebuild, rolled back. */
export async function previewPlanPeriod(user: AuthUser, planId: string, input: { executionStartDate: string; weeksCount: number }) {
  const plan = await getPlanOrThrow(planId);
  assertEmployeeAccess(user, plan.employeeId);
  if (!canManagePlans(user)) throw new UserError("تغيير فترة التنفيذ متاح للمدير فقط");
  return rebuildPlanExecutionPeriod(planId, { ...input, apply: false });
}

type ParsedGoalInput = z.output<typeof monthlyGoalSchema>;
type GoalInput = Omit<ParsedGoalInput, "distributionMode"> & { distributionMode?: ParsedGoalInput["distributionMode"] };

export async function getPlanOrThrow(planId: string) {
  const plan = await db.monthlyPlan.findUnique({
    where: { id: planId },
    include: { employee: { select: { id: true, fullName: true, userId: true, managerId: true } } },
  });
  if (!plan) throw new UserError("الخطة غير موجودة");
  return plan;
}

function canManagePlans(user: AuthUser) {
  return hasPermission(user, PERMISSIONS.PLANS_MANAGE);
}

/** Employees may edit their own draft; managers may edit any accessible plan. */
function assertCanEditGoals(user: AuthUser, plan: { employeeId: string; status: string }) {
  assertEmployeeAccess(user, plan.employeeId);
  if (canManagePlans(user)) return;
  if (plan.employeeId !== user.employeeId) throw new UserError("لا يمكنك تعديل هذه الخطة");
  if (plan.status !== "DRAFT") throw new UserError("لا يمكن تعديل الأهداف بعد إرسال الخطة");
}

function goalData(input: GoalInput) {
  return {
    name: input.name,
    dutyName: input.dutyName?.trim() || null,
    description: input.description,
    goalType: input.goalType,
    distributionMode: input.distributionMode ?? "DISTRIBUTED",
    targetValue: input.targetValue,
    unit: input.unit,
    weight: input.weight,
    priority: input.priority,
    source: input.source,
    category: input.category,
    startDate: input.startDate ? fromDateKey(input.startDate) : null,
    dueDate: input.dueDate ? fromDateKey(input.dueDate) : null,
    notionDataSourceId: input.source === "NOTION" ? input.notionDataSourceId : null,
    notionFilter: input.source === "NOTION" && input.notionFilter ? (input.notionFilter as Prisma.InputJsonValue) : undefined,
  };
}

export async function createMonthlyPlan(user: AuthUser, input: Omit<z.infer<typeof createPlanSchema>, "executionStartDate"> & { executionStartDate?: string | null }) {
  assertEmployeeAccess(user, input.employeeId);
  if (!canManagePlans(user) && input.employeeId !== user.employeeId) throw new UserError("لا يمكنك إنشاء خطة لموظف آخر");
  const employee = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
  const exists = await db.monthlyPlan.findUnique({
    where: { employeeId_year_month: { employeeId: input.employeeId, year: input.year, month: input.month } },
  });
  if (exists) throw new UserError(`توجد خطة لهذا الموظف في ${monthLabel(input.year, input.month)}`);

  const template = !input.useTemplate
    ? null
    : input.templateId
      ? await db.goalTemplate.findUnique({ where: { id: input.templateId }, include: { items: { orderBy: { sortOrder: "asc" } } } })
      : employee.jobTitleId
        ? await db.goalTemplate.findFirst({
            where: { jobTitleId: employee.jobTitleId, isActive: true },
            include: { items: { orderBy: { sortOrder: "asc" } } },
            orderBy: { updatedAt: "desc" },
          })
        : null;

  const plan = await db.$transaction(async (tx) => {
    await lockEmployeePeriods(tx, input.employeeId);
    const startKey = input.executionStartDate || await firstPeriodStart(input.employeeId, input.year, input.month, tx);
    const weeksCount = input.weeksCount ?? 4;
    const endKey = executionEndDate(startKey, weeksCount);
    await assertNoPlanOverlap(tx, input.employeeId, startKey, endKey);
    const start = fromDateKey(startKey);
    const end = fromDateKey(endKey);
    const created = await tx.monthlyPlan.create({
      data: {
        employeeId: input.employeeId,
        year: input.year,
        month: input.month,
        executionStartDate: start,
        executionEndDate: end,
        weeksCount,
        templateId: template?.id ?? null,
        createdById: user.id,
        goals: {
          create: (template?.items ?? []).map((item, i) => ({
            employeeId: input.employeeId,
            name: item.name,
            dutyName: item.dutyName,
            description: item.description,
            goalType: item.goalType,
            targetValue: item.targetValue,
            unit: item.unit,
            weight: item.weight,
            priority: item.priority,
            source: item.source,
            category: item.category,
            notionFilter: item.notionFilter ?? undefined,
            notionDataSourceId:
              item.source === "NOTION" && item.notionFilter && typeof item.notionFilter === "object"
                ? ((item.notionFilter as { dataSourceId?: string }).dataSourceId ?? null)
                : null,
            startDate: start,
            dueDate: end,
            sortOrder: i,
          })),
        },
      },
    });
    await audit({ user, action: "plan.create", entityType: "MonthlyPlan", entityId: created.id, after: { ...input, templateId: template?.id } }, tx);
    return created;
  });
  return plan;
}

export async function addGoal(user: AuthUser, planId: string, input: GoalInput) {
  const plan = await getPlanOrThrow(planId);
  assertCanEditGoals(user, plan);
  const count = await db.monthlyGoal.count({ where: { planId } });
  const goal = await db.monthlyGoal.create({
    data: {
      ...goalData(input),
      planId,
      employeeId: plan.employeeId,
      startDate: input.startDate ? fromDateKey(input.startDate) : plan.executionStartDate ?? fromDateKey(monthStart(plan.year, plan.month)),
      dueDate: input.dueDate ? fromDateKey(input.dueDate) : plan.executionEndDate ?? fromDateKey(monthEnd(plan.year, plan.month)),
      sortOrder: count,
    },
  });
  await audit({ user, action: "goal.create", entityType: "MonthlyGoal", entityId: goal.id, after: input });
  if (plan.status === "APPROVED" || plan.status === "IN_PROGRESS") {
    await ensureWeeklyPlans(planId);
    // a goal added to a running plan gets its daily tasks right away, like at approval —
    // only this goal, so the plan's other goals are never re-split
    await autoDistributePlan(planId, user.id, { onlyGoalId: goal.id });
    await recomputePlan(planId);
  }
  return goal;
}

export async function updateGoal(user: AuthUser, goalId: string, input: GoalInput) {
  const before = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalId }, include: { plan: true } });
  assertCanEditGoals(user, before.plan);
  const after = await db.monthlyGoal.update({ where: { id: goalId }, data: goalData(input) });
  await audit({ user, action: "goal.update", entityType: "MonthlyGoal", entityId: goalId, before, after, diff: true });
  if (["APPROVED", "IN_PROGRESS", "COMPLETED"].includes(before.plan.status)) {
    if (isNotionGoal(before) !== isNotionGoal(after)) await reconcileSourceChange(user, goalId, isNotionGoal(before), num(before.achievedValue));
    else await recomputePlan(before.planId);
  }
  return after;
}

export async function deleteGoal(user: AuthUser, goalId: string) {
  const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalId }, include: { plan: true } });
  assertCanEditGoals(user, goal.plan);
  // once a plan is approved its weeks/tasks are already generated from this goal — cancel it instead of deleting
  if (!["DRAFT", "SUBMITTED"].includes(goal.plan.status)) {
    throw new UserError("لا يمكن حذف هدف بعد اعتماد الخطة — استخدم إلغاء الهدف بدلًا من ذلك");
  }
  await db.monthlyGoal.delete({ where: { id: goalId } });
  await audit({ user, action: "goal.delete", entityType: "MonthlyGoal", entityId: goalId, before: goal });
}

export async function cancelGoal(user: AuthUser, goalId: string, reason: string) {
  const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalId }, include: { plan: true } });
  if (!canManagePlans(user)) throw new UserError("إلغاء الأهداف من صلاحيات المدير");
  assertEmployeeAccess(user, goal.employeeId);
  await db.monthlyGoal.update({ where: { id: goalId }, data: { status: "CANCELLED" } });
  await audit({ user, action: "goal.update", entityType: "MonthlyGoal", entityId: goalId, before: { status: goal.status }, after: { status: "CANCELLED" }, reason });
  // weekly / monthly progress and stored reports drop the cancelled goal
  if (["APPROVED", "IN_PROGRESS", "COMPLETED"].includes(goal.plan.status)) await recomputePlan(goal.planId);
}

export async function submitPlan(user: AuthUser, planId: string) {
  const plan = await getPlanOrThrow(planId);
  assertEmployeeAccess(user, plan.employeeId);
  if (plan.employeeId !== user.employeeId && !canManagePlans(user)) throw new UserError("يرسل الخطة صاحبها أو المدير فقط");
  if (plan.status !== "DRAFT") throw new UserError("الخطة ليست مسودة");
  const goals = await db.monthlyGoal.count({ where: { planId } });
  if (goals === 0) throw new UserError("أضف هدفًا واحدًا على الأقل قبل الإرسال");
  await db.monthlyPlan.update({ where: { id: planId }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  await audit({ user, action: "plan.submit", entityType: "MonthlyPlan", entityId: planId });
  const managers = await managerUserIdsFor(plan.employeeId);
  await notifyUsers(managers.filter((id) => id !== user.id), {
    type: "PLAN_SUBMITTED",
    title: `خطة ${monthLabel(plan.year, plan.month)} بانتظار الاعتماد`,
    body: `أرسل ${plan.employee.fullName} خطته الشهرية للاعتماد`,
    link: `/monthly-plans/${planId}`,
  });
}

export async function approvePlan(user: AuthUser, planId: string, notes?: string | null) {
  const plan = await getPlanOrThrow(planId);
  assertEmployeeAccess(user, plan.employeeId);
  if (!["DRAFT", "SUBMITTED"].includes(plan.status)) throw new UserError("لا يمكن اعتماد الخطة في حالتها الحالية");
  const goals = await db.monthlyGoal.count({ where: { planId } });
  if (goals === 0) throw new UserError("لا يمكن اعتماد خطة بدون أهداف");
  await db.monthlyPlan.update({
    where: { id: planId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: user.id,
      submittedAt: plan.submittedAt ?? new Date(),
      managerNotes: notes ?? plan.managerNotes,
    },
  });
  await audit({ user, action: "plan.approve", entityType: "MonthlyPlan", entityId: planId, reason: notes });
  await ensureWeeklyPlans(planId);
  await autoDistributePlan(planId, user.id);
  await recomputePlan(planId);
  await notifyUsers([plan.employee.userId], {
    type: "PLAN_APPROVED",
    title: `تم اعتماد خطة ${monthLabel(plan.year, plan.month)}`,
    body: "تم توزيع الأهداف على الأسابيع والأيام — ستجد مهامك في «مهامي»",
    link: "/my-plan",
  });
}

export async function returnPlan(user: AuthUser, planId: string, notes: string) {
  const plan = await getPlanOrThrow(planId);
  assertEmployeeAccess(user, plan.employeeId);
  if (plan.status !== "SUBMITTED") throw new UserError("يمكن إعادة الخطط المرسلة فقط");
  await db.monthlyPlan.update({ where: { id: planId }, data: { status: "DRAFT", managerNotes: notes } });
  await audit({ user, action: "plan.return", entityType: "MonthlyPlan", entityId: planId, reason: notes });
  await notifyUsers([plan.employee.userId], {
    type: "PLAN_RETURNED",
    title: `أعيدت خطة ${monthLabel(plan.year, plan.month)} للتعديل`,
    body: notes,
    link: "/my-plan",
  });
}

/** Manual transitions only make sense once a plan has been approved. */
const ALLOWED_STATUS_TRANSITIONS: Record<"IN_PROGRESS" | "COMPLETED" | "ARCHIVED", string[]> = {
  IN_PROGRESS: ["APPROVED"],
  COMPLETED: ["APPROVED", "IN_PROGRESS"],
  ARCHIVED: ["APPROVED", "IN_PROGRESS", "COMPLETED"],
};

export async function setPlanStatus(user: AuthUser, planId: string, status: "IN_PROGRESS" | "COMPLETED" | "ARCHIVED") {
  const plan = await getPlanOrThrow(planId);
  assertEmployeeAccess(user, plan.employeeId);
  if (!ALLOWED_STATUS_TRANSITIONS[status].includes(plan.status)) {
    throw new UserError(`لا يمكن نقل الخطة من حالتها الحالية إلى ${status}`);
  }
  await db.monthlyPlan.update({ where: { id: planId }, data: { status } });
  await audit({ user, action: "plan.status", entityType: "MonthlyPlan", entityId: planId, before: { status: plan.status }, after: { status } });
}

/**
 * Create the plan's periods (7 full days each, see planWeekPeriods) and a weekly
 * goal per monthly goal with an automatic, work-day-proportional suggestion.
 * Periods are generated once: a plan that already has weekly plans keeps them
 * exactly as stored (including plans made before this rule), so re-running this
 * only adds weekly goals for new monthly goals.
 */
export async function ensureWeeklyPlans(planId: string) {
  const company = await getCompany();
  const plan = await db.monthlyPlan.findUniqueOrThrow({
    where: { id: planId },
    include: { goals: true, weeklyPlans: { include: { goals: true }, orderBy: { weekIndex: "asc" } } },
  });
  const weeks: MonthWeek[] =
    plan.weeklyPlans.length > 0
      ? plan.weeklyPlans.map((w) => {
          const start = toDateKey(w.startDate);
          const end = toDateKey(w.endDate);
          return { index: w.weekIndex, start, end, workDays: eachDay(start, end).filter((d) => isWorkDay(d, company.workDays)) };
        })
      : planWeekPeriods(plan.executionStartDate ? toDateKey(plan.executionStartDate) : await firstPeriodStart(plan.employeeId, plan.year, plan.month), plan.weeksCount ?? 4, company.workDays);
  const existing = new Map(plan.weeklyPlans.map((w) => [w.weekIndex, w]));

  await db.$transaction(async (tx) => {
    const weekIds: string[] = [];
    for (const w of weeks) {
      const found = existing.get(w.index);
      if (found) {
        weekIds.push(found.id);
        continue;
      }
      const created = await tx.weeklyPlan.create({
        data: {
          monthlyPlanId: planId,
          employeeId: plan.employeeId,
          weekIndex: w.index,
          startDate: fromDateKey(w.start),
          endDate: fromDateKey(w.end),
          workDays: w.workDays.length,
        },
      });
      weekIds.push(created.id);
    }
    const allWeekly = await tx.weeklyGoal.findMany({ where: { weeklyPlanId: { in: weekIds } }, select: { weeklyPlanId: true, monthlyGoalId: true } });
    const has = new Set(allWeekly.map((g) => `${g.weeklyPlanId}:${g.monthlyGoalId}`));
    for (const goal of plan.goals) {
      if (goal.status === "CANCELLED") continue;
      const suggestion = suggestWeeklyTargets(
        {
          goalType: goal.goalType,
          distributionMode: goal.distributionMode,
          targetValue: num(goal.targetValue),
          startDate: goal.startDate ? toDateKey(goal.startDate) : null,
          dueDate: goal.dueDate ? toDateKey(goal.dueDate) : null,
        },
        weeks,
      );
      const rows = weeks
        .map((_, i) => ({ weeklyPlanId: weekIds[i], monthlyGoalId: goal.id, targetValue: suggestion[i] ?? 0 }))
        .filter((r) => !["ONE_TIME", "DAILY"].includes(goal.distributionMode) || num(r.targetValue) > 0)
        .filter((r) => !has.has(`${r.weeklyPlanId}:${r.monthlyGoalId}`));
      if (rows.length) await tx.weeklyGoal.createMany({ data: rows });
    }
  });
}

/**
 * After approval: activate the suggested weekly split and turn it into daily
 * tasks from today on, so nobody has to "save the distribution" by hand.
 * Weeks or goals that already have a saved distribution are left untouched.
 */
export async function autoDistributePlan(planId: string, userId: string | null, opts: { onlyGoalId?: string } = {}) {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const plan = await db.monthlyPlan.findUniqueOrThrow({ where: { id: planId }, include: { weeklyPlans: true } });
  const span = await planSpan(plan);
  const weeks = await db.weeklyPlan.findMany({
    where: { monthlyPlanId: planId },
    include: { goals: { include: { monthlyGoal: true } } },
    orderBy: { weekIndex: "asc" },
  });
  const existingTasks = await db.dailyTask.findMany({
    where: { source: "DISTRIBUTED", status: { not: "CANCELLED" }, monthlyGoal: { planId } },
    select: { id: true, employeeId: true, monthlyGoalId: true, date: true, status: true },
  });
  const existingKeys = new Set(existingTasks.filter((t) => t.monthlyGoalId).map((t) => `${t.employeeId}:${t.monthlyGoalId}:${toDateKey(t.date)}`));
  const goalsWithTask = new Set(existingTasks.flatMap((t) => (t.monthlyGoalId ? [t.monthlyGoalId] : [])));
  const completedGoals = new Set(existingTasks.filter((t) => t.status === "COMPLETED").flatMap((t) => (t.monthlyGoalId ? [t.monthlyGoalId] : [])));
  const tasks: Prisma.DailyTaskCreateManyInput[] = [];
  for (const week of weeks) {
    if (week.status === "CLOSED") continue;
    const allWorkDays: string[] = [];
    for (let d = toDateKey(week.startDate); d <= toDateKey(week.endDate); d = toDateKey(new Date(fromDateKey(d).getTime() + 86_400_000))) {
      if (company.workDays.includes(fromDateKey(d).getUTCDay())) allWorkDays.push(d);
    }
    for (const wg of week.goals) {
      const goal = wg.monthlyGoal;
      if (goal.status === "CANCELLED") continue;
      if (opts.onlyGoalId && goal.id !== opts.onlyGoalId) continue;
      const target = num(wg.targetValue);
      if (target <= 0) continue;
      const goalStart = goal.startDate ? toDateKey(goal.startDate) : null;
      const goalEnd = goal.dueDate ? toDateKey(goal.dueDate) : null;
      let days = allWorkDays.filter((d) => d >= span.start && d <= span.end && (!goalStart || d >= goalStart) && (!goalEnd || d <= goalEnd));
      let split: number[];
      if (goal.distributionMode === "ONE_TIME") {
        if (goalsWithTask.has(goal.id) || completedGoals.has(goal.id)) continue;
        const due = goal.dueDate ? toDateKey(goal.dueDate) : null;
        const begins = goal.startDate ? toDateKey(goal.startDate) : null;
        const chosen = due && days.includes(due) ? due : begins && days.includes(begins) ? begins : days[0];
        days = chosen ? [chosen] : [];
        split = [target];
      } else if (goal.distributionMode === "DAILY") {
        split = days.map(() => 1);
      } else {
        days = days.filter((d) => d >= today);
        split = suggestDailyTargets(target, days.length);
      }
      days.forEach((day, i) => {
        if (day < span.start || day > span.end) return;
        if (!(split[i] > 0)) return;
        const key = `${week.employeeId}:${goal.id}:${day}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        tasks.push({
          employeeId: week.employeeId,
          weeklyGoalId: wg.id,
          monthlyGoalId: wg.monthlyGoalId,
          title: goal.name,
          date: fromDateKey(day),
          target: split[i],
          source: "DISTRIBUTED",
          priority: goal.priority,
          createdById: userId,
        });
      });
    }
  }
  // a handful of bulk statements instead of one insert per task: a full template plan is hundreds of
  // tasks, and one-by-one inserts in a single transaction ran past the 30s limit on serverless Postgres
  const ops: Prisma.PrismaPromise<unknown>[] = [db.weeklyPlan.updateMany({ where: { monthlyPlanId: planId, status: "DRAFT" }, data: { status: "ACTIVE" } })];
  for (let i = 0; i < tasks.length; i += 500) ops.push(db.dailyTask.createMany({ data: tasks.slice(i, i + 500) }));
  await db.$transaction(ops);
}

async function assertCanDistribute(user: AuthUser, employeeId: string) {
  assertEmployeeAccess(user, employeeId);
  const own = employeeId === user.employeeId && hasPermission(user, PERMISSIONS.PLANS_DISTRIBUTE_OWN);
  if (!own && !canManagePlans(user)) throw new UserError("ليس لديك صلاحية تعديل التوزيع");
}

/**
 * Save the employee's weekly split. A total that differs from the monthly
 * target needs a justification and moves the weeks to PENDING_APPROVAL.
 */
export async function saveWeeklyDistribution(user: AuthUser, input: z.infer<typeof weeklyDistributionSchema>) {
  const plan = await db.monthlyPlan.findUniqueOrThrow({
    where: { id: input.planId },
    include: { goals: true, weeklyPlans: { include: { goals: true } } },
  });
  await assertCanDistribute(user, plan.employeeId);
  if (!["APPROVED", "IN_PROGRESS"].includes(plan.status)) throw new UserError("يجب اعتماد الخطة الشهرية قبل التوزيع");

  const mismatches: { goal: string; diff: number }[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const goal of plan.goals) {
    const row = input.targets[goal.id];
    if (!row || goal.status === "CANCELLED") continue;
    const parts = plan.weeklyPlans.map((w) => Number(row[String(w.weekIndex)] ?? 0));
    if (goal.distributionMode !== "DAILY" && goal.goalType !== "PERCENTAGE") {
      const check = checkDistribution(parts, num(goal.targetValue));
      if (!check.ok) mismatches.push({ goal: goal.name, diff: check.diff });
    }
    for (const w of plan.weeklyPlans) {
      const value = Number(row[String(w.weekIndex)] ?? 0);
      if (goal.distributionMode === "ONE_TIME" && value <= 0) continue;
      updates.push(
        db.weeklyGoal.upsert({
          where: { weeklyPlanId_monthlyGoalId: { weeklyPlanId: w.id, monthlyGoalId: goal.id } },
          create: { weeklyPlanId: w.id, monthlyGoalId: goal.id, targetValue: value },
          update: { targetValue: value },
        }),
      );
    }
  }
  if (mismatches.length > 0 && !input.varianceNote) {
    throw new UserError(
      `مجموع التوزيع لا يطابق الهدف الشهري في: ${mismatches.map((m) => `${m.goal} (${m.diff > 0 ? "+" : ""}${m.diff})`).join("، ")} — اكتب مبررًا لإرساله للاعتماد`,
    );
  }
  const needsApproval = mismatches.length > 0 && !canManagePlans(user);
  for (const w of plan.weeklyPlans) {
    updates.push(
      db.weeklyPlan.update({
        where: { id: w.id },
        data: {
          status: w.status === "CLOSED" ? "CLOSED" : needsApproval ? "PENDING_APPROVAL" : "ACTIVE",
          varianceNote: mismatches.length > 0 ? input.varianceNote : null,
          ...(mismatches.length > 0 && !needsApproval ? { varianceApprovedById: user.id, varianceApprovedAt: new Date() } : {}),
        },
      }),
    );
  }
  await db.$transaction(updates);
  await audit({
    user,
    action: "weekly.distribute",
    entityType: "MonthlyPlan",
    entityId: plan.id,
    after: { targets: input.targets, mismatches },
    reason: input.varianceNote,
  });
  if (needsApproval) {
    const managers = await managerUserIdsFor(plan.employeeId);
    await notifyUsers(managers, {
      type: "PLAN_SUBMITTED",
      title: "توزيع أسبوعي يحتاج اعتماد",
      body: `فرق في مجموع التوزيع: ${input.varianceNote ?? ""}`,
      link: `/weekly-plans?plan=${plan.id}`,
    });
  }
  await recomputePlan(plan.id);
  return { mismatches, needsApproval };
}

export async function approveWeeklyVariance(user: AuthUser, planId: string) {
  const plan = await getPlanOrThrow(planId);
  assertEmployeeAccess(user, plan.employeeId);
  await db.weeklyPlan.updateMany({
    where: { monthlyPlanId: planId, status: "PENDING_APPROVAL" },
    data: { status: "ACTIVE", varianceApprovedById: user.id, varianceApprovedAt: new Date() },
  });
  await audit({ user, action: "weekly.variance_approve", entityType: "MonthlyPlan", entityId: planId });
  await notifyUsers([plan.employee.userId], {
    type: "PLAN_APPROVED",
    title: "تم اعتماد التوزيع الأسبوعي",
    link: "/my-week",
  });
}

/** Suggested daily split for each weekly goal of a week. */
export async function suggestDailySplit(weeklyPlanId: string) {
  const company = await getCompany();
  const week = await db.weeklyPlan.findUniqueOrThrow({ where: { id: weeklyPlanId }, include: { goals: { include: { monthlyGoal: true } } } });
  const days: string[] = [];
  for (let d = toDateKey(week.startDate); d <= toDateKey(week.endDate); d = toDateKey(new Date(fromDateKey(d).getTime() + 86_400_000))) {
    if (company.workDays.includes(fromDateKey(d).getUTCDay())) days.push(d);
  }
  return {
    days,
    suggestions: Object.fromEntries(
      week.goals.map((g) => {
        const mode = g.monthlyGoal.distributionMode;
        const due = g.monthlyGoal.dueDate ? toDateKey(g.monthlyGoal.dueDate) : null;
        const begins = g.monthlyGoal.startDate ? toDateKey(g.monthlyGoal.startDate) : null;
        const chosen = due && days.includes(due) ? due : begins && days.includes(begins) ? begins : days[0];
        const split = mode === "ONE_TIME"
          ? days.map((d) => d === chosen ? num(g.targetValue) : 0)
          : mode === "DAILY"
            ? days.map(() => 1)
            : suggestDailyTargets(num(g.targetValue), days.length);
        return [g.id, Object.fromEntries(days.map((d, i) => [d, split[i] ?? 0]))];
      }),
    ),
  };
}

/** Persist the daily split as DISTRIBUTED daily tasks (one per goal per day). */
export async function saveDailyDistribution(user: AuthUser, input: z.infer<typeof dailyDistributionSchema>) {
  const week = await db.weeklyPlan.findUniqueOrThrow({
    where: { id: input.weeklyPlanId },
    include: { goals: { include: { monthlyGoal: true, dailyTasks: true } } },
  });
  await assertCanDistribute(user, week.employeeId);
  const parent = await db.monthlyPlan.findUniqueOrThrow({ where: { id: week.monthlyPlanId }, include: { weeklyPlans: true } });
  const span = await planSpan(parent);
  if (Object.values(input.targets).some((row) => Object.entries(row).some(([day, value]) => value > 0 && (day < span.start || day > span.end)))) {
    throw new UserError("تاريخ المهمة خارج فترة تنفيذ الخطة");
  }
  const warnings: string[] = [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const startKey = toDateKey(week.startDate);
  const endKey = toDateKey(week.endDate);

  for (const wg of week.goals) {
    const row = input.targets[wg.id];
    if (!row) continue;
    const entries = Object.entries(row).filter(([d]) => d >= startKey && d <= endKey);
    const check = checkDistribution(entries.map(([, v]) => v), num(wg.targetValue));
    const sumless = wg.monthlyGoal.distributionMode === "DAILY";
    if (!check.ok && !sumless) warnings.push(`${wg.monthlyGoal.name}: الفرق ${check.diff}`);
    const existing = new Map(
      wg.dailyTasks.filter((t) => t.source === "DISTRIBUTED").map((t) => [toDateKey(t.date), t]),
    );
    for (const [day, target] of entries) {
      const task = existing.get(day);
      if (task) {
        if (target === 0 && num(task.achieved) === 0) ops.push(db.dailyTask.delete({ where: { id: task.id } }));
        else ops.push(db.dailyTask.update({ where: { id: task.id }, data: { target } }));
      } else if (target > 0) {
        if (wg.monthlyGoal.distributionMode === "ONE_TIME" && existing.size > 0) continue;
        ops.push(
          db.dailyTask.create({
            data: {
              employeeId: week.employeeId,
              weeklyGoalId: wg.id,
              monthlyGoalId: wg.monthlyGoalId,
              title: wg.monthlyGoal.name,
              date: fromDateKey(day),
              target,
              source: "DISTRIBUTED",
              priority: wg.monthlyGoal.priority,
              createdById: user.id,
            },
          }),
        );
      }
    }
  }
  await db.$transaction(ops);
  await audit({ user, action: "daily.distribute", entityType: "WeeklyPlan", entityId: week.id, after: input.targets });
  await recomputePlan(week.monthlyPlanId);
  return { warnings };
}
