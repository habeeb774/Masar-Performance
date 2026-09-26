import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSION_CATALOG, PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page";
import { PermissionsMatrix } from "@/features/settings/permissions-matrix";

export const metadata: Metadata = { title: "مصفوفة الصلاحيات" };

export default async function PermissionsPage() {
  await requirePermission(PERMISSIONS.ROLES_MANAGE);
  const [roles, dbPermissions] = await Promise.all([
    db.role.findMany({
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      include: { permissions: { include: { permission: { select: { key: true } } } }, _count: { select: { users: true } } },
    }),
    db.permission.findMany({ select: { key: true } }),
  ]);
  const known = new Set(dbPermissions.map((p) => p.key));
  // catalog entries missing from the Permission table cannot be granted until the seed runs
  const missing = PERMISSION_CATALOG.filter((p) => !known.has(p.key)).map((p) => p.key);

  return (
    <>
      <PageHeader title="مصفوفة الصلاحيات" description="الصفوف هي الصلاحيات والأعمدة هي الأدوار. عدّل ثم احفظ كل دور أو احفظ جميع التغييرات مرة واحدة." />
      <PermissionsMatrix
        roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, users: r._count.users, permissions: r.permissions.map((p) => p.permission.key) }))}
        missing={missing}
      />
    </>
  );
}
