"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { runAction } from "@/server/action";
import { actionPermission, actionUser } from "@/server/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { adHocTaskSchema, dailyTaskSchema, idSchema, taskProgressSchema } from "@/lib/validation";
import * as tasks from "@/server/services/tasks";

const refresh = () => revalidatePath("/", "layout");

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
