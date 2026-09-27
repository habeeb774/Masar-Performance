import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { employeeOptions, listConnectionHealth } from "@/server/queries/notion";
import { isOAuthConfigured, oauthConfig } from "@/server/notion/oauth";
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
  const advanced = user.roleKey === "ADMIN";
  // admins get the exact cause; everyone else keeps the calm generic message
  const adminDetail =
    advanced && result === "config"
      ? "السبب: متغيرات تطبيق الربط غير مضبوطة على الخادم (NOTION_OAUTH_CLIENT_ID و NOTION_OAUTH_CLIENT_SECRET في Vercel)."
      : advanced && result === "credentials"
        ? "السبب: رفض Notion معرّف التطبيق أو السر (401 invalid_client). انسخ Client ID وClient Secret من نفس التكامل في Notion إلى Vercel بدون علامات تنصيص، ثم أعد النشر."
        : null;

  return (
    <>
      <PageHeader title="ربط Notion" description="اربط Notion واختر القاعدة، ويتولى النظام الباقي." />
      <ConnectWizard
        connections={connections.filter((c) => c.isActive)}
        initialConnectionId={str(sp.connection) ?? null}
        oauthEnabled={isOAuthConfigured()}
        redirectUri={oauthConfig()?.redirectUri ?? ""}
        oauthResult={oauthResult ? { ok: oauthResult.ok, message: oauthResult.message, detail: adminDetail } : null}
        employees={employees}
        advanced={advanced}
        canSync={hasPermission(user, PERMISSIONS.NOTION_SYNC)}
        autoStart={result === "success"}
      />
    </>
  );
}
