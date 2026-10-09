import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, ArrowLeft, ClipboardList, Gauge, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { MonthPicker } from "@/components/shared/url-filters";
import { ExportExcelButton } from "@/features/performance/export-excel-button";
import { exportFileName } from "@/lib/performance-export";
import { GroupedBarChart, PercentBars, StageStatusChart, TrendChart } from "@/components/charts/charts";
import type { SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { PERMISSIONS } from "@/lib/permissions";
import { fromDateKey, monthLabel } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { employeeWhere, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { currentMonth, getPerformanceAnalytics } from "@/server/queries/performance";

export const metadata: Metadata = { title: "تحليلات الأداء" };

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function PerformanceAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.PERFORMANCE_REVIEW);
  const sp = await searchParams;
  const now = await currentMonth();
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);
  const data = await getPerformanceAnalytics(user, year, month);
  const { stats } = data;
  const emp = data.employees;
  // what the manager most likely wants to do now, read from the team's state — not from the charts
  const scope = employeeWhere(user);
  const todayDate = fromDateKey(now.today);
  const [dueEvaluations, approvedEvaluations] = await Promise.all([
    db.performanceEvaluation.count({ where: { ...scope, year, month, status: "DRAFT", periodEnd: { lte: todayDate } } }),
    db.performanceEvaluation.count({ where: { ...scope, year, month, status: "APPROVED" } }),
  ]);
  const withoutPlan = Math.max(0, stats.employees - stats.withPlan);
  const maxDelayed = Math.max(5, ...emp.map((e) => e.delayed));
  const maxRevision = Math.max(20, ...emp.map((e) => e.revisionRate ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحليلات الأداء"
        description={`مؤشرات إنتاجية وجودة الفريق لشهر ${monthLabel(year, month)} — محسوبة من الخطط والمهام وبيانات Notion`}
        actions={
          <>
            <MonthPicker year={year} month={month} />
            {emp.length > 0 && (
              <ExportExcelButton
                href={`/api/export/performance/all?year=${year}&month=${month}`}
                label="تصدير جميع الموظفين"
                fallbackName={`مؤشرات-أداء-الفريق-${year}-${month}.zip`}
                size="default"
              />
            )}
            <Button asChild>
              <Link href={`/performance/evaluations?year=${year}&month=${month}`}>
                التقييمات الشهرية <ArrowLeft />
              </Link>
            </Button>
          </>
        }
      />

      {(dueEvaluations > 0 || withoutPlan > 0 || approvedEvaluations > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ما يحتاجه منك الآن</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {dueEvaluations > 0 && (
              <Button asChild>
                <Link href="/review-center?tab=evaluations">
                  اعتمد {formatNumber(dueEvaluations)} {dueEvaluations === 1 ? "تقييمًا" : "تقييمات"} <ArrowLeft />
                </Link>
              </Button>
            )}
            {withoutPlan > 0 && (
              <Button variant="outline" asChild>
                <Link href={`/monthly-plans?year=${year}&month=${month}`}>
                  أعدّ خطة لـ {formatNumber(withoutPlan)} {withoutPlan === 1 ? "موظف" : "موظفين"} <ArrowLeft />
                </Link>
              </Button>
            )}
            {approvedEvaluations > 0 && (
              <ExportExcelButton
                href={`/api/export/performance/all?year=${year}&month=${month}`}
                label="صدّر للموارد البشرية"
                fallbackName={`مؤشرات-أداء-الفريق-${year}-${month}.zip`}
                size="default"
              />
            )}
          </CardContent>
        </Card>
      )}

      {emp.length === 0 ? (
        <EmptyState icon={Users} title="لا يوجد موظفون في نطاقك" description="أضف الموظفين وحدد مسمياتهم الوظيفية لعرض التحليلات." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="الموظفون" value={formatNumber(stats.employees)} icon={Users} hint={`${stats.withPlan} لديهم خطة لهذا الشهر`} />
            <StatCard label="متوسط الإنتاجية" value={formatPct(stats.avgProductivity)} icon={Gauge} tone="info" />
            <StatCard label="متوسط الجودة" value={formatPct(stats.avgQuality)} icon={ShieldCheck} tone="success" />
            <StatCard
              label="متوسط النتيجة النهائية"
              value={stats.avgFinal === null ? "—" : formatNumber(stats.avgFinal, 1)}
              icon={Sparkles}
              tone="primary"
              hint={`${stats.reviews} تقييم محسوب`}
              href={`/performance/reviews?year=${year}&month=${month}`}
            />
            <StatCard label="المهام المتأخرة" value={formatNumber(stats.delayed)} icon={AlarmClock} tone={stats.delayed ? "danger" : "neutral"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="اتجاه الإنجاز الشهري" description="متوسط إنجاز الخطط والجودة والنتيجة النهائية لآخر 6 أشهر">
              <TrendChart
                data={data.trend}
                series={[
                  { key: "achievement", label: "الإنجاز" },
                  { key: "quality", label: "الجودة" },
                  { key: "score", label: "النتيجة النهائية" },
                ]}
              />
            </ChartCard>
            <ChartCard title="الإنتاجية مقابل الجودة" description="التقدم الموزون للأهداف ودرجة الجودة (أو نسبة الاعتماد) لكل موظف">
              <GroupedBarChart
                data={emp.map((e) => ({ name: e.name, productivity: e.productivity, quality: e.quality }))}
                series={[
                  { key: "productivity", label: "الإنتاجية %" },
                  { key: "quality", label: "الجودة %" },
                ]}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="إنجاز الأهداف" description="متوسط نسبة إنجاز كل هدف عبر الفريق لهذا الشهر">
              <PercentBars data={data.goalCompletion} />
            </ChartCard>
            <ChartCard title="أداء الموظفين" description="النتيجة الآلية والنهائية من تقييم الشهر">
              <GroupedBarChart
                data={emp.filter((e) => e.finalScore !== null).map((e) => ({ name: e.name, autoScore: e.autoScore, finalScore: e.finalScore }))}
                series={[
                  { key: "autoScore", label: "النتيجة الآلية" },
                  { key: "finalScore", label: "النتيجة النهائية" },
                ]}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="المهام المتأخرة" description="المهام اليومية والتكليفات المتأخرة لكل موظف خلال الشهر">
              <GroupedBarChart
                data={emp.map((e) => ({ name: e.name, delayed: e.delayed }))}
                series={[{ key: "delayed", label: "مهام متأخرة" }]}
                max={maxDelayed}
              />
            </ChartCard>
            <ChartCard title="نسبة إعادة العمل" description="العناصر التي أعيدت للتحسين ÷ إجمالي ما تم العمل عليه (من Notion)">
              <GroupedBarChart
                data={emp.filter((e) => e.revisionRate !== null).map((e) => ({ name: e.name, revisionRate: e.revisionRate }))}
                series={[{ key: "revisionRate", label: "نسبة إعادة العمل %" }]}
                max={Math.ceil(maxRevision)}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="حالات سير العمل في Notion" description="الحالة الحالية للعناصر المتزامنة حسب المرحلة">
              <StageStatusChart data={data.stageRows} />
            </ChartCard>
            <ChartCard
              title="التقدم الأسبوعي"
              description={
                data.weeklySeries.length === 1 && data.weeklySeries[0].key === "avg"
                  ? "متوسط التقدم الموزون للفريق في كل أسبوع من الشهر"
                  : "التقدم الموزون لكل موظف في كل أسبوع من الشهر"
              }
            >
              <TrendChart data={data.weekly} series={data.weeklySeries} />
            </ChartCard>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="size-4 text-muted-foreground" /> ملخص الموظفين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {emp.map((e) => (
                  <div key={e.id} className="flex flex-col rounded-lg border text-sm">
                    <Link href={`/employees/${e.id}`} className="flex-1 rounded-t-lg p-3 hover:bg-muted/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{e.name}</span>
                        <span className="text-xs text-muted-foreground">{e.jobTitle}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">الإنتاجية</p>
                          <p className="font-semibold tabular-nums">{formatPct(e.productivity)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">الجودة</p>
                          <p className="font-semibold tabular-nums">{formatPct(e.quality)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">النهائية</p>
                          <p className="font-semibold tabular-nums">{e.finalScore === null ? "—" : formatNumber(e.finalScore, 1)}</p>
                        </div>
                      </div>
                    </Link>
                    <div className="flex justify-end border-t px-2 py-1.5">
                      <ExportExcelButton
                        href={`/api/export/performance?employee=${e.id}&year=${year}&month=${month}`}
                        label="تصدير Excel للموارد البشرية"
                        fallbackName={exportFileName(e.name, year, month)}
                        variant="ghost"
                        size="xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
