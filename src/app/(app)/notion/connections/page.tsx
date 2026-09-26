import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Settings2 } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { listConnectionHealth, listConnections } from "@/server/queries/notion";
import { oauthConfig } from "@/server/notion/oauth";
import { PERMISSIONS } from "@/lib/permissions";
import { cleanEnv, OAUTH_CALLBACK_PATH } from "@/lib/notion/oauth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page";
import { ConnectionHub, OAuthDiagnostics } from "@/features/notion/connection-hub";
import { ConnectionsManager } from "@/features/notion/connections-manager";

export const metadata: Metadata = { title: "الاتصال بـ Notion" };

export default async function NotionConnectionsPage() {
  const user = await requirePermission(PERMISSIONS.NOTION_MANAGE);
  const advanced = user.roleKey === "ADMIN";
  const [workspaces, all] = await Promise.all([listConnectionHealth(), advanced ? listConnections() : Promise.resolve([])]);
  const config = oauthConfig();
  const appUrl = cleanEnv(process.env.APP_URL)?.replace(/\/+$/, "") ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="الاتصال بـ Notion"
        description="مساحات عمل Notion المربوطة وحالة كل اتصال."
        actions={
          config && workspaces.length > 0 ? (
            <Button size="sm" asChild>
              <Link href="/notion/connect">
                <Link2 /> ربط قاعدة بيانات
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ConnectionHub workspaces={workspaces} oauthEnabled={config !== null} />

      {advanced && (
        <details id="advanced" className="group scroll-mt-20 rounded-xl border bg-muted/20">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold">
            <Settings2 className="size-4 text-muted-foreground" />
            الإعدادات المتقدمة
            <span className="text-xs font-normal text-muted-foreground">لمسؤول النظام فقط</span>
          </summary>
          <div className="space-y-4 border-t p-4">
            <OAuthDiagnostics redirectUri={config?.redirectUri ?? `${appUrl}${OAUTH_CALLBACK_PATH}`} configured={config !== null} />
            <div className="space-y-2">
              <p className="text-sm font-semibold">الربط اليدوي برمز داخلي</p>
              <ConnectionsManager connections={all.filter((c) => c.authType === "INTERNAL")} />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
