"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, UserError } from "@/server/action";
import { actionPermission, actionUser, assertEmployeeAccess } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { idSchema, optionalText, reportNotesSchema, reportReviewSchema } from "@/lib/validation";
import * as reports from "@/server/services/reports";

const refresh = () => revalidatePath("/", "layout");

export async function generateWeeklyReportAction(weeklyPlanId: string) {
  return runAction(async () => {
    const user = await actionUser();
    const week = await db.weeklyPlan.findUniqueOrThrow({ where: { id: idSchema.parse(weeklyPlanId) } });
    assertEmployeeAccess(user, week.employeeId);
    const report = await reports.generateWeeklyReport(week.id);
    refresh();
    return { id: report.id };
  }, "تم توليد التقرير الأسبوعي");
}

export async function refreshWeeklyReportAction(reportId: string) {
  return runAction(async () => {
    const user = await actionUser();
    const report = await db.weeklyReport.findUniqueOrThrow({ where: { id: idSchema.parse(reportId) } });
    assertEmployeeAccess(user, report.employeeId);
    if (!["DRAFT", "RETURNED"].includes(report.status)) throw new UserError("لا يمكن تحديث تقرير مرسل");
    await reports.generateWeeklyReport(report.weeklyPlanId);
    refresh();
  }, "تم تحديث أرقام التقرير");
}

export async function saveWeeklyNotesAction(reportId: string, input: z.input<typeof reportNotesSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    const data = reportNotesSchema.parse(input);
    await reports.updateWeeklyNotes(user, idSchema.parse(reportId), data);
    refresh();
  }, "تم حفظ الملاحظات");
}

export async function submitWeeklyReportAction(reportId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.REPORTS_SUBMIT_OWN, PERMISSIONS.TASKS_MANAGE_OWN);
    await reports.submitWeeklyReport(user, idSchema.parse(reportId));
    refresh();
  }, "تم إرسال التقرير للمدير");
}

export async function reviewWeeklyReportAction(reportId: string, input: z.input<typeof reportReviewSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.REPORTS_REVIEW);
    const data = reportReviewSchema.parse(input);
    await reports.reviewWeeklyReport(user, idSchema.parse(reportId), data.decision, data.comment);
    refresh();
  }, "تم حفظ قرار المراجعة");
}

export async function generateMonthlyReportAction(planId: string) {
  return runAction(async () => {
    const user = await actionUser();
    const plan = await db.monthlyPlan.findUniqueOrThrow({ where: { id: idSchema.parse(planId) } });
    assertEmployeeAccess(user, plan.employeeId);
    const report = await reports.generateMonthlyReport(plan.id);
    refresh();
    return { id: report.id };
  }, "تم توليد التقرير الشهري");
}

export async function refreshMonthlyReportAction(reportId: string) {
  return runAction(async () => {
    const user = await actionUser();
    const report = await db.monthlyReport.findUniqueOrThrow({ where: { id: idSchema.parse(reportId) } });
    assertEmployeeAccess(user, report.employeeId);
    if (!["DRAFT", "RETURNED"].includes(report.status)) throw new UserError("لا يمكن تحديث تقرير مرسل");
    await reports.generateMonthlyReport(report.monthlyPlanId);
    refresh();
  }, "تم تحديث أرقام التقرير");
}

const monthlyNotesSchema = z.object({
  employeeNotes: optionalText(5000),
  highlights: optionalText(5000),
  managerNotes: optionalText(5000),
});

export async function saveMonthlyNotesAction(reportId: string, input: z.input<typeof monthlyNotesSchema>) {
  return runAction(async () => {
    const user = await actionUser();
    const parsed = monthlyNotesSchema.parse(input);
    const patch = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in input));
    await reports.updateMonthlyNotes(user, idSchema.parse(reportId), patch);
    refresh();
  }, "تم حفظ الملاحظات");
}

export async function submitMonthlyReportAction(reportId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.REPORTS_SUBMIT_OWN, PERMISSIONS.TASKS_MANAGE_OWN);
    await reports.submitMonthlyReport(user, idSchema.parse(reportId));
    refresh();
  }, "تم إرسال التقرير الشهري للمدير");
}

export async function reviewMonthlyReportAction(reportId: string, input: z.input<typeof reportReviewSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.REPORTS_REVIEW);
    const data = reportReviewSchema.parse(input);
    await reports.reviewMonthlyReport(user, idSchema.parse(reportId), data.decision, data.comment);
    refresh();
  }, "تم حفظ قرار المراجعة");
}
