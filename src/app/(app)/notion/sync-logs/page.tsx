import type { Metadata } from "next";
import type { SearchParams } from "@/lib/params";
import { pageParams, str } from "@/lib/params";
import type { SyncStatus } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/session";
import { dataSourceOptions, listSyncLogs } from "@/server/queries/notion";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { SYNC_STATUS_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/shared/page";
import { FilterBar, Pager, SelectFilter } from "@/components/shared/url-filters";
import { SyncLogsTable } from "@/features/notion/sync-logs-table";

export const metadata: Metadata = { title: "سجل مزامنة Notion" };

const STATUSES = Object.keys(SYNC_STATUS_LABELS) as SyncStatus[];

export default async function NotionSyncLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.NOTION_MANAGE, PERMISSIONS.NOTION_SYNC);
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const ds = str(sp.ds);
  const statusParam = str(sp.status);
  const status = STATUSES.includes(statusParam as SyncStatus) ? (statusParam as SyncStatus) : undefined;

  const [options, { total, rows }] = await Promise.all([dataSourceOptions(), listSyncLogs({ dataSourceId: ds, status }, skip, take)]);

  return (
    <>
      <PageHeader title="سجل مزامنة Notion" description="كل عملية مزامنة يدوية أو مجدولة مع عدد السجلات المفحوصة والأخطاء. يمكن إعادة محاولة العمليات الفاشلة أو الجزئية." />
      <FilterBar>
        <SelectFilter param="ds" placeholder="قاعدة البيانات" allLabel="كل القواعد" options={options} className="sm:w-56" />
        <SelectFilter param="status" placeholder="الحالة" allLabel="كل الحالات" options={STATUSES.map((s) => ({ value: s, label: SYNC_STATUS_LABELS[s].label }))} />
      </FilterBar>
      <SyncLogsTable rows={rows} canRetry={hasPermission(user, PERMISSIONS.NOTION_SYNC)} filtered={!!ds || !!status} />
      <Pager page={page} pageSize={pageSize} total={total} />
    </>
  );
}
