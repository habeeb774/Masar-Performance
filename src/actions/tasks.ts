"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { db } from "@/server/db";
import { runAction } from "@/server/action";
import { actionPermission, actionUser } from "@/server/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { adHocTaskSchema, dailyTaskSchema, idSchema, taskPostponeSchema, taskProgressSchema } from "@/lib/validation";
import { toDateKey } from "@/lib/dates";
import { num } from "@/lib/num";
import type { PriorityKey } from "@/lib/labels";
import * as tasks from "@/server/services/tasks";

const refresh = () => revalidatePath("/", "layout");

export interface BulkResult {
  succeeded: number;
  total: number;
  firstError?: string;
}

/** Load a manual daily task's current fields as a full dailyTaskSchema payload, for a partial (single-field) bulk edit. */
async function loadDailyTaskInput(taskId: string): Promise<z.input<typeof dailyTaskSchema>> {
  const t = await db.dailyTask.findUniqueOrThrow({ where: { id: taskId } });
  return {
    title: t.title,
    description: t.description,
    date: toDateKey(t.date),
    deadline: t.deadline ? toDateKey(t.deadline) : null,
    target: num(t.target),
    achieved: num(t.achieved),
    progress: t.progress,
    status: t.status,
    priority: t.priority,
    monthlyGoalId: t.monthlyGoalId,
    notes: t.notes,
    delayReason: t.delayReason,
    employeeId: t.employeeId,
  };
}

export async function createTaskAction(input: z.input<typeof dailyTaskSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await tasks.createDailyTask(user, dailyTaskSchema.parse(input));
    refresh();
  }, "تمت إضافة المهمة");
}

export async function updateTaskAction(taskId: string, input: z.input<typeof dailyTaskSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await tasks.updateDailyTask(user, idSchema.parse(taskId), dailyTaskSchema.parse(input));
    refresh();
  }, "تم تحديث المهمة");
}

export async function updateTaskProgressAction(taskId: string, input: z.input<typeof taskProgressSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await tasks.updateTaskProgress(user, idSchema.parse(taskId), taskProgressSchema.parse(input));
    refresh();
  }, "تم تحديث المهمة");
}

export async function postponeTaskAction(taskId: string, input: z.input<typeof taskPostponeSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await tasks.postponeDailyTask(user, idSchema.parse(taskId), taskPostponeSchema.parse(input));
    refresh();
  }, "تم تأجيل المهمة");
}

export async function deleteTaskAction(taskId: string) {
  return runAction(async () => {
    const user = await actionUser();
    await tasks.deleteDailyTask(user, idSchema.parse(taskId));
    refresh();
  }, "تم حذف المهمة");
}

export async function createAdHocAction(input: z.input<typeof adHocTaskSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.TASKS_ASSIGN);
    await tasks.createAdHocTask(user, adHocTaskSchema.parse(input));
    refresh();
  }, "تم إرسال التكليف للموظف");
}

export async function updateAdHocAction(taskId: string, input: z.input<typeof adHocTaskSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.TASKS_ASSIGN);
    await tasks.updateAdHocTask(user, idSchema.parse(taskId), adHocTaskSchema.parse(input));
    refresh();
  }, "تم تحديث التكليف");
}

export async function updateAdHocProgressAction(taskId: string, input: z.input<typeof taskProgressSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await tasks.updateAdHocProgress(user, idSchema.parse(taskId), taskProgressSchema.parse(input));
    refresh();
  }, "تم تحديث التكليف");
}

export async function deleteAdHocAction(taskId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.TASKS_ASSIGN);
    await tasks.deleteAdHocTask(user, idSchema.parse(taskId));
    refresh();
  }, "تم حذف التكليف");
}

// ---- bulk actions (manager task table) --------------------------------------------
// Thin wrappers: each id goes through the existing single-item authorized
// service call (updateDailyTask) — no new bulk-specific service/authorization
// logic. Only manual daily tasks can be edited this way (Notion/plan-driven
// tasks are rejected per-item by the existing service, same as the single
// edit form), so partial failure across a mixed selection is expected and
// reported back.

async function runBulkDailyUpdate(taskIds: string[], mutate: (input: z.input<typeof dailyTaskSchema>) => z.input<typeof dailyTaskSchema>) {
  return runAction(async (): Promise<BulkResult> => {
    const user = await actionUser();
    const ids = taskIds.map((id) => idSchema.parse(id));
    let succeeded = 0;
    let firstError: string | undefined;
    for (const id of ids) {
      try {
        const current = await loadDailyTaskInput(id);
        await tasks.updateDailyTask(user, id, dailyTaskSchema.parse(mutate(current)));
        succeeded++;
      } catch (e) {
        firstError ??= e instanceof Error ? e.message : "خطأ غير متوقع";
      }
    }
    refresh();
    return { succeeded, total: ids.length, firstError };
  });
}

export async function bulkSetPriorityAction(taskIds: string[], priority: PriorityKey) {
  return runBulkDailyUpdate(taskIds, (input) => ({ ...input, priority }));
}

export async function bulkSetDeadlineAction(taskIds: string[], deadline: string | null) {
  return runBulkDailyUpdate(taskIds, (input) => ({ ...input, deadline }));
}

export async function bulkMarkCompletedAction(taskIds: string[]) {
  return runBulkDailyUpdate(taskIds, (input) => ({ ...input, status: "COMPLETED", progress: 100 }));
}
