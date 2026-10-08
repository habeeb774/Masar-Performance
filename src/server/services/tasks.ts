import "server-only";
import type { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDateAr, fromDateKey } from "@/lib/dates";
import type { adHocTaskSchema, dailyTaskSchema, taskPostponeSchema, taskProgressSchema } from "@/lib/validation";
import { notifyEmployee } from "./notifications";
import { recomputePlan } from "./progress";
import { assertTaskInPlan } from "./periods";

async function recomputeForGoal(monthlyGoalId: string | null) {
  if (!monthlyGoalId) return;
  const goal = await db.monthlyGoal.findUnique({ where: { id: monthlyGoalId }, select: { planId: true } });
  if (goal) await recomputePlan(goal.planId);
}

function resolveEmployeeId(user: AuthUser, requested: string | null) {
  const employeeId = requested ?? user.employeeId;
  if (!employeeId) throw new UserError("حسابك غير مرتبط بموظف");
  assertEmployeeAccess(user, employeeId);
  if (employeeId !== user.employeeId && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) {
    throw new UserError("لا يمكنك إضافة مهام لموظف آخر");
  }
  return employeeId;
}

export async function createDailyTask(user: AuthUser, input: z.infer<typeof dailyTaskSchema>) {
  const employeeId = resolveEmployeeId(user, input.employeeId);
  let weeklyGoalId: string | null = null;
  if (input.monthlyGoalId) {
    await assertTaskInPlan(input.monthlyGoalId, input.date);
    const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: input.monthlyGoalId } });
    if (goal.employeeId !== employeeId) throw new UserError("الهدف لا يخص هذا الموظف");
    const wg = await db.weeklyGoal.findFirst({
      where: { monthlyGoalId: goal.id, weeklyPlan: { startDate: { lte: fromDateKey(input.date) }, endDate: { gte: fromDateKey(input.date) } } },
    });
    weeklyGoalId = wg?.id ?? null;
  }
  const task = await db.dailyTask.create({
    data: {
      employeeId,
      title: input.title,
      description: input.description,
      date: fromDateKey(input.date),
      deadline: input.deadline ? fromDateKey(input.deadline) : null,
      target: input.target,
      achieved: input.achieved,
      progress: input.progress,
      status: input.status,
      priority: input.priority,
      monthlyGoalId: input.monthlyGoalId,
      weeklyGoalId,
      notes: input.notes,
      delayReason: input.delayReason,
      source: "MANUAL",
      createdById: user.id,
      completedAt: input.status === "COMPLETED" ? new Date() : null,
    },
  });
  await audit({ user, action: "task.create", entityType: "DailyTask", entityId: task.id, after: input });
  if (employeeId !== user.employeeId) {
    await notifyEmployee(employeeId, { type: "TASK_ASSIGNED", title: `مهمة جديدة: ${task.title}`, body: formatDateAr(input.date), link: "/my-tasks" });
  }
  await recomputeForGoal(task.monthlyGoalId);
  return task;
}

/**
 * Update a daily task. Tasks synced from Notion only accept notes and delay
 * reasons — their numbers always come from Notion.
 */
