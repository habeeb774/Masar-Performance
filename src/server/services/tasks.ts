import "server-only";
import type { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDateAr, fromDateKey } from "@/lib/dates";
import type { adHocTaskSchema, dailyTaskSchema, taskProgressSchema } from "@/lib/validation";
import { notifyEmployee } from "./notifications";
import { recomputePlan } from "./progress";
import { assertTaskInPlan } from "./periods";
import { taskCompletion } from "@/lib/task-completion";
import { num } from "@/lib/num";
import { refreshDraftEvaluationsForEmployee } from "./evaluation";

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
      priority: input.priority,
      monthlyGoalId: input.monthlyGoalId,
      weeklyGoalId,
      notes: input.notes,
      delayReason: input.delayReason,
      source: "MANUAL",
      createdById: user.id,
      ...taskCompletion({ status: input.status, target: input.target, achieved: input.achieved, progress: input.progress }),
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
  const data = notionDriven
    ? { notes: input.notes, delayReason: input.delayReason, ...(input.status === "BLOCKED" || input.status === "CANCELLED" ? { status: input.status } : {}) }
    : {
        ...taskCompletion({ status: input.status, target: num(task.target), achieved: input.achieved ?? num(task.achieved), progress: input.progress ?? task.progress, completedAt: task.completedAt }),
        notes: input.notes,
        delayReason: input.delayReason,
      };
  const updated = await db.dailyTask.update({ where: { id: taskId }, data });
  await audit({ user, action: "task.update", entityType: "DailyTask", entityId: taskId, before: task, after: updated, diff: true });
  await recomputeForGoal(task.monthlyGoalId);
  return updated;
}

export async function updateDailyTask(user: AuthUser, taskId: string, input: z.infer<typeof dailyTaskSchema>) {
  const task = await db.dailyTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  if (input.monthlyGoalId) await assertTaskInPlan(input.monthlyGoalId, input.date);
  if (task.source !== "MANUAL") throw new UserError("هذه المهمة مولّدة من الخطة — عدّل التوزيع بدلًا من ذلك");
  if (task.status === "COMPLETED" && task.monthlyGoalId && input.monthlyGoalId !== task.monthlyGoalId) throw new UserError("لا يمكن فصل مهمة مكتملة عن هدفها؛ يلزم إجراء مراجعة صريح");
  if (task.employeeId !== user.employeeId && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("لا يمكنك تعديل هذه المهمة");
  let weeklyGoalId: string | null = null;
  if (input.monthlyGoalId) {
    const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: input.monthlyGoalId } });
    if (goal.employeeId !== task.employeeId) throw new UserError("الهدف لا يخص هذا الموظف");
    weeklyGoalId = (await db.weeklyGoal.findFirst({ where: { monthlyGoalId: goal.id, weeklyPlan: { startDate: { lte: fromDateKey(input.date) }, endDate: { gte: fromDateKey(input.date) } } } }))?.id ?? null;
  }
  const updated = await db.dailyTask.update({
    where: { id: taskId },
    data: {
      title: input.title,
      description: input.description,
      date: fromDateKey(input.date),
      deadline: input.deadline ? fromDateKey(input.deadline) : null,
      target: input.target,
      priority: input.priority,
      monthlyGoalId: input.monthlyGoalId,
      weeklyGoalId,
      notes: input.notes,
      delayReason: input.delayReason,
      ...taskCompletion({ status: input.status, target: input.target, achieved: input.achieved, progress: input.progress, completedAt: task.completedAt }),
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
  await refreshDraftEvaluationsForEmployee(input.employeeId);
  return task;
}

export async function updateAdHocTask(user: AuthUser, taskId: string, input: z.infer<typeof adHocTaskSchema>) {
  const task = await db.adHocTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  if (!hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("غير مسموح");
  assertEmployeeAccess(user, input.employeeId);
  if (input.compensatesGoalId) {
    const goal = await db.monthlyGoal.findUniqueOrThrow({ where: { id: input.compensatesGoalId } });
    if (goal.employeeId !== input.employeeId) throw new UserError("الهدف المعوَّض لا يخص الموظف");
  }
  const updated = await db.adHocTask.update({
    where: { id: taskId },
    data: {
      ...input,
      assignedDate: fromDateKey(input.assignedDate),
      dueDate: input.dueDate ? fromDateKey(input.dueDate) : null,
    },
  });
  await audit({ user, action: "adhoc.update", entityType: "AdHocTask", entityId: taskId, before: task, after: updated, diff: true });
  await refreshDraftEvaluationsForEmployee(task.employeeId);
  if (updated.employeeId !== task.employeeId) await refreshDraftEvaluationsForEmployee(updated.employeeId);
  return updated;
}

export async function updateAdHocProgress(user: AuthUser, taskId: string, input: z.infer<typeof taskProgressSchema>) {
  const task = await db.adHocTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  if (task.employeeId !== user.employeeId && !hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("غير مسموح");
  const updated = await db.adHocTask.update({
    where: { id: taskId },
    data: {
      ...(() => { const { status, progress, completedAt } = taskCompletion({ status: input.status, target: 0, achieved: 0, progress: input.progress ?? task.progress, completedAt: task.completedAt }); return { status, progress, completedAt }; })(),
      notes: input.notes,
      delayReason: input.delayReason,
    },
  });
  await audit({ user, action: "adhoc.update", entityType: "AdHocTask", entityId: taskId, before: task, after: updated, diff: true });
  await refreshDraftEvaluationsForEmployee(task.employeeId);
  return updated;
}

export async function deleteAdHocTask(user: AuthUser, taskId: string) {
  if (!hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) throw new UserError("غير مسموح");
  const task = await db.adHocTask.findUniqueOrThrow({ where: { id: taskId } });
  assertEmployeeAccess(user, task.employeeId);
  await db.adHocTask.delete({ where: { id: taskId } });
  await audit({ user, action: "adhoc.delete", entityType: "AdHocTask", entityId: taskId, before: task });
  await refreshDraftEvaluationsForEmployee(task.employeeId);
}
