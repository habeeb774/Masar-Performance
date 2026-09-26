import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { employeeOptions, listConnectionHealth } from "@/server/queries/notion";
import { isOAuthConfigured } from "@/server/notion/oauth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { isOAuthResult, OAUTH_RESULT_MESSAGES } from "@/lib/notion/oauth";
import { str, type SearchParams } from "@/lib/params";
import { PageHeader } from "@/components/shared/page";
import { ConnectWizard } from "@/features/notion/connect-wizard";

export const metadata: Metadata = { title: "ربط Notion" };
// the first sync runs inside a server action on this page
export const maxDuration = 60;

export default async function NotionConnectPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.NOTION_MANAGE);
  const sp = await searchParams;
  const [connections, employees] = await Promise.all([listConnectionHealth(), employeeOptions()]);
  const result = str(sp.oauth);
  const oauthResult = isOAuthResult(result) ? OAUTH_RESULT_MESSAGES[result] : null;

  return (
    <>
      <PageHeader title="ربط Notion" description="اربط Notion، اختر قاعدة البيانات، راجع الربط المقترح، ثم ابدأ المزامنة." />
      <ConnectWizard
        connections={connections.filter((c) => c.isActive)}
        initialConnectionId={str(sp.connection) ?? null}
        oauthEnabled={isOAuthConfigured()}
        oauthResult={oauthResult ? { ok: oauthResult.ok, message: oauthResult.message } : null}
        employees={employees}
        advanced={user.roleKey === "ADMIN"}
        canSync={hasPermission(user, PERMISSIONS.NOTION_SYNC)}
      />
    </>
  );
}
