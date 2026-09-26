import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { listConnections } from "@/server/queries/notion";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page";
import { ConnectionsManager } from "@/features/notion/connections-manager";

export const metadata: Metadata = { title: "اتصالات Notion" };

export default async function NotionConnectionsPage() {
  await requirePermission(PERMISSIONS.NOTION_MANAGE);
  const connections = await listConnections();
  return (
    <>
      <PageHeader
        title="اتصالات Notion"
        description="رموز التكامل الداخلي (Internal Integration) التي يقرأ بها النظام قواعد Notion. الرمز يُخزن مشفّرًا ويظهر منه آخر 4 أحرف فقط."
      />
      <ConnectionsManager connections={connections} />
    </>
  );
}
