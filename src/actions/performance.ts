"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { runAction, UserError } from "@/server/action";
import { actionPermission, actionUser, employeeIdScope } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { validateFormula } from "@/lib/kpi/formula";
import { KPI_FORMULA_VARIABLES } from "@/lib/kpi/engine";
import {
  idSchema,
  kpiAssignmentSchema,
  kpiOverrideSchema,
  kpiTemplateSchema,
  ratingScaleSchema,
  reviewAdjustSchema,
} from "@/lib/validation";
import * as perf from "@/server/services/performance";

const refresh = () => revalidatePath("/", "layout");

export async function calculateReviewAction(employeeId: string, year: number, month: number) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    const review = await perf.calculateReview(user, idSchema.parse(employeeId), z.number().int().parse(year), z.number().int().min(1).max(12).parse(month));
    refresh();
    return { id: review.id };
  }, "تم حساب التقييم آليًا");
}

export async function calculateAllReviewsAction(year: number, month: number) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    const scope = employeeIdScope(user);
    const employees = await db.employee.findMany({
      where: {
        status: "ACTIVE",
        jobTitleId: { not: null },
        monthlyPlans: { some: { year, month } },
        ...(scope === "ALL" ? {} : { id: { in: scope } }),
      },
      select: { id: true },
    });
    let done = 0;
    const errors: string[] = [];
    for (const e of employees) {
      try {
        await perf.calculateReview(user, e.id, year, month);
        done++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    refresh();
    return { done, errors };
  }, "تم حساب التقييمات");
}

export async function overrideKpiAction(resultId: string, input: z.input<typeof kpiOverrideSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    const data = kpiOverrideSchema.parse(input);
    await perf.overrideKpiResult(user, idSchema.parse(resultId), data.score, data.reason);
    refresh();
  }, "تم تعديل نتيجة المؤشر");
}

export async function adjustReviewAction(reviewId: string, input: z.input<typeof reviewAdjustSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_REVIEW);
    await perf.adjustReview(user, idSchema.parse(reviewId), reviewAdjustSchema.parse(input));
    refresh();
  }, "تم حفظ مراجعة المدير");
}

export async function approveReviewAction(reviewId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.PERFORMANCE_APPROVE);
    await perf.approveReview(user, idSchema.parse(reviewId));
    refresh();
  }, "تم اعتماد التقييم");
}

export async function acknowledgeReviewAction(reviewId: string) {
  return runAction(async () => {
    const user = await actionUser();
    await perf.acknowledgeReview(user, idSchema.parse(reviewId));
    refresh();
  }, "شكرًا، تم تسجيل اطلاعك على التقييم");
}

// ---- KPI configuration ------------------------------------------------------------

function checkFormula(config: { formula?: string } | null | undefined) {
  if (config?.formula) {
    const v = validateFormula(config.formula, KPI_FORMULA_VARIABLES);
    if (!v.ok) throw new UserError(`المعادلة غير صالحة: ${v.error}`);
  }
}

export async function saveKpiTemplateAction(id: string | null, input: z.input<typeof kpiTemplateSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.KPI_MANAGE);
    const data = kpiTemplateSchema.parse(input);
    checkFormula(data.methodConfig);
    const payload = {
      ...data,
      methodConfig: (data.methodConfig ?? undefined) as Prisma.InputJsonValue | undefined,
      sourceConfig: (data.sourceConfig ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    if (id) {
      const before = await db.kpiTemplate.findUniqueOrThrow({ where: { id } });
      const after = await db.kpiTemplate.update({ where: { id }, data: payload });
      await audit({ user, action: "kpi_template.update", entityType: "KpiTemplate", entityId: id, before, after, diff: true });
    } else {
      const created = await db.kpiTemplate.create({ data: payload });
      await audit({ user, action: "kpi_template.create", entityType: "KpiTemplate", entityId: created.id, after: data });
    }
    refresh();
  }, "تم حفظ المؤشر");
}

export async function saveKpiAssignmentAction(id: string | null, input: z.input<typeof kpiAssignmentSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.KPI_MANAGE);
    const data = kpiAssignmentSchema.parse(input);
    if (id) {
      const before = await db.kpi.findUniqueOrThrow({ where: { id } });
      const after = await db.kpi.update({ where: { id }, data: { weight: data.weight, target: data.target ?? null, isActive: data.isActive } });
      await audit({ user, action: "kpi.assign", entityType: "Kpi", entityId: id, before, after, diff: true });
    } else {
      const exists = await db.kpi.findFirst({ where: { templateId: data.templateId, jobTitleId: data.jobTitleId } });
      if (exists) throw new UserError("المؤشر مرتبط بهذه الوظيفة مسبقًا");
      const created = await db.kpi.create({ data: { templateId: data.templateId, jobTitleId: data.jobTitleId, weight: data.weight, target: data.target ?? null, isActive: data.isActive } });
      await audit({ user, action: "kpi.assign", entityType: "Kpi", entityId: created.id, after: data });
    }
    refresh();
  }, "تم حفظ ربط المؤشر");
}

export async function deleteKpiAssignmentAction(id: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.KPI_MANAGE);
    const before = await db.kpi.findUniqueOrThrow({ where: { id: idSchema.parse(id) } });
    await db.kpi.delete({ where: { id } });
    await audit({ user, action: "kpi.unassign", entityType: "Kpi", entityId: id, before });
    refresh();
  }, "تم إلغاء ربط المؤشر");
}

export async function saveRatingScaleAction(scaleId: string | null, input: z.input<typeof ratingScaleSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.RATING_SCALE_MANAGE);
    const data = ratingScaleSchema.parse(input);
    const before = scaleId ? await db.performanceRatingScale.findUnique({ where: { id: scaleId }, include: { bands: true } }) : null;
    await db.$transaction(async (tx) => {
      let id = scaleId;
      if (id) {
        await tx.performanceRatingScale.update({ where: { id }, data: { name: data.name } });
        await tx.performanceRatingBand.deleteMany({ where: { scaleId: id } });
      } else {
        await tx.performanceRatingScale.updateMany({ data: { isActive: false } });
        id = (await tx.performanceRatingScale.create({ data: { name: data.name, isActive: true } })).id;
      }
      await tx.performanceRatingBand.createMany({
        data: [...data.bands]
          .sort((a, b) => b.minScore - a.minScore)
          .map((b, i) => ({ scaleId: id!, label: b.label, minScore: b.minScore, maxScore: b.maxScore, color: b.color, sortOrder: i })),
      });
    });
    await audit({ user, action: "rating_scale.update", entityType: "PerformanceRatingScale", entityId: scaleId, before, after: data });
    refresh();
  }, "تم حفظ سلم التقييم");
}
