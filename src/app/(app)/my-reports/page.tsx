import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CalendarRange, UserX } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { int, pageParams } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { currentYearMonth, formatDateAr, monthLabel } from "@/lib/dates";
import { PLAN_STATUS_LABELS, REPORT_STATUS_LABELS } from "@/lib/labels";
import { getCompany } from "@/server/services/company";
import { getMyReportContext, listMonthlyReports, listWeeklyReports } from "@/server/queries/reports";
import { EmptyState, PageHeader, SectionTitle } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { MonthPicker, Pager } from "@/components/shared/url-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportListTable } from "@/features/reports/report-list-table";
import { GenerateReportButton } from "@/features/reports/generate-report-button";

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
  const sp = await searchParams;
  const company = await getCompany();
  const now = currentYearMonth(company.timezone);
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);
  const { page, pageSize, skip, take } = pageParams(sp, 10);

  const [ctx, weekly, monthly] = await Promise.all([
    getMyReportContext(user, year, month),
    listWeeklyReports(user, { skip, take }, true),
    listMonthlyReports(user, { skip: 0, take: 24 }, true),
  ]);
  const cw = ctx.currentWeek;

  return (
    <>
      <PageHeader title="تقاريري" description="راجع تقاريرك الأسبوعية والشهرية المولدة آليًا، أضف ملاحظاتك وأرسلها للمدير." />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" /> تقرير الأسبوع الحالي
            </CardTitle>
            <CardDescription>
              {cw ? `الأسبوع ${cw.weekIndex}: ${formatDateAr(cw.start)} – ${formatDateAr(cw.end)}` : "لا توجد خطة أسبوعية تشمل اليوم."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {!cw ? (
              <p className="text-xs text-muted-foreground">تتولد الأسابيع تلقائيًا بعد اعتماد خطة الشهر من المدير.</p>
            ) : cw.report ? (
              <>
                <EnumBadge map={REPORT_STATUS_LABELS} value={cw.report.status} />
                <Button asChild>
                  <Link href={`/reports/weekly/${cw.report.id}`}>
                    فتح التقرير <ArrowLeft />
                  </Link>
                </Button>
              </>
            ) : (
              <GenerateReportButton kind="weekly" sourceId={cw.id} label="توليد تقرير الأسبوع" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="size-4 text-primary" /> تقرير شهر {monthLabel(year, month)}
              </CardTitle>
              <CardDescription>
                {ctx.plan ? (
                  <>
                    الخطة: <EnumBadge map={PLAN_STATUS_LABELS} value={ctx.plan.status} />
                  </>
                ) : (
                  "لا توجد خطة شهرية لهذا الشهر."
                )}
              </CardDescription>
            </div>
            <MonthPicker year={year} month={month} />
          </CardHeader>
          <CardContent className="space-y-3">
            {ctx.plan && (
              <div className="flex flex-wrap items-center gap-2">
                {ctx.plan.report ? (
                  <>
                    <EnumBadge map={REPORT_STATUS_LABELS} value={ctx.plan.report.status} />
                    <Button asChild>
                      <Link href={`/reports/monthly/${ctx.plan.report.id}`}>
                        فتح التقرير الشهري <ArrowLeft />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <GenerateReportButton kind="monthly" sourceId={ctx.plan.id} label="توليد التقرير الشهري" />
                )}
              </div>
            )}
            {ctx.plan && ctx.plan.weeks.length > 0 && (
              <div className="divide-y rounded-lg border">
                {ctx.plan.weeks.map((w) => (
                  <div key={w.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-medium">الأسبوع {w.weekIndex}</span>
                      <span className="ms-2 text-xs text-muted-foreground">
                        {formatDateAr(w.start)} – {formatDateAr(w.end)}
                      </span>
                    </div>
                    {w.report ? (
                      <div className="flex items-center gap-2">
                        <EnumBadge map={REPORT_STATUS_LABELS} value={w.report.status} />
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/reports/weekly/${w.report.id}`}>
                            فتح <ArrowLeft />
                          </Link>
                        </Button>
                      </div>
                    ) : w.start <= ctx.today ? (
                      <GenerateReportButton kind="weekly" sourceId={w.id} label="توليد" size="sm" variant="outline" />
                    ) : (
                      <span className="text-xs text-muted-foreground">لم يبدأ</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mb-8">
        <SectionTitle>التقارير الأسبوعية</SectionTitle>
        <ReportListTable rows={weekly.rows} showEmployee={false} emptyTitle="لا توجد تقارير أسبوعية بعد" />
        <Pager page={page} pageSize={pageSize} total={weekly.total} />
      </section>

      <section>
        <SectionTitle>التقارير الشهرية</SectionTitle>
        <ReportListTable rows={monthly.rows} showEmployee={false} emptyTitle="لا توجد تقارير شهرية بعد" />
      </section>
    </>
  );
}