export async function updateTaskProgress(user: AuthUser, taskId: string, input: z.infer<typeof taskProgressSchema>) {
  const task = await db.dailyTask.findUniqueOrThrow({ where: { id: taskId }, include: { monthlyGoal: true } });
  assertEmployeeAccess(user, task.employeeId);
  const isOwner = task.employeeId === user.employeeId;
  if (!isOwner && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("لا يمكنك تعديل هذه المهمة");
  const notionDriven = task.monthlyGoal?.source === "NOTION" && task.source !== "MANUAL";
  const requestedAchieved = Number(input.achieved ?? task.achieved);
  const target = Number(task.target);
  const requestedProgress = input.progress ?? task.progress;
  const protectedStatus = input.status === "BLOCKED" || input.status === "CANCELLED";
  const reachedTarget = target > 0 && requestedAchieved >= target;
  const reachedFullProgress = requestedProgress >= 100;
  const resolvedStatus = !protectedStatus && (reachedTarget || reachedFullProgress) ? "COMPLETED" : input.status;

  const data = notionDriven
    ? { notes: input.notes, delayReason: input.delayReason, ...(protectedStatus ? { status: input.status } : {}) }
    : {
        status: resolvedStatus,
        achieved: resolvedStatus === "COMPLETED" && target > 0 ? Math.max(requestedAchieved, target) : requestedAchieved,
        progress: resolvedStatus === "COMPLETED" ? 100 : requestedProgress,
        notes: input.notes,
        delayReason: input.delayReason,
        completedAt: resolvedStatus === "COMPLETED" ? (task.completedAt ?? new Date()) : null,
      };
  const updated = await db.dailyTask.update({ where: { id: taskId }, data });
  await audit({ user, action: "task.update", entityType: "DailyTask", entityId: taskId, before: task, after: updated, diff: true });
  await recomputeForGoal(task.monthlyGoalId);
  return updated;
}

export async function postponeDailyTask(user: AuthUser, taskId: string, input: z.infer<typeof taskPostponeSchema>) {
  const task = await db.dailyTask.findUniqueOrThrow({
    where: { id: taskId },
    include: { monthlyGoal: true },
  });
  assertEmployeeAccess(user, task.employeeId);
  if (task.employeeId !== user.employeeId && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) {
    throw new UserError("لا يمكنك تأجيل هذه المهمة");
  }
  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    throw new UserError("لا يمكن تأجيل مهمة مكتملة أو ملغاة");
  }
  const notionDriven = task.monthlyGoal?.source === "NOTION" && task.source !== "MANUAL";
  if (notionDriven) {
    throw new UserError("هذه المهمة مرتبطة بـ Notion ولا يمكن تغيير تاريخها من النظام");
  }

  const currentDate = task.date.toISOString().slice(0, 10);
  if (input.date <= currentDate) {
    throw new UserError("اختر تاريخًا بعد تاريخ المهمة الحالي");
  }

  let weeklyGoalId = task.weeklyGoalId;
  if (task.monthlyGoalId) {
    await assertTaskInPlan(task.monthlyGoalId, input.date);
    weeklyGoalId =
      (
        await db.weeklyGoal.findFirst({
          where: {
            monthlyGoalId: task.monthlyGoalId,
            weeklyPlan: {
              startDate: { lte: fromDateKey(input.date) },
              endDate: { gte: fromDateKey(input.date) },
            },
          },
          select: { id: true },
        })
      )?.id ?? null;
  }

  const updated = await db.dailyTask.update({
    where: { id: taskId },
    data: {
      date: fromDateKey(input.date),
      weeklyGoalId,
      delayReason: input.reason ?? task.delayReason,
    },
  });

  await audit({
    user,
    action: "task.postpone",
    entityType: "DailyTask",
    entityId: taskId,
    before: task,
    after: updated,
    diff: true,
  });
  await recomputeForGoal(task.monthlyGoalId);
  return updated;
}

export async function updateDailyTask(user: AuthUser, taskId: string, input: z.infer<typeof dailyTaskSchema>) {
  const task = await db.dailyTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  if (input.monthlyGoalId) await assertTaskInPlan(input.monthlyGoalId, input.date);
  if (task.source !== "MANUAL") throw new UserError("هذه المهمة مولّدة من الخطة — عدّل التوزيع بدلًا من ذلك");
  if (task.employeeId !== user.employeeId && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("لا يمكنك تعديل هذه المهمة");
  let weeklyGoalId: string | null = null;
  if (input.monthlyGoalId) {
    const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: input.monthlyGoalId } });
    if (goal.employeeId !== task.employeeId) throw new UserError("الهدف لا يخص هذا الموظف");
    weeklyGoalId = (await db.weeklyGoal.findFirst({ where: { monthlyGoalId: goal.id, weeklyPlan: { startDate: { lte: fromDateKey(input.date) }, endDate: { gte: fromDateKey(input.date) } } } }))?.id ?? null;
  }
  const protectedStatus = input.status === "BLOCKED" || input.status === "CANCELLED";
  const reachedTarget = Number(input.target) > 0 && Number(input.achieved) >= Number(input.target);
  const reachedFullProgress = Number(input.progress) >= 100;
  const resolvedStatus = !protectedStatus && (reachedTarget || reachedFullProgress) ? "COMPLETED" : input.status;
  const resolvedAchieved =
    resolvedStatus === "COMPLETED" && Number(input.target) > 0
      ? Math.max(Number(input.achieved), Number(input.target))
      : Number(input.achieved);

  const updated = await db.dailyTask.update({
    where: { id: taskId },
    data: {
      title: input.title,
      description: input.description,
      date: fromDateKey(input.date),
      deadline: input.deadline ? fromDateKey(input.deadline) : null,
      target: input.target,
      achieved: resolvedAchieved,
      progress: resolvedStatus === "COMPLETED" ? 100 : input.progress,
      status: resolvedStatus,
      priority: input.priority,
      monthlyGoalId: input.monthlyGoalId,
      weeklyGoalId,
      notes: input.notes,
      delayReason: input.delayReason,
      completedAt: resolvedStatus === "COMPLETED" ? (task.completedAt ?? new Date()) : null,
    },
  });
  await audit({ user, action: "task.update", entityType: "DailyTask", entityId: taskId, before: task, after: updated, diff: true });
  await recomputeForGoal(task.monthlyGoalId);
  await recomputeForGoal(updated.monthlyGoalId === task.monthlyGoalId ? null : updated.monthlyGoalId);
  return updated;
}

