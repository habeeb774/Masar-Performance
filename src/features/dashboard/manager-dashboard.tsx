import Link from "next/link";
import { AlarmClock, ArrowLeft, ClipboardCheck, FileClock, Hourglass, RotateCcw, TrendingDown, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StatCard } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { GroupedBarChart, PercentBars, StageStatusChart, TrendChart } from "@/components/charts/charts";
import type { getManagerDashboard } from "@/server/queries/dashboard";
import { formatDayAr, monthLabel } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { PLAN_STATUS_LABELS } from "@/lib/labels";

type Data = Awaited<ReturnType<typeof getManagerDashboard>>;

export function ManagerDashboard({ name, data }: { name: string; data: Data }) {
  const { stats } = data;
  const stageRows = Object.values(
    data.stages.reduce<Record<string, { label: string; [k: string]: string | number }>>((acc, s) => {
      const key = s.stageKey;
      acc[key] ??= { label: s.label };
      const bucket = s.status === "IN_PROGRESS_AFTER_REVISION" ? "IN_PROGRESS" : s.status;
      acc[key][bucket] = (Number(acc[key][bucket]) || 0) + s.count;
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">السلام عليكم، {name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDayAr(data.today)} — متابعة فريق المتجر لشهر {monthLabel(data.year, data.month)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/review-center">
              <ClipboardCheck /> مركز المراجعة
            </Link>
          </Button>
          <Button asChild>
            <Link href="/tasks?new=1">+ تكليف جديد</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="إجمالي الموظفين" value={formatNumber(stats.employees)} icon={Users} hint={stats.withoutPlan ? `${stats.withoutPlan} بدون خطة` : "جميعهم لديهم خطط"} href="/employees" />
        <StatCard label="متوسط إنجاز الفريق" value={formatPct(stats.avgMonthly)} icon={ClipboardCheck} tone="info" footer={<ProgressBar value={stats.avgMonthly} size="sm" />} />
        <StatCard label="المهام المتأخرة" value={formatNumber(stats.delayed)} icon={AlarmClock} tone={stats.delayed ? "danger" : "neutral"} href="/tasks?status=DELAYED" />
        <StatCard label="تقارير بانتظار الاعتماد" value={formatNumber(stats.reportsPending)} icon={FileClock} tone="pending" href="/review-center" hint={stats.plansPending ? `+ ${stats.plansPending} خطة` : undefined} />
        <StatCard label="منتجات بانتظار الاعتماد" value={formatNumber(stats.pendingApproval)} icon={Hourglass} tone="pending" href="/review-center?tab=pending" />
        <StatCard label="عناصر تحتاج تحسين" value={formatNumber(stats.needsRevision)} icon={RotateCcw} tone={stats.needsRevision ? "warning" : "neutral"} href="/review-center?tab=revision" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">أداء الموظفين</CardTitle>
            <CardDescription>الإنتاجية والجودة محسوبة من الأهداف وبيانات Notion المتزامنة</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/employees">
              الموظفون <ArrowLeft />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState icon={Users} title="لا يوجد موظفون" description="أضف الموظفين وحدد مسمياتهم الوظيفية من صفحة الموظفين." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-start">الموظف</TableHead>
                    <TableHead className="text-start">الوظيفة</TableHead>
                    <TableHead className="min-w-36 text-start">الشهر</TableHead>
                    <TableHead className="min-w-36 text-start">الأسبوع</TableHead>
                    <TableHead className="text-start">الجودة</TableHead>
                    <TableHead className="text-start">متأخرة</TableHead>
                    <TableHead className="text-start">بانتظار الاعتماد</TableHead>
                    <TableHead className="text-start">تحتاج تحسين</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/employees/${r.id}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        <div className="mt-0.5">{r.planStatus ? <EnumBadge map={PLAN_STATUS_LABELS} value={r.planStatus} /> : <StatusBadge tone="warning">بدون خطة</StatusBadge>}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.role}</TableCell>
                      <TableCell>
                        <ProgressBar value={r.monthly} showLabel size="sm" />
                      </TableCell>
                      <TableCell>
                        <ProgressBar value={r.weekly} showLabel size="sm" />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatPct(r.quality)}</TableCell>
                      <TableCell>{r.delayed ? <StatusBadge tone="danger">{r.delayed}</StatusBadge> : <span className="text-muted-foreground">0</span>}</TableCell>
                      <TableCell className="tabular-nums">{r.pendingApproval}</TableCell>
                      <TableCell>{r.needsRevision ? <StatusBadge tone="warning">{r.needsRevision}</StatusBadge> : <span className="text-muted-foreground">0</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">اتجاه الإنجاز الشهري</CardTitle>
            <CardDescription>متوسط نتائج التقييم لآخر 6 أشهر (الشهر الحالي من الإنجاز الحي)</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={data.trend}
              series={[
                { key: "productivity", label: "الإنتاجية" },
                { key: "quality", label: "الجودة" },
                { key: "score", label: "النتيجة النهائية" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الإنتاجية مقابل الجودة</CardTitle>
            <CardDescription>إنجاز الشهر ونسبة الاعتماد لكل موظف</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupedBarChart
              data={data.rows.map((r) => ({ name: r.name, productivity: r.monthly, quality: r.quality }))}
              series={[
                { key: "productivity", label: "الإنتاجية %" },
                { key: "quality", label: "الجودة %" },
              ]}
              max={100}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">حالات سير العمل في Notion</CardTitle>
            <CardDescription>توزيع العناصر المتزامنة حسب المرحلة والحالة</CardDescription>
          </CardHeader>
          <CardContent>
            <StageStatusChart data={stageRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="size-4 text-danger" /> الأقل التزامًا بالخطة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.lowestCommitment.length === 0 ? (
              <EmptyState title="لا توجد خطط نشطة" className="py-6" />
            ) : (
              data.lowestCommitment.map((r) => (
                <Link key={r.id} href={`/employees/${r.id}`} className="block rounded-lg border p-3 hover:bg-muted/50">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.role}</span>
                  </div>
                  <ProgressBar value={r.monthly} showLabel size="sm" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تقدم أهداف الشهر (مجمعة للفريق)</CardTitle>
        </CardHeader>
        <CardContent>
          <PercentBars data={data.goalProgress.map((g) => ({ name: g.name, pct: g.pct }))} />
        </CardContent>
      </Card>
    </div>
  );
}
