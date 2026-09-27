import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { UserError } from "@/server/action";
import { assertEmployeeAccess, employeeIdScope, type AuthUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fromDateKey } from "@/lib/dates";
import type { adHocTaskSchema, reminderSchema } from "@/lib/validation";
import { createAdHocTask } from "./tasks";

/**
 * «ملاحظات وتذكيرات» — a quick reminder notebook. A note is never a task, goal, plan item,
 * report line or evaluation input; nothing else reads this table. It only becomes official
 * when the user converts it into a task by hand (confirmed in the task form).
 */

const isAdmin = (user: AuthUser) => hasPermission(user, PERMISSIONS.SYSTEM_ADMIN);

/**
 * Who sees what: everyone sees their own notes; a manager also sees notes linked to an employee
 * in their team; the admin sees all. (An employee does not see a manager's note about them.)
 */
export function reminderWhere(user: AuthUser): Prisma.ReminderWhereInput {
  if (isAdmin(user)) return {};
  const scope = employeeIdScope(user);
  const team = user.directReportIds.length > 0 || hasPermission(user, PERMISSIONS.TASKS_ASSIGN) || hasPermission(user, PERMISSIONS.PLANS_MANAGE);
  if (!team) return { ownerId: user.id };
  const teamIds = scope === "ALL" ? undefined : scope.filter((id) => id !== user.employeeId);
  return { OR: [{ ownerId: user.id }, { employeeId: teamIds ? { in: teamIds } : { not: null } }] };
}

async function loadVisible(user: AuthUser, id: string) {
  const r = await db.reminder.findFirst({ where: { AND: [{ id }, reminderWhere(user)] } });
  if (!r) throw new UserError("الملاحظة غير موجودة");
  return r;
}

type ReminderInput = z.infer<typeof reminderSchema>;

function data(input: ReminderInput) {
  return {
    title: input.title,
    details: input.details || null,
    remindOn: fromDateKey(input.remindOn),
    priority: input.priority,
    employeeId: input.employeeId || null,
  };
}

export async function createReminder(user: AuthUser, input: ReminderInput) {
  if (input.employeeId) assertEmployeeAccess(user, input.employeeId);
  const r = await db.reminder.create({ data: { ...data(input), ownerId: user.id } });
  await audit({ user, action: "reminder.create", entityType: "Reminder", entityId: r.id, after: r });
  return r;
}

export async function updateReminder(user: AuthUser, id: string, input: ReminderInput) {
  const before = await loadVisible(user, id);
  if (before.status === "APPROVED" || before.status === "CANCELLED") throw new UserError("لا يمكن تعديل ملاحظة منتهية");
  if (input.employeeId) assertEmployeeAccess(user, input.employeeId);
  const after = await db.reminder.update({ where: { id }, data: data(input) });
  await audit({ user, action: "reminder.update", entityType: "Reminder", entityId: id, before, after, diff: true });
  return after;
}

/** «تأجيل» / «ذكرني مرة أخرى»: a new reminder date. */
export async function rescheduleReminder(user: AuthUser, id: string, remindOn: string) {
  const before = await loadVisible(user, id);
  if (before.status === "APPROVED" || before.status === "CANCELLED") throw new UserError("هذه الملاحظة منتهية");
  const after = await db.reminder.update({ where: { id }, data: { remindOn: fromDateKey(remindOn), status: "POSTPONED" } });
  await audit({
    user,
    action: "reminder.reschedule",
    entityType: "Reminder",
    entityId: id,
    before: { remindOn: before.remindOn, status: before.status },
    after: { remindOn: after.remindOn, status: after.status },
  });
  return after;
}

/** «حذف» cancels the note (kept for the audit trail, hidden from the notebook). */
export async function cancelReminder(user: AuthUser, id: string) {
  const before = await loadVisible(user, id);
  if (before.status === "APPROVED") throw new UserError("تم اعتماد هذه الملاحظة وتحويلها إلى مهمة");
  await db.reminder.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit({ user, action: "reminder.cancel", entityType: "Reminder", entityId: id, before: { status: before.status }, after: { status: "CANCELLED" } });
}

/**
 * «اعتماد وتحويل إلى مهمة»: creates the task the user confirmed in the task form, then marks the
 * note approved and keeps the link. Without the assign permission a user may only turn their own
 * note into a task for themselves, and it does not count in the evaluation.
 */
export async function convertReminderToTask(user: AuthUser, id: string, task: z.infer<typeof adHocTaskSchema>) {
  const r = await loadVisible(user, id);
  if (r.status === "APPROVED" || r.status === "CANCELLED") throw new UserError("هذه الملاحظة منتهية");
  let input = task;
  if (!hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) {
    if (r.ownerId !== user.id || !user.employeeId || task.employeeId !== user.employeeId) throw new UserError("يمكنك تحويل ملاحظاتك إلى مهام لنفسك فقط");
    input = { ...task, includeInEvaluation: false, weight: 0, compensatesGoalId: null };
  }
  const created = await createAdHocTask(user, input);
  await db.reminder.update({ where: { id }, data: { status: "APPROVED", adHocTaskId: created.id } });
  await audit({ user, action: "reminder.convert", entityType: "Reminder", entityId: id, before: { status: r.status }, after: { status: "APPROVED", adHocTaskId: created.id } });
  return created;
}
