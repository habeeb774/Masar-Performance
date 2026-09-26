import type { Metadata } from "next";
import type { SearchParams } from "@/lib/params";
import { pageParams, str } from "@/lib/params";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { REPORT_STATUSES, REPORT_STATUS_LABELS } from "@/lib/labels";
import { listMonthlyReports, recentMonthOptions, scopeEmployeeOptions } from "@/server/queries/reports";
import { PageHeader } from "@/components/shared/page";
import { FilterBar, Pager, SelectFilter } from "@/components/shared/url-filters";
import Link from "next/link";
import { ReportListTable } from "@/features/reports/report-list-table";

export const metadata: Metadata = { title: "التقارير الشهرية" };

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.REPORTS_REVIEW);
  const sp = await searchParams;
  const rawStatus = str(sp.status);
  const status = rawStatus && (REPORT_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : undefined;
  const employeeId = str(sp.employee);
  const month = str(sp.month);
  const { page, pageSize, skip, take } = pageParams(sp, 20);
  const [list, employees, months] = await Promise.all([
    listMonthlyReports(user, { status, employeeId, month, skip, take }),
    scopeEmployeeOptions(user),
    recentMonthOptions(12),
  ]);

  return (
    <>
      <PageHeader title="التقارير الشهرية" description="التقارير الشهرية للفريق: الإنجاز الموزون، جودة Notion، والتكليفات." />
      <nav className="mb-4 flex w-full gap-1 rounded-lg bg-muted p-1 sm:w-fit" aria-label="نوع التقرير">
        <Link href="/reports/weekly" className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          الأسبوعية
        </Link>
        <Link href="/reports/monthly" className="rounded-md px-3 py-1.5 text-sm font-medium bg-background shadow-sm">
          الشهرية
        </Link>
      </nav>
      <FilterBar>
        <SelectFilter param="status" placeholder="الحالة" allLabel="كل الحالات" options={REPORT_STATUSES.map((s) => ({ value: s, label: REPORT_STATUS_LABELS[s].label }))} />
        <SelectFilter param="employee" placeholder="الموظف" allLabel="كل الموظفين" options={employees} />
        <SelectFilter param="month" placeholder="الشهر" allLabel="كل الشهور" options={months} />
      </FilterBar>
      <ReportListTable rows={list.rows} emptyTitle={status || employeeId || month ? "لا توجد تقارير مطابقة للفلترة" : "لا توجد تقارير بعد"} />
      <Pager page={page} pageSize={pageSize} total={list.total} />
    </>
  );
}
