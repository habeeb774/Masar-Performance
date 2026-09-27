import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { IdParams } from "@/lib/params";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { num } from "@/lib/num";
import { formatDateTimeAr } from "@/lib/dates";
import type { GoalSourceKey, GoalTypeKey, KpiCategoryKey, PriorityKey } from "@/lib/labels";
import { companyToday, getNotionSourceOptions, monthPeriod } from "@/server/queries/plans";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page";
import { TemplateEditor } from "@/features/goals/template-editor";
import { normalizeRule } from "@/features/goals/types";
import { DeleteTemplateButton } from "@/features/goals/delete-template-button";

export const metadata: Metadata = { title: "تعديل قالب الأهداف" };

export default async function EditGoalTemplatePage({ params }: { params: IdParams }) {
  await requirePermission(PERMISSIONS.GOAL_TEMPLATES_MANAGE);
  const { id } = await params;
  const [template, jobTitles, sources, { year, month }] = await Promise.all([
    db.goalTemplate.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { plans: true } } } }),
    db.jobTitle.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    getNotionSourceOptions(),
    companyToday(),
  ]);
  if (!template) notFound();

  const initial = {
    name: template.name,
    description: template.description ?? "",
    jobTitleId: template.jobTitleId,
    isActive: template.isActive,
    items: template.items.map((it) => {
      const rule = normalizeRule(it.notionFilter);
      const dataSourceId = (it.notionFilter as { dataSourceId?: unknown } | null)?.dataSourceId;
      return {
        id: it.id,
        name: it.name,
        dutyName: it.dutyName ?? "",
        description: it.description ?? "",
        goalType: it.goalType as GoalTypeKey,
        targetValue: num(it.targetValue),
        unit: it.unit,
        weight: num(it.weight),
        priority: it.priority as PriorityKey,
        source: (it.source === "SYSTEM" ? "MANUAL" : it.source) as GoalSourceKey,
        category: it.category as KpiCategoryKey,
        notionDataSourceId: typeof dataSourceId === "string" ? dataSourceId : null,
        notionFilter: it.source === "NOTION" ? rule : null,
      };
    }),
  };

  return (
    <>
      <PageHeader
        title={template.name}
        description={`مستخدم في ${template._count.plans} خطة · آخر تحديث ${formatDateTimeAr(template.updatedAt)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/goals">
                <ArrowRight /> القوالب
              </Link>
            </Button>
            <DeleteTemplateButton id={template.id} name={template.name} redirectTo="/goals" />
          </>
        }
      />
      <TemplateEditor
        id={template.id}
        initial={initial}
        jobTitles={jobTitles.filter((j) => j.isActive || j.id === template.jobTitleId)}
        sources={sources}
        testPeriod={monthPeriod(year, month)}
      />
    </>
  );
}
