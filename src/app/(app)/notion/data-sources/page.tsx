import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { employeeOptions, listDataSources } from "@/server/queries/notion";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page";
import { DataSourcesManager } from "@/features/notion/data-sources-manager";

export const metadata: Metadata = { title: "قواعد بيانات Notion" };

export default async function NotionDataSourcesPage() {
  const user = await requirePermission(PERMISSIONS.NOTION_MANAGE);
  const [sources, connections, employees] = await Promise.all([
    listDataSources(),
    db.notionConnection.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, workspaceName: true } }),
    employeeOptions(),
  ]);
  return (
    <>
      <PageHeader
        title="قواعد بيانات Notion"
        description="القواعد التي يُزامن منها النظام حالات العمل. كل قاعدة تُقرأ تدريجيًا حسب آخر تعديل، وتُربط خصائصها بأدوار النظام من صفحة الربط."
      />
      <DataSourcesManager
        sources={sources}
        connections={connections.map((c) => ({ value: c.id, label: c.workspaceName ? `${c.name} — ${c.workspaceName}` : c.name }))}
        employees={employees}
        advanced={user.roleKey === "ADMIN"}
      />
    </>
  );
}
