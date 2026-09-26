import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page";
import { RolesManager, type RoleRow } from "@/features/settings/roles-manager";

export const metadata: Metadata = { title: "الأدوار" };

export default async function RolesPage() {
  await requirePermission(PERMISSIONS.ROLES_MANAGE);
  const roles = await db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    include: { permissions: { include: { permission: { select: { key: true } } } }, _count: { select: { users: true } } },
  });
  const rows: RoleRow[] = roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    users: r._count.users,
    permissions: r.permissions.map((p) => p.permission.key),
  }));
  return (
    <>
      <PageHeader title="الأدوار" description="تُبنى صلاحيات المستخدم على دوره فقط؛ اضغط على أي دور لتعديل صلاحياته" />
      <RolesManager rows={rows} />
    </>
  );
}
