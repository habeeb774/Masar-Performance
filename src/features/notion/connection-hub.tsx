"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, CheckCircle2, Copy, Database, Link2, Plus, RefreshCw, ShieldCheck, TriangleAlert, Unplug, UserRound, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ActionButton } from "@/components/shared/action-button";
import { EmptyState } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { testConnectionAction } from "@/actions/notion";
import { checkNotionOAuthAction, disconnectNotionAction } from "@/actions/notion-connect";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import { OAUTH_START } from "./connect-wizard";

export interface WorkspaceRow {
  id: string;
  workspaceName: string | null;
  ownerEmail: string | null;
  botName: string | null;
  status: "UNTESTED" | "CONNECTED" | "FAILED";
  isActive: boolean;
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  dataSources: { id: string; name: string }[];
}

function health(w: WorkspaceRow): { label: string; tone: "success" | "danger" | "neutral"; hint: string } {
  if (!w.isActive) return { label: "غير متصل", tone: "neutral", hint: "تم قطع الاتصال. أعد الربط لاستئناف المزامنة — البيانات السابقة محفوظة." };
  if (w.status === "FAILED") return { label: "انتهى الاتصال", tone: "danger", hint: "انتهى اتصال Notion أو تم إلغاؤه." };
  return { label: "متصل بـ Notion", tone: "success", hint: "الاتصال يعمل والمزامنة التلقائية مفعّلة." };
}

