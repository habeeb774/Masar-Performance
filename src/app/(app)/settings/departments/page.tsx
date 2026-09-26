import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page";
import { DepartmentsManager, type DepartmentRow } from "@/features/settings/departments-manager";

export const metadata: Metadata = { title: "الإدارات والأقسام" };

export default async function DepartmentsPage() {
  await requirePermission(PERMISSIONS.ORG_MANAGE);
  const departments = await db.department.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { _count: { select: { employees: true, children: true, jobTitles: true } } },
  });
  const headIds = departments.map((d) => d.headEmployeeId).filter((v): v is string => !!v);
  const heads = headIds.length ? await db.employee.findMany({ where: { id: { in: headIds } }, select: { id: true, fullName: true } }) : [];
  const headName = new Map(heads.map((h) => [h.id, h.fullName]));

  const rows: DepartmentRow[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    type: d.type,
    parentId: d.parentId,
    description: d.description,
    isActive: d.isActive,
    headName: d.headEmployeeId ? (headName.get(d.headEmployeeId) ?? null) : null,
    employees: d._count.employees,
    children: d._count.children,
    jobTitles: d._count.jobTitles,
  }));

  return (
    <>
      <PageHeader title="الإدارات والأقسام" description="الهيكل التنظيمي للشركة: إدارات رئيسية وأقسام تابعة لها" />
      <DepartmentsManager rows={rows} />
    </>
  );
}