export async function deleteDailyTask(user: AuthUser, taskId: string) {
  const task = await db.dailyTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  if (task.source !== "MANUAL") throw new UserError("لا يمكن حذف مهام الخطة — عدّل التوزيع اليومي");
  if (task.employeeId !== user.employeeId && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("لا يمكنك حذف هذه المهمة");
  await db.dailyTask.delete({ where: { id: taskId } });
  await audit({ user, action: "task.delete", entityType: "DailyTask", entityId: taskId, before: task });
  await recomputeForGoal(task.monthlyGoalId);
}

// ---- ad-hoc assignments ------------------------------------------------------------

export async function createAdHocTask(user: AuthUser, input: z.infer<typeof adHocTaskSchema>) {
  // employees may add a task for themselves only, and it never counts in the evaluation
  const selfOnly = input.employeeId === user.employeeId && !input.includeInEvaluation && !input.compensatesGoalId && !(input.weight > 0);
  if (!hasPermission(user, PERMISSIONS.TASKS_ASSIGN) && !selfOnly) throw new UserError("غير مسموح");
  assertEmployeeAccess(user, input.employeeId);
  if (input.compensatesGoalId) {
    const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: input.compensatesGoalId } });
    if (goal.employeeId !== input.employeeId) throw new UserError("الهدف المعوَّض لا يخص الموظف");
  }
  const task = await db.adHocTask.create({
    data: {
      ...input,
      assignedById: user.id,
      assignedDate: fromDateKey(input.assignedDate),
      dueDate: input.dueDate ? fromDateKey(input.dueDate) : null,
    },
  });
  await audit({ user, action: "adhoc.create", entityType: "AdHocTask", entityId: task.id, after: input });
  await notifyEmployee(input.employeeId, {
    type: "TASK_ASSIGNED",
    title: `تكليف جديد: ${task.title}`,
    body: input.dueDate ? `موعد التسليم ${formatDateAr(input.dueDate)}` : null,
    link: "/my-tasks",
  });
  return task;
}

export async function updateAdHocTask(user: AuthUser, taskId: string, input: z.infer<typeof adHocTaskSchema>) {
  const task = await db.adHocTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  const updated = await db.adHocTask.update({
    where: { id: taskId },
    data: {
      ...input,
      assignedDate: fromDateKey(input.assignedDate),
      dueDate: input.dueDate ? fromDateKey(input.dueDate) : null,
    },
  });
  await audit({ user, action: "adhoc.update", entityType: "AdHocTask", entityId: taskId, before: task, after: updated, diff: true });
  return updated;
}

export async function updateAdHocProgress(user: AuthUser, taskId: string, input: z.infer<typeof taskProgressSchema>) {
  const task = await db.adHocTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  if (task.employeeId !== user.employeeId && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("غير مسموح");
  const requestedProgress = input.progress ?? task.progress;
  const protectedStatus = input.status === "BLOCKED" || input.status === "CANCELLED";
  const resolvedStatus = !protectedStatus && requestedProgress >= 100 ? "COMPLETED" : input.status;
  const updated = await db.adHocTask.update({
    where: { id: taskId },
    data: {
      status: resolvedStatus,
      progress: resolvedStatus === "COMPLETED" ? 100 : requestedProgress,
      notes: input.notes,
      delayReason: input.delayReason,
      completedAt: resolvedStatus === "COMPLETED" ? (task.completedAt ?? new Date()) : null,
    },
  });
  await audit({ user, action: "adhoc.update", entityType: "AdHocTask", entityId: taskId, before: task, after: updated, diff: true });
  if (task.compensatesGoalId) {
    const goal = await db.monthlyGoal.findUnique({ where: { id: task.compensatesGoalId }, select: { planId: true } });
    if (goal) await recomputePlan(goal.planId);
  }
  return updated;
}

export async function deleteAdHocTask(user: AuthUser, taskId: string) {
  if (!hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("غير مسموح");
  const task = await db.adHocTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  await db.adHocTask.delete({ where: { id: taskId } });
  await audit({ user, action: "adhoc.delete", entityType: "AdHocTask", entityId: taskId, before: task });
}
