import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Database, Layers, Link2, ListChecks, RotateCcw, Hourglass, CheckCircle2, History } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { getNotionOverview } from "@/server/queries/notion";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { DATA_SOURCE_PURPOSES, NOTION_STATUS_LABELS, SYNC_STATUS_LABELS, SYNC_TRIGGER_LABELS } from "@/lib/labels";
import { SYSTEM_STATUSES } from "@/lib/notion/status";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, KeyValue, NotionSyncedTag, PageHeader, StatCard } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { OnboardingChecklist } from "@/features/notion/onboarding";
import { FullSyncButton, SyncNowButton } from "@/features/notion/sync-buttons";

export const metadata: Metadata = { title: "تكامل Notion" };

export default async function NotionOverviewPage() {
  const user = await requirePermission(PERMISSIONS.NOTION_MANAGE, PERMISSIONS.NOTION_SYNC);
  const canManage = hasPermission(user, PERMISSIONS.NOTION_MANAGE);
  const canSync = hasPermission(user, PERMISSIONS.NOTION_SYNC);
  const data = await getNotionOverview();
  const o = data.onboarding;
  const complete = o.connection && o.connectionOk && o.dataSource && o.firstSync;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تكامل Notion"
        description="متابعة ربط قواعد Notion ومزامنة حالات العمل التي تُحتسب منها أهداف الموظفين."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/notion/sync-logs">
                <History /> سجل المزامنة
              </Link>
            </Button>
            {canManage && (
              <Button size="sm" asChild>
                <Link href="/notion/connect">
                  <Link2 /> ربط قاعدة بيانات
                </Link>
              </Button>
            )}
          </>
        }
      >
        <NotionSyncedTag className="mt-2" />
      </PageHeader>

      {!complete && <OnboardingChecklist state={o} canManage={canManage} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="العناصر المتزامنة" value={formatNumber(data.itemsTotal)} icon={Layers} hint={`${data.sources.length} قاعدة بيانات`} />
        <StatCard label="مراحل مكتملة" value={formatNumber(data.byStatus.COMPLETED ?? 0)} icon={CheckCircle2} tone="success" />
        <StatCard label="بانتظار الاعتماد" value={formatNumber(data.byStatus.PENDING_APPROVAL ?? 0)} icon={Hourglass} tone="pending" />
        <StatCard label="تحتاج تحسين" value={formatNumber(data.byStatus.NEEDS_REVISION ?? 0)} icon={RotateCcw} tone={data.byStatus.NEEDS_REVISION ? "warning" : "neutral"} />
        <StatCard
          label="قيم غير مربوطة"
          value={formatNumber(data.unmappedTotal)}
          icon={AlertTriangle}
          tone={data.unmappedTotal ? "danger" : "neutral"}
          href={canManage && data.unmapped[0] ? `/notion/mappings?ds=${data.unmapped[0].dataSourceId}` : undefined}
          hint={data.unmappedTotal ? "تُعامل كـ «لم يبدأ» حتى تُربط" : "جميع القيم مربوطة"}
        />
      </div>

      {data.unmapped.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4.5 text-warning" /> قيم Notion بدون ربط بحالة النظام
            </CardTitle>
            <CardDescription>ظهرت هذه القيم في العناصر المتزامنة ولا يوجد لها ربط. اربطها ليُحتسب الإنجاز بدقة — لا حاجة لإعادة المزامنة بعد الربط.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.unmapped.map((u) => {
                const chip = (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning-soft/50 px-2.5 py-1 text-xs">
                    <span className="text-muted-foreground">
                      {u.dataSourceName} · {u.stageLabel}:
                    </span>
                    <span className="font-medium">{u.value}</span>
                    <span className="rounded bg-background px-1 tabular-nums text-muted-foreground">{formatNumber(u.count)}</span>
                  </span>
                );
                const key = `${u.dataSourceId}:${u.stageKey}:${u.value}`;
                return canManage ? (
                  <Link key={key} href={`/notion/mappings?ds=${u.dataSourceId}#stage-${u.stageKey}`} className="hover:opacity-80">
                    {chip}
                  </Link>
                ) : (
                  <span key={key}>{chip}</span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">قواعد البيانات المربوطة</h2>
        {data.sources.length === 0 ? (
          <EmptyState
            icon={Database}
            title="لم تُربط أي قاعدة بيانات بعد"
            description="اربط Notion واختر القاعدة من القائمة — يقترح النظام ربط الحقول والحالات تلقائيًا."
            action={
              canManage ? (
                <Button size="sm" asChild>
                  <Link href="/notion/connect">
                    <Link2 /> {data.connectionsCount === 0 ? "ربط Notion" : "ربط قاعدة بيانات"}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.sources.map((s) => (
              <Card key={s.id} className="gap-3">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{s.name}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {DATA_SOURCE_PURPOSES[s.purpose] ?? s.purpose} · {s.connectionName}
                      </CardDescription>
                    </div>
                    {!s.isActive ? (
                      <StatusBadge tone="blocked">معطلة</StatusBadge>
                    ) : s.lastLog ? (
                      <EnumBadge map={SYNC_STATUS_LABELS} value={s.lastLog.status} />
                    ) : (
                      <StatusBadge tone="neutral">لم تُزامن</StatusBadge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="divide-y rounded-lg border px-3">
                    <KeyValue label="العناصر">{formatNumber(s.itemsCount)}</KeyValue>
                    <KeyValue label="مراحل العمل المربوطة">
                      {s.stagesCount ? formatNumber(s.stagesCount) : <span className="text-warning">لا توجد</span>}
                    </KeyValue>
                    <KeyValue label="آخر مزامنة">{s.lastSyncedAt ? formatDateTimeAr(s.lastSyncedAt) : "—"}</KeyValue>
                    <KeyValue label="المزامنة التلقائية">{s.syncEnabled ? `كل ${formatNumber(s.syncIntervalMinutes)} دقيقة` : "متوقفة"}</KeyValue>
                  </div>
                  {s.lastLog && s.lastLog.errorCount > 0 && (
                    <p className="rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">آخر مزامنة سجلت {formatNumber(s.lastLog.errorCount)} خطأ — راجع سجل المزامنة.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canSync && (
                      <>
                        <SyncNowButton dataSourceId={s.id} disabled={!s.isActive || !s.connectionActive} />
                        <FullSyncButton dataSourceId={s.id} disabled={!s.isActive || !s.connectionActive} />
                      </>
                    )}
                    {canManage && (
                      <Button variant="ghost" size="sm" className="ms-auto" asChild>
                        <Link href={`/notion/mappings?ds=${s.id}`}>
                          <ListChecks /> الربط
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">مراحل العمل حسب الحالة</CardTitle>
            <CardDescription>مجموع حالات مراحل جميع العناصر غير المؤرشفة</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(data.byStatus).length === 0 ? (
              <EmptyState icon={Layers} title="لا توجد بيانات بعد" description="تظهر هنا الإحصاءات بعد أول مزامنة ناجحة." className="py-6" />
            ) : (
              <ul className="space-y-2">
                {SYSTEM_STATUSES.filter((s) => (data.byStatus[s] ?? 0) > 0).map((s) => (
                  <li key={s} className="flex items-center justify-between gap-2">
                    <EnumBadge map={NOTION_STATUS_LABELS} value={s} />
                    <span className="text-sm font-semibold tabular-nums">{formatNumber(data.byStatus[s] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">آخر عمليات المزامنة</CardTitle>
              <CardDescription>آخر 5 عمليات على جميع القواعد</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/notion/sync-logs">
                السجل الكامل <ArrowLeft />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentLogs.length === 0 ? (
              <EmptyState icon={History} title="لا توجد عمليات مزامنة بعد" className="py-6" />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-start">القاعدة</TableHead>
                      <TableHead className="text-start">النوع</TableHead>
                      <TableHead className="text-start">الحالة</TableHead>
                      <TableHead className="text-start">البدء</TableHead>
                      <TableHead className="text-start">فُحص / جديد / محدّث</TableHead>
                      <TableHead className="text-start">أخطاء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentLogs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.dataSourceName}</TableCell>
                        <TableCell className="text-xs">{SYNC_TRIGGER_LABELS[l.trigger]}</TableCell>
                        <TableCell>
                          <EnumBadge map={SYNC_STATUS_LABELS} value={l.status} />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateTimeAr(l.startTime)}</TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {formatNumber(l.recordsScanned)} / {formatNumber(l.recordsCreated)} / {formatNumber(l.recordsUpdated)}
                        </TableCell>
                        <TableCell className={l.errorCount ? "text-danger" : "text-muted-foreground"}>{formatNumber(l.errorCount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
