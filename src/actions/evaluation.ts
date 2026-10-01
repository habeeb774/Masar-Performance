"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import { actionPermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import * as ev from "@/server/services/evaluation";

const refresh = () => revalidatePath("/", "layout");
const amount = z.coerce.number().min(0, "القيم يجب أن تكون موجبة").max(1_000_000);
const weight = z.coerce.number().min(0, "الوزن بين 0 و100").max(100, "الوزن بين 0 و100");
const reason = z.string().trim().max(500).nullish().transform((v) => v || null);
const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export async function createEvaluationAction(employeeId: string, year: number, month: number) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    const e = await ev.createEvaluation(user, idSchema.parse(employeeId), z.number().int().min(2020).max(2100).parse(year), z.number().int().min(1).max(12).parse(month));
    refresh();
    return { id: e.id };
  }, "تم إنشاء التقييم");
}

export async function refreshEvaluationAction(evaluationId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await ev.refreshEvaluation(user, idSchema.parse(evaluationId));
    refresh();
  }, "تم تحديث القيم الآلية");
}

const indicatorPatch = z.object({
  title: z.string().trim().min(1, "اكتب اسم المؤشر").max(300).optional(),
  description: text(1000).optional(),
  notes: text(1000).optional(),
  achieved: amount.optional(),
  target: amount.optional(),
  weight: weight.optional(),
});

export async function updateIndicatorAction(indicatorId: string, patch: z.input<typeof indicatorPatch>, why?: string | null) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await ev.updateIndicator(user, idSchema.parse(indicatorId), indicatorPatch.parse(patch), reason.parse(why));
    refresh();
  });
}

export async function resetIndicatorAction(indicatorId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await ev.resetIndicator(user, idSchema.parse(indicatorId));
    refresh();
  }, "عادت القيمة الآلية");
}

const newIndicator = z.object({
  title: z.string().trim().min(1, "اكتب اسم المؤشر").max(300),
  description: text(1000),
  achieved: amount.default(0),
  target: amount.default(1),
  weight: weight.default(0),
  monthlyGoalId: z.string().nullish(),
});

export async function addIndicatorAction(dutyId: string, input: z.input<typeof newIndicator>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await ev.addIndicator(user, idSchema.parse(dutyId), newIndicator.parse(input));
    refresh();
  }, "أضيف المؤشر");
}

export async function removeIndicatorAction(indicatorId: string, why?: string | null) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await ev.removeIndicator(user, idSchema.parse(indicatorId), reason.parse(why));
    refresh();
  }, "حُذف المؤشر");
}

export async function updateDutyAction(dutyId: string, patch: { title?: string; weight?: number }, why?: string | null) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await ev.updateDuty(user, idSchema.parse(dutyId), z.object({ title: z.string().trim().min(1).max(300).optional(), weight: weight.optional() }).parse(patch), reason.parse(why));
    refresh();
  });
}

export async function overrideFinalScoreAction(evaluationId: string, score: number | null, why: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await ev.overrideFinalScore(user, idSchema.parse(evaluationId), score === null ? null : z.coerce.number().min(0).max(100).parse(score), z.string().trim().min(1, "اكتب السبب").max(500).parse(why));
    refresh();
  }, "تم تحديث النتيجة النهائية");
}

export async function updateEvaluationNotesAction(evaluationId: string, notes: string | null) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await ev.updateEvaluationNotes(user, idSchema.parse(evaluationId), text(4000).parse(notes));
    refresh();
  });
}

export async function approveEvaluationAction(evaluationId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_APPROVE);
    await ev.approveEvaluation(user, idSchema.parse(evaluationId));
    refresh();
  }, "تم اعتماد التقييم");
}

export async function reopenEvaluationAction(evaluationId: string, why: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_APPROVE);
    await ev.reopenEvaluation(user, idSchema.parse(evaluationId), z.string().trim().min(1, "اكتب السبب").max(500).parse(why));
    refresh();
  }, "أعيد فتح التقييم");
}
