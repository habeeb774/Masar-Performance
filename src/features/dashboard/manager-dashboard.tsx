import Link from "next/link";
import {
  AlarmClock,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileClock,
  Hourglass,
  Lock,
  RotateCcw,
  TrendingDown,
  Users, BellRing } from "lucide-react";
import { PackageSearch, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BatchCard } from "@/features/notion/batch-card";
import type { getTeamBatchOverview } from "@/server/queries/batches";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StatCard } from "@/components/shared/page";
import { EnumBadge, StatusBadge, toneClasses } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/shared/progress-bar";
import { GroupedBarChart, PercentBars, StageStatusChart, TrendChart } from "@/components/charts/charts";
import type { getManagerDashboard } from "@/server/queries/dashboard";
import { formatDateAr, formatDayAr, monthLabel } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { PLAN_STATUS_LABELS } from "@/lib/labels";

type Data = Awaited<ReturnType<typeof getManagerDashboard>>;
type AttentionItem = Data["attention"]["items"][number];

const ATTENTION_ICONS: Record<AttentionItem["type"], LucideIcon> = {
  OVERDUE_EMPLOYEE: AlarmClock,
  GOAL_AT_RISK: TrendingDown,
  TASK_BLOCKED: Lock,
  WEEKLY_REPORT_MISSING: FileClock,
  PENDING_APPROVAL: Hourglass,
  BATCH_BOTTLENECK: PackageSearch,
  MANUAL_OVERRIDE: PenLine,
};

export function ManagerDashboard({
  name,
  data,
  batches = [],
  dueReminders = 0,
}: {
  name: string;
  data: Data;
  batches?: Awaited<ReturnType<typeof getTeamBatchOverview>>;
  dueReminders?: number;
}) {
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
        <div className="flex flex-wrap gap-2">
          {dueReminders > 0 && (
            <Button variant="ghost" asChild>
              <Link href="/reminders">
                <BellRing className="text-primary" /> {formatNumber(dueReminders)} تذكيرات حان موعدها
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/review-center">
              <ClipboardCheck /> بانتظارك
            </Link>
          </Button>
          <Button asChild>
            <Link href="/tasks?new=1">+ تكليف جديد</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">يحتاج تدخلك</CardTitle>
            <CardDescription>مرتّب حسب الأولوية</CardDescription>
          </div>
          {data.attention.total > data.attention.items.length && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/review-center">
                عرض الكل <ArrowLeft />
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {data.attention.items.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="لا يوجد ما يحتاج انتباهك الآن" description="كل شيء يسير على المسار الصحيح — استمر في المتابعة." className="py-8" />
          ) : (
            <ul className="space-y-2">
              {data.attention.items.map((it) => {
                const Icon = ATTENTION_ICONS[it.type];
                return (
                  <li key={it.id}>
                    <Link
                      href={it.href}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-[transform,box-shadow,background-color] duration-200 [transition-timing-function:var(--ease-soft)] hover:-translate-y-0.5 hover:bg-accent/30 hover:shadow-[var(--shadow-raised-hover)]"
                    >
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-inset", toneClasses[it.tone])}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{it.text}</span>
                      <ArrowLeft className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {batches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">الدفعة الحالية</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {batches.map((b) => (
              <BatchCard key={"manualId" in b.batch && b.batch.manualId ? b.batch.manualId : `n-${b.batch.key}`} batch={b.batch} pace={b.pace} subtitle={`الأسبوع ${formatDateAr(b.week.start)}–${formatDateAr(b.week.end)}`}>
                {!("manualId" in b.batch && b.batch.manualId) && b.batch.images.waiting + b.batch.images.edited > 0 && (
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/review-center?tab=batches">
                        مراجعة <ArrowLeft />
                      </Link>
                    </Button>
                  </div>
                )}
              </BatchCard>
            ))}
          </div>
        </section>
      )}

      {stats.withoutPlan > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft/30 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            {formatNumber(stats.withoutPlan)} من موظفيك بدون خطة لشهر {monthLabel(data.year, data.month)}
          </p>
          <Button size="sm" asChild>
            <Link href="/monthly-plans">إعداد خطة الفريق</Link>
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">الفريق هذا الشهر</CardTitle>
            <CardDescription>متوسط الإنجاز {formatPct(stats.avgMonthly)}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/monthly-plans">
              خطة الفريق <ArrowLeft />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="ابدأ بإضافة موظفيك"
              description="بعدها أعد خطة كل موظف بخطوة واحدة من «خطة الفريق»."
              action={
                <Button size="sm" asChild>
                  <Link href="/employees">الموظفون</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {data.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/employees/${r.id}`} className="flex items-center gap-3 py-2.5 hover:bg-accent/30">
                    <span className="w-36 truncate text-sm font-medium sm:w-48">{r.name}</span>
                    {r.planStatus ? (
                      <>
                        <ProgressBar value={r.monthly} size="sm" className="flex-1" />
                        <span className="w-10 text-end text-xs font-medium tabular-nums">{Math.round(r.monthly)}%</span>
                      </>
                    ) : (
                      <span className="flex-1 text-xs text-muted-foreground">بدون خطة</span>
                    )}
                    <span className="w-20 text-end">{r.delayed > 0 && <StatusBadge tone="danger">{r.delayed} متأخرة</StatusBadge>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
          عرض التفاصيل
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-6 border-t p-4">
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
      </details>
    </div>
  );
}