function WorkspaceCard({ w }: { w: WorkspaceRow }) {
  const h = health(w);
  const needsReconnect = !w.isActive || w.status === "FAILED";
  return (
    <Card className={cn("gap-0", needsReconnect && "border-danger/30")}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl shadow-[var(--shadow-inset)]",
              h.tone === "success" ? "bg-success-soft text-success" : h.tone === "danger" ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground",
            )}
          >
            {h.tone === "success" ? <CheckCircle2 className="size-5" /> : h.tone === "danger" ? <TriangleAlert className="size-5" /> : <Unplug className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold">{w.workspaceName ?? "مساحة عمل Notion"}</p>
              <StatusBadge tone={h.tone}>{h.label}</StatusBadge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{h.hint}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted/40 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <UserRound className="size-3" /> الحساب المرتبط
            </dt>
            <dd className="mt-0.5 truncate" dir="auto">
              {w.ownerEmail ?? w.botName ?? "—"}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <RefreshCw className="size-3" /> آخر مزامنة
            </dt>
            <dd className="mt-0.5">{w.lastSyncedAt ? formatDateTimeAr(new Date(w.lastSyncedAt)) : "لم تتم بعد"}</dd>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Activity className="size-3" /> آخر فحص
            </dt>
            <dd className="mt-0.5">{w.lastTestedAt ? formatDateTimeAr(new Date(w.lastTestedAt)) : "—"}</dd>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Database className="size-3" /> قواعد البيانات
            </dt>
            <dd className="mt-0.5">{formatNumber(w.dataSources.length)}</dd>
          </div>
        </dl>

        {w.dataSources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {w.dataSources.map((d) => (
              <Link key={d.id} href={`/notion/mappings?ds=${d.id}`} className="rounded-lg border bg-card px-2 py-1 text-xs hover:bg-accent/50">
                {d.name}
              </Link>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {needsReconnect ? (
            <Button size="sm" asChild>
              <a href={OAUTH_START}>
                <RefreshCw /> إعادة الربط
              </a>
            </Button>
          ) : (
            <>
              <Button size="sm" asChild>
                <Link href={`/notion/connect?connection=${w.id}`}>
                  <Plus /> ربط قاعدة بيانات
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={OAUTH_START}>
                  <ShieldCheck /> إضافة قواعد أخرى من Notion
                </a>
              </Button>
              <ActionButton size="sm" variant="ghost" action={() => testConnectionAction(w.id)}>
                <Activity /> فحص الاتصال
              </ActionButton>
            </>
          )}
          {w.isActive && (
            <ActionButton
              size="sm"
              variant="ghost"
              className="ms-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              action={() => disconnectNotionAction(w.id)}
              confirm={{
                title: `قطع الاتصال بـ «${w.workspaceName ?? "Notion"}»؟`,
                description:
                  "ستُلغى صلاحية مسار الأداء في Notion وتُحذف بيانات الدخول المحفوظة، وتتوقف المزامنة. تبقى البيانات المتزامنة سابقًا والأهداف كما هي، ويمكنك إعادة الربط لاحقًا لاستئنافها.",
                confirmLabel: "قطع الاتصال",
                destructive: true,
              }}
            >
              <Unplug /> قطع الاتصال
            </ActionButton>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ConnectionHub({ workspaces, oauthEnabled }: { workspaces: WorkspaceRow[]; oauthEnabled: boolean }) {
  if (workspaces.length === 0) {
    return (
      <EmptyState
        icon={Workflow}
        title="Notion غير مربوط بعد"
        description={
          oauthEnabled
            ? "اربط Notion واختر قاعدة البيانات — يقترح النظام ربط الحقول والحالات تلقائيًا."
            : "ربط Notion يحتاج إعدادًا لمرة واحدة من مسؤول النظام."
        }
        action={
          oauthEnabled ? (
            <Button asChild>
              <Link href="/notion/connect">
                <Link2 /> ربط Notion
              </Link>
            </Button>
          ) : undefined
        }
        className="py-14"
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">
        {workspaces.map((w) => (
          <WorkspaceCard key={w.id} w={w} />
        ))}
      </div>
      {oauthEnabled && (
        <Button variant="ghost" size="sm" asChild>
          <a href={OAUTH_START}>
            <Plus /> ربط مساحة عمل أخرى
          </a>
        </Button>
      )}
    </div>
  );
}

const CHECK_RESULTS = {
  ok: { tone: "success" as const, text: "Notion يقبل بيانات تطبيق الربط (Client ID و Client Secret متطابقان وصحيحان)." },
  credentials: {
    tone: "danger" as const,
    text: "Notion يرفض Client ID أو Client Secret (خطأ 401 invalid_client). غالبًا تم تجديد السر في Notion دون تحديثه في متغيرات البيئة، أو أن المعرّف والسر من تكاملين مختلفين، أو أُلصقت القيمة مع علامات تنصيص/مسافات. انسخ القيمتين من نفس تكامل OAuth في Notion، حدّثهما في Vercel، ثم أعد النشر.",
  },
  not_configured: { tone: "warning" as const, text: "متغيرات OAuth غير مضبوطة على الخادم." },
  unreachable: { tone: "warning" as const, text: "تعذر الوصول إلى Notion للفحص الآن. حاول لاحقًا." },
};

/** Admin-only: shows the exact redirect URI and verifies the Client ID/Secret pair against Notion. */
export function OAuthDiagnostics({ redirectUri, configured }: { redirectUri: string; configured: boolean }) {
  const check = useServerAction(checkNotionOAuthAction, { silent: true });
  const [result, setResult] = useState<keyof typeof CHECK_RESULTS | null>(null);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-semibold">تطبيق ربط Notion (OAuth)</p>
        <p className="text-xs text-muted-foreground">
          الحالة: {configured ? "مضبوط" : "غير مضبوط"} — يُقرأ من متغيرات البيئة{" "}
          <code dir="ltr" className="font-mono">
            NOTION_OAUTH_CLIENT_ID / NOTION_OAUTH_CLIENT_SECRET / NOTION_OAUTH_REDIRECT_URI
          </code>{" "}
          (أو{" "}
          <code dir="ltr" className="font-mono">
            NOTION_CLIENT_ID / NOTION_CLIENT_SECRET / NOTION_REDIRECT_URI
          </code>
          ).
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">عنوان إعادة التوجيه — يجب أن يطابق حرفيًا ما في إعدادات التكامل في Notion:</p>
        <div className="flex items-center gap-2">
          <code dir="ltr" className="min-w-0 flex-1 rounded-lg bg-muted px-2 py-1.5 font-mono text-xs break-all">
            {redirectUri}
          </code>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="نسخ العنوان"
            onClick={() => navigator.clipboard.writeText(redirectUri).then(() => toast.success("تم نسخ العنوان"))}
          >
            <Copy />
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-start gap-3">
        <Button size="sm" variant="outline" disabled={check.pending} onClick={() => check.run().then((r) => r.ok && r.data && setResult(r.data.result))}>
          {check.pending ? <Spinner /> : <ShieldCheck />} فحص بيانات تطبيق الربط
        </Button>
        {result && (
          <p
            className={cn(
              "rounded-lg px-3 py-2 text-xs leading-6",
              CHECK_RESULTS[result].tone === "success" ? "bg-success-soft text-success" : CHECK_RESULTS[result].tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
            )}
          >
            {CHECK_RESULTS[result].text}
          </p>
        )}
      </div>
    </div>
  );
}
