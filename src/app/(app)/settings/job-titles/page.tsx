import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page";
import { JobTitlesManager, type JobTitleRow } from "@/features/settings/job-titles-manager";

export const metadata: Metadata = { title: "المسميات الوظيفية" };

export default async function JobTitlesPage() {
  await requirePermission(PERMISSIONS.ORG_MANAGE);
  const [titles, departments] = await Promise.all([
    db.jobTitle.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { employees: true, goalTemplates: true, kpis: true } },
      },
    }),
    db.department.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true, isActive: true } }),
  ]);

  const rows: JobTitleRow[] = titles.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    departmentId: t.departmentId,
    departmentName: t.department?.name ?? null,
    isActive: t.isActive,
    employees: t._count.employees,
    goalTemplates: t._count.goalTemplates,
    kpis: t._count.kpis,
  }));

  return (
    <>
      <PageHeader title="المسميات الوظيفية" description="كل مسمى يُربط بقوالب أهداف ومؤشرات أداء خاصة به" />
      <JobTitlesManager rows={rows} departments={departments} />
    </>
  );
}
