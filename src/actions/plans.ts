"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import { actionPermission, actionUser } from "@/server/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import {
  createPlanSchema,
  dailyDistributionSchema,
  idSchema,
  monthlyGoalSchema,
  teamPlanSchema,
  weeklyDistributionSchema,
} from "@/lib/validation";
import * as plans from "@/server/services/plans";
import * as teamPlan from "@/server/services/team-plan";

const refresh = () => {
  revalidatePath("/", "layout");
};

export async function createPlanAction(input: z.input<typeof createPlanSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    const plan = await plans.createMonthlyPlan(user, createPlanSchema.parse(input));
    refresh();
    return { id: plan.id };
  }, "تم إنشاء الخطة الشهرية");
}

export async function addGoalAction(planId: string, input: z.input<typeof monthlyGoalSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await plans.addGoal(user, idSchema.parse(planId), monthlyGoalSchema.parse(input));
    refresh();
  }, "تمت إضافة الهدف");
}

export async function updateGoalAction(goalId: string, input: z.input<typeof monthlyGoalSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    await plans.updateGoal(user, idSchema.parse(goalId), monthlyGoalSchema.parse(input));
    refresh();
  }, "تم تحديث الهدف");
}

export async function deleteGoalAction(goalId: string) {
  return runAction(async () => {
    const user = await actionUser();
    await plans.deleteGoal(user, idSchema.parse(goalId));
    refresh();
  }, "تم حذف الهدف");
}

export async function cancelGoalAction(goalId: string, reason?: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PLANS_MANAGE);
    await plans.cancelGoal(user, idSchema.parse(goalId), z.string().min(3, "اكتب سبب الإلغاء").parse(reason ?? ""));
    refresh();
  }, "تم إلغاء الهدف");
}

export async function submitPlanAction(planId: string) {
  return runAction(async () => {
    const user = await actionUser();
    await plans.submitPlan(user, idSchema.parse(planId));
    refresh();
  }, "تم إرسال الخطة للاعتماد");
}

export async function approvePlanAction(planId: string, notes?: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PLANS_APPROVE);
    await plans.approvePlan(user, idSchema.parse(planId), notes ?? null);
    refresh();
  }, "تم اعتماد الخطة وتوليد الأسابيع");
}

export async function returnPlanAction(planId: string, notes?: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PLANS_APPROVE);
    await plans.returnPlan(user, idSchema.parse(planId), z.string().min(3, "اكتب سبب الإعادة").parse(notes ?? ""));
    refresh();
  }, "تمت إعادة الخطة للموظف");
}

export async function setPlanStatusAction(planId: string, status: "IN_PROGRESS" | "COMPLETED" | "ARCHIVED") {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PLANS_MANAGE);
    await plans.setPlanStatus(user, idSchema.parse(planId), z.enum(["IN_PROGRESS", "COMPLETED", "ARCHIVED"]).parse(status));
    refresh();
  }, "تم تحديث حالة الخطة");
}

export async function saveWeeklyDistributionAction(input: z.input<typeof weeklyDistributionSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    const result = await plans.saveWeeklyDistribution(user, weeklyDistributionSchema.parse(input));
    refresh();
    return result;
  }, "تم حفظ التوزيع الأسبوعي");
}

export async function approveWeeklyVarianceAction(planId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PLANS_APPROVE);
    await plans.approveWeeklyVariance(user, idSchema.parse(planId));
    refresh();
  }, "تم اعتماد التوزيع");
}

export async function suggestDailyAction(weeklyPlanId: string) {
  return runAction(async () => {
    await actionUser();
    return plans.suggestDailySplit(idSchema.parse(weeklyPlanId));
  });
}

export async function saveDailyDistributionAction(input: z.input<typeof dailyDistributionSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    const result = await plans.saveDailyDistribution(user, dailyDistributionSchema.parse(input));
    refresh();
    return result;
  }, "تم حفظ التوزيع اليومي");
}

export async function ensureWeeksAction(planId: string) {
  return runAction(async () => {
    await actionPermission(PERMISSIONS.PLANS_MANAGE);
    await plans.ensureWeeklyPlans(idSchema.parse(planId));
    refresh();
  }, "تم تحديث أسابيع الخطة");
}

export async function teamPlanDraftAction(employeeId: string, year: number, month: number) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PLANS_MANAGE);
    return teamPlan.teamPlanDraft(user, idSchema.parse(employeeId), z.number().int().parse(year), z.number().int().min(1).max(12).parse(month));
  });
}

export async function createTeamPlanAction(input: z.input<typeof teamPlanSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PLANS_MANAGE);
    const result = await teamPlan.createTeamPlan(user, teamPlanSchema.parse(input));
    refresh();
    return result;
  }, "تم إعداد الخطة");
}
