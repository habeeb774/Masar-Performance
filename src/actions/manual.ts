"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import { actionUser } from "@/server/auth/session";
import { idSchema } from "@/lib/validation";
import * as manual from "@/server/services/manual";

const refresh = () => revalidatePath("/", "layout");
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish();
const count = z.coerce.number().int().min(0).max(100_000);

const progressSchema = z
  .object({
    value: z.coerce.number().min(0).max(1_000_000).optional(),
    delta: z.coerce.number().min(-1_000_000).max(1_000_000).optional(),
    date: dateKey,
    note: z.string().max(500).nullish(),
  })
  .refine((v) => v.value !== undefined || v.delta !== undefined, "أدخل قيمة الإنجاز");

/** «تحديث الإنجاز» for a manual goal. */
export async function setManualAchievementAction(goalId: string, input: z.input<typeof progressSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await manual.setManualAchievement(user, idSchema.parse(goalId), progressSchema.parse(input));
    refresh();
  }, "تم حفظ الإنجاز");
}

/** «تعديل يدوي» for a goal updated from Notion. */
export async function overrideGoalAction(goalId: string, input: { value: number; reason: string }) {
  return runAction(async () => {
    const user = await actionUser();
    const v = z.object({ value: z.coerce.number().min(0).max(1_000_000), reason: z.string().trim().min(1, "اكتب سبب التعديل").max(500) }).parse(input);
    await manual.overrideGoal(user, idSchema.parse(goalId), v.value, v.reason);
    refresh();
  }, "تم حفظ التعديل اليدوي");
}

export async function resolveOverrideAction(goalId: string, choice: "keep" | "notion") {
  return runAction(
    async () => {
      const user = await actionUser();
      await manual.resolveOverride(user, idSchema.parse(goalId), z.enum(["keep", "notion"]).parse(choice));
      refresh();
    },
    choice === "keep" ? "تم إبقاء التعديل اليدوي" : "تم الرجوع لقيمة Notion",
  );
}

const batchSchema = z.object({
  employeeId: idSchema,
  number: z.coerce.number().int().min(1).max(1_000_000),
  total: z.coerce.number().int().min(1).max(100_000),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  imagesApproved: count,
  added: count,
  needsImprovement: count,
  waiting: count,
});

export async function saveManualBatchAction(input: z.input<typeof batchSchema>, id?: string) {
  return runAction(async () => {
    const user = await actionUser();
    await manual.saveManualBatch(user, batchSchema.parse(input), id ? idSchema.parse(id) : undefined);
    refresh();
  }, "تم حفظ الدفعة");
}

export async function deleteManualBatchAction(id: string) {
  return runAction(async () => {
    const user = await actionUser();
    await manual.deleteManualBatch(user, idSchema.parse(id));
    refresh();
  }, "تم حذف الدفعة");
}
