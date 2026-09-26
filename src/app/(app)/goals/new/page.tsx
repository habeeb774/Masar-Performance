import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { str } from "@/lib/params";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { companyToday, getNotionSourceOptions, monthPeriod } from "@/server/queries/plans";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page";
import { TemplateEditor } from "@/features/goals/template-editor";
import { newTemplateItem } from "@/features/goals/types";

export const metadata: Metadata = { title: "قالب أهداف جديد" };

export default async function NewGoalTemplatePage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.GOAL_TEMPLATES_MANAGE);
  const sp = await searchParams;
  const [jobTitles, sources, { year, month }] = await Promise.all([
    db.jobTitle.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getNotionSourceOptions(),
    companyToday(),
  ]);
  const preset = str(sp.jobTitle);
  const jobTitle = jobTitles.find((j) => j.id === preset);

  return (
    <>
      <PageHeader
        title="قالب أهداف جديد"
        description="حدد بنود الأهداف ومستهدفاتها وأوزانها، واربط البنود المحسوبة من Notion بقاعدة احتساب."
        actions={
          <Button variant="outline" asChild>
            <Link href="/goals">
              <ArrowRight /> القوالب
            </Link>
          </Button>
        }
      />
      <TemplateEditor
        id={null}
        initial={{ name: jobTitle ? `قالب ${jobTitle.name}` : "", description: "", jobTitleId: jobTitle?.id ?? null, isActive: true, items: [newTemplateItem()] }}
        jobTitles={jobTitles}
        sources={sources}
        testPeriod={monthPeriod(year, month)}
      />
    </>
  );
}
