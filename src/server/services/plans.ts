import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fromDateKey, getMonthWeeks, monthEnd, monthLabel, monthStart, toDateKey } from "@/lib/dates";
import { checkDistribution, suggestDailyTargets, suggestWeeklyTargets } from "@/lib/distribution";
import { num } from "@/lib/num";
import type { createPlanSchema, dailyDistributionSchema, monthlyGoalSchema, weeklyDistributionSchema } from "@/lib/validation";
import { getCompany } from "./company";
import { notifyUsers, managerUserIdsFor } from "./notifications";
import { recomputePlan } from "./progress";

type GoalInput = z.infer<typeof monthlyGoalSchema>;

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
    description: input.description,
    goalType: input.goalType,
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

export async function createMonthlyPlan(user: AuthUser, input: z.infer<typeof createPlanSchema>) {
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

  const start = fromDateKey(monthStart(input.year, input.month));
  const end = fromDateKey(monthEnd(input.year, input.month));
  const plan = await db.$transaction(async (tx) => {
    const created = await tx.monthlyPlan.create({
      data: {
        employeeId: input.employeeId,
        year: input.year,
        month: input.month,
        templateId: template?.id ?? null,
        createdById: user.id,
        goals: {
          create: (template?.items ?? []).map((item, i) => ({
            employeeId: input.employeeId,
            name: item.name,
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
      startDate: input.startDate ? fromDateKey(input.startDate) : fromDateKey(monthStart(plan.year, plan.month)),
      dueDate: input.dueDate ? fromDateKey(input.dueDate) : fromDateKey(monthEnd(plan.year, plan.month)),
      sortOrder: count,
    },
  });
  await audit({ user, action: "goal.create", entityType: "MonthlyGoal", entityId: goal.id, after: input });
  if (plan.status === "APPROVED" || plan.status === "IN_PROGRESS") {
    await ensureWeeklyPlans(planId);
    await recomputePlan(planId);
  }
  return goal;
}

export async function updateGoal(user: AuthUser, goalId: string, input: GoalInput) {
  const before = await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalId }, include: { plan: true } });
  assertCanEditGoals(user, before.plan);
  const after = await db.monthlyGoal.update({ where: { id: goalId }, data: goalData(input) });
  await audit({ user, action: "goal.update", entityType: "MonthlyGoal", entityId: goalId, before, after, diff: true });
  if (before.plan.status === "APPROVED" || before.plan.status === "IN_PROGRESS") await recomputePlan(before.planId);
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
  await recomputePlan(planId);
  await notifyUsers([plan.employee.userId], {
    type: "PLAN_APPROVED",
    title: `تم اعتماد خطة ${monthLabel(plan.year, plan.month)}`,
    body: "يمكنك الآن توزيع أهداف الشهر على الأسابيع",
    link: "/my-month",
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
    link: "/my-month",
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
 * Create the month's working weeks and a weekly goal per monthly goal with an
 * automatic, work-day-proportional suggestion. Existing rows are preserved.
 */
export async function ensureWeeklyPlans(planId: string) {
  const company = await getCompany();
  const plan = await db.monthlyPlan.findUniqueOrThrow({
    where: { id: planId },
    include: { goals: true, weeklyPlans: { include: { goals: true } } },
  });
  const weeks = getMonthWeeks(plan.year, plan.month, company.weekStartDay, company.workDays);
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
        { goalType: goal.goalType, targetValue: num(goal.targetValue), dueDate: goal.dueDate ? toDateKey(goal.dueDate) : null },
        weeks,
      );
      const rows = weeks
        .map((_, i) => ({ weeklyPlanId: weekIds[i], monthlyGoalId: goal.id, targetValue: suggestion[i] ?? 0 }))
        .filter((r) => !has.has(`${r.weeklyPlanId}:${r.monthlyGoalId}`));
      if (rows.length) await tx.weeklyGoal.createMany({ data: rows });
    }
  });
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
    if (goal.goalType !== "PERCENTAGE") {
      const check = checkDistribution(parts, num(goal.targetValue));
      if (!check.ok) mismatches.push({ goal: goal.name, diff: check.diff });
    }
    for (const w of plan.weeklyPlans) {
      const value = Number(row[String(w.weekIndex)] ?? 0);
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
        // percentage / boolean goals are not quantities to sum — repeat the same target every day
        const split =
          g.monthlyGoal.goalType === "PERCENTAGE" || g.monthlyGoal.goalType === "BOOLEAN"
            ? days.map(() => num(g.targetValue))
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
  const warnings: string[] = [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const startKey = toDateKey(week.startDate);
  const endKey = toDateKey(week.endDate);

  for (const wg of week.goals) {
    const row = input.targets[wg.id];
    if (!row) continue;
    const entries = Object.entries(row).filter(([d]) => d >= startKey && d <= endKey);
    const check = checkDistribution(entries.map(([, v]) => v), num(wg.targetValue));
    const sumless = wg.monthlyGoal.goalType === "PERCENTAGE" || wg.monthlyGoal.goalType === "BOOLEAN";
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
