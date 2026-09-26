import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { listConnections } from "@/server/queries/notion";
import { oauthConfig } from "@/server/notion/oauth";
import { PERMISSIONS } from "@/lib/permissions";
import { OAUTH_CALLBACK_PATH, OAUTH_RESULT_MESSAGES } from "@/lib/notion/oauth";
import { str, type SearchParams } from "@/lib/params";
import { PageHeader } from "@/components/shared/page";
import { ConnectionsManager } from "@/features/notion/connections-manager";

export const metadata: Metadata = { title: "اتصالات Notion" };

export default async function NotionConnectionsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.NOTION_MANAGE);
  const sp = await searchParams;
  const connections = await listConnections();
  const config = oauthConfig();
  const result = str(sp.oauth);
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") ?? "";

  return (
    <>
      <PageHeader
        title="اتصالات Notion"
        description="اربط Notion عبر OAuth بحسابك مباشرة، أو بلصق رمز تكامل داخلي. الرموز تُخزن مشفّرة ويظهر منها آخر 4 أحرف فقط."
      />
      <ConnectionsManager
        connections={connections}
        oauth={{
          enabled: config !== null,
          redirectUri: config?.redirectUri ?? (appUrl ? `${appUrl}${OAUTH_CALLBACK_PATH}` : OAUTH_CALLBACK_PATH),
          result: result && OAUTH_RESULT_MESSAGES[result] ? { ok: result === "success", message: OAUTH_RESULT_MESSAGES[result] } : null,
        }}
      />
    </>
  );
}
