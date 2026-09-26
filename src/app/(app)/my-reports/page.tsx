import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, FileCheck2, MessageSquareWarning, UserX } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { pageParams } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { currentYearMonth, formatDateAr } from "@/lib/dates";
import { REPORT_STATUS_LABELS } from "@/lib/labels";
import { getCompany } from "@/server/services/company";
import { ensureDueReports } from "@/server/services/reports";
import { getMyPendingReports, getMyReportContext, listMonthlyReports, listWeeklyReports, type MyPendingReport } from "@/server/queries/reports";
import { EmptyState, PageHeader, SectionTitle } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Pager } from "@/components/shared/url-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReportListTable } from "@/features/reports/report-list-table";

export const metadata: Metadata = { title: "تقاريري" };

export default async function MyReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (!user.employeeId) {
    return (
      <>
        <PageHeader title="تقاريري" />
        <EmptyState icon={UserX} title="حسابك غير مرتبط بملف موظف" description="اطلب من مدير النظام ربط حسابك بملف موظف لعرض تقاريرك." />
      </>
    );
  }
  const employeeId = user.employeeId;
  const sp = await searchParams;
  const company = await getCompany();
  const now = currentYearMonth(company.timezone);
  const { page, pageSize, skip, take } = pageParams(sp, 10);

  await ensureDueReports({ employeeIds: [employeeId], limit: 6 }).catch((e) => console.error("[my-reports] auto generation failed", e));

  const [pending, ctx, weekly, monthly] = await Promise.all([
    getMyPendingReports(employeeId),
    getMyReportContext(user, now.year, now.month),
    listWeeklyReports(user, { skip, take }, true),
    listMonthlyReports(user, { skip: 0, take: 24 }, true),
  ]);
  const [next, ...others] = pending;
  const cw = ctx.currentWeek;
  const upcoming = cw
    ? `الأسبوع الحالي ينتهي ${formatDateAr(cw.end)} — يُنشأ تقريره تلقائيًا بعد انتهائه.`
    : "يُنشأ تقرير الأسبوع تلقائيًا عند انتهائه، والتقرير الشهري في آخر يوم من الشهر.";

  return (
    <>
      <PageHeader title="تقاريري" description="تقاريرك تُعدّ تلقائيًا من عملك في النظام. راجع المسودة، أضف ملاحظة إن أردت، ثم أرسلها." />

      <section className="mb-8">
        {next ? (
          <div className="space-y-3">
            <NextReportCard report={next} />
            {others.length > 0 && (
              <div className="divide-y rounded-lg border bg-card">
                {others.map((r) => (
                  <div key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0 text-sm">
                      <span className="font-medium">{r.title}</span>
                      {r.kind === "weekly" && <span className="ms-2 text-xs text-muted-foreground">{r.period}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <EnumBadge map={REPORT_STATUS_LABELS} value={r.status} />
                      <Button size="sm" variant="outline" asChild>
                        <Link href={r.href}>
                          مراجعة وإرسال <ArrowLeft />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" /> {upcoming}
            </p>
          </div>
        ) : (
          <EmptyState
            icon={weekly.total + monthly.total > 0 ? FileCheck2 : CalendarClock}
            title={weekly.total + monthly.total > 0 ? "لا يوجد تقرير بانتظارك" : "لا توجد تقارير بعد"}
            description={upcoming}
          />
        )}
      </section>

      <section className="mb-8">
        <SectionTitle>التقارير الأسبوعية</SectionTitle>
        <ReportListTable rows={weekly.rows} showEmployee={false} emptyTitle="يُنشأ تقرير الأسبوع تلقائيًا عند انتهائه" />
        <Pager page={page} pageSize={pageSize} total={weekly.total} />
      </section>

      <section>
        <SectionTitle>التقارير الشهرية</SectionTitle>
        <ReportListTable rows={monthly.rows} showEmployee={false} emptyTitle="يُنشأ التقرير الشهري تلقائيًا في آخر يوم من الشهر" />
      </section>
    </>
  );
}

function NextReportCard({ report }: { report: MyPendingReport }) {
  const returned = report.status === "RETURNED";
  return (
    <Card className={returned ? "border-warning/50" : "border-primary/30"}>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{report.title}</h2>
            <EnumBadge map={REPORT_STATUS_LABELS} value={report.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {returned ? "أعاده المدير بملاحظة — عدّل ثم أعد الإرسال." : `جاهز للمراجعة${report.kind === "weekly" ? ` · ${report.period}` : ""}`}
          </p>
          {report.managerComment && (
            <p className="flex items-start gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
              <MessageSquareWarning className="mt-0.5 size-4 shrink-0" />
              <span className="whitespace-pre-line">{report.managerComment}</span>
            </p>
          )}
          {report.progress !== null && <ProgressBar value={report.progress} showLabel size="sm" className="max-w-xs" />}
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link href={report.href}>
            مراجعة وإرسال <ArrowLeft />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
