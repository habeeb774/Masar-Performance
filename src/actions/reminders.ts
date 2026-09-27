"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { runAction } from "@/server/action";
import { actionUser } from "@/server/auth/session";
import { adHocTaskSchema, dateKeySchema, idSchema, reminderSchema } from "@/lib/validation";
import * as reminders from "@/server/services/reminders";

const refresh = () => revalidatePath("/", "layout");

export async function createReminderAction(input: z.input<typeof reminderSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await reminders.createReminder(user, reminderSchema.parse(input));
    refresh();
  }, "تم حفظ الملاحظة");
}

export async function updateReminderAction(id: string, input: z.input<typeof reminderSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await reminders.updateReminder(user, idSchema.parse(id), reminderSchema.parse(input));
    refresh();
  }, "تم تحديث الملاحظة");
}

export async function rescheduleReminderAction(id: string, remindOn: string) {
  return runAction(async () => {
    const user = await actionUser();
    await reminders.rescheduleReminder(user, idSchema.parse(id), dateKeySchema.parse(remindOn));
    refresh();
  }, "سنذكّرك في الموعد الجديد");
}

export async function cancelReminderAction(id: string) {
  return runAction(async () => {
    const user = await actionUser();
    await reminders.cancelReminder(user, idSchema.parse(id));
    refresh();
  }, "تم حذف الملاحظة");
}

export async function convertReminderAction(id: string, task: z.input<typeof adHocTaskSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await reminders.convertReminderToTask(user, idSchema.parse(id), adHocTaskSchema.parse(task));
    refresh();
  }, "تم اعتماد الملاحظة وتحويلها إلى مهمة");
}
