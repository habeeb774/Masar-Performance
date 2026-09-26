import Link from "next/link";
import {
  AlarmClock,
  ArrowLeft,
  CalendarCheck2,
  CalendarDays,
  Hourglass,
  MessageSquareQuote,
  RotateCcw,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, NotionSyncedTag, StatCard } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { DashboardTodayTasks } from "@/features/tasks/dashboard-today-tasks";
import type { getEmployeeDashboard } from "@/server/queries/dashboard";
import { formatDateAr, formatDateTimeAr, formatDayAr, monthLabel } from "@/lib/dates";
import { formatNumber, formatPct, num } from "@/lib/num";
import { GOAL_STATUS_LABELS, NOTION_STATUS_LABELS, PLAN_STATUS_LABELS } from "@/lib/labels";

type Data = Awaited<ReturnType<typeof getEmployeeDashboard>>;

export function EmployeeDashboard({ name, userId, data }: { name: string; userId: string; data: Data }) {
  const { stats, plan, week } = data;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">السلام عليكم، {name}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDayAr(data.today)} — {plan ? <>خطة {monthLabel(data.year, data.month)}: <EnumBadge map={PLAN_STATUS_LABELS} value={plan.status} /></> : "لا توجد خطة لهذا الشهر بعد"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="إنجاز الشهر" value={formatPct(stats.monthProgress)} icon={Target} tone="primary" href="/my-plan" footer={<ProgressBar value={stats.monthProgress} size="sm" />} />
        <StatCard label="إنجاز الأسبوع" value={formatPct(stats.weekProgress)} icon={CalendarDays} tone="info" href="/my-week" footer={<ProgressBar value={stats.weekProgress} size="sm" />} />
        <StatCard label="مهام اليوم" value={`${stats.todayDone}/${stats.todayCount}`} icon={CalendarCheck2} tone="success" href="/my-tasks" />
        <StatCard label="المتأخرة" value={formatNumber(stats.delayed)} icon={AlarmClock} tone={stats.delayed ? "danger" : "neutral"} href="/my-tasks?status=DELAYED" />
        <StatCard label="بانتظار الاعتماد" value={formatNumber(stats.pendingApproval)} icon={Hourglass} tone="pending" />
        <StatCard label="تحتاج تحسين" value={formatNumber(stats.needsRevision)} icon={RotateCcw} tone={stats.needsRevision ? "warning" : "neutral"} hint={stats.approvalRate !== null ? `نسبة الاعتماد ${formatPct(stats.approvalRate)}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">مهام اليوم</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/my-tasks">
                كل المهام <ArrowLeft />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <DashboardTodayTasks daily={data.todayTaskRows} adHoc={data.adHocRows} today={data.today} goals={data.goalOptions} currentUserId={userId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">هذا الأسبوع</CardTitle>
          </CardHeader>
          <CardContent>
            {!week ? (
              <EmptyState icon={CalendarDays} title="لا توجد خطة أسبوعية حالية" description="تتولد الأسابيع تلقائيًا بعد اعتماد خطة الشهر." />
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  الأسبوع {week.weekIndex}: {formatDateAr(week.startDate)} – {formatDateAr(week.endDate)}
                </p>
                {week.goals.map((g) => (
                  <div key={g.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{g.monthlyGoal.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatNumber(num(g.achievedValue))}/{formatNumber(num(g.targetValue))}
                      </span>
                    </div>
                    <ProgressBar value={num(g.progressPct)} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">أهدافي الشهرية</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/my-plan">
                التفاصيل <ArrowLeft />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!plan || plan.goals.length === 0 ? (
              <EmptyState icon={Target} title="لا توجد أهداف لهذا الشهر" description="سيضيف المدير أهدافك الشهرية من القالب الخاص بوظيفتك." />
            ) : (
              <div className="divide-y">
                {plan.goals.map((g) => (
                  <div key={g.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{g.name}</span>
                        {g.source === "NOTION" && <NotionSyncedTag />}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatNumber(num(g.achievedValue))} من {formatNumber(num(g.targetValue))} {g.unit} · الوزن {formatNumber(num(g.weight))}%
                      </p>
                    </div>
                    <ProgressBar value={num(g.progressPct)} showLabel className="sm:w-56" />
                    <EnumBadge map={GOAL_STATUS_LABELS} value={g.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">نشاط Notion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.notionActivity.length === 0 ? (
              <EmptyState title="لا يوجد نشاط متزامن بعد" className="py-6" />
            ) : (
              data.notionActivity.map((e) => (
                <div key={e.id} className="flex items-start gap-2 text-sm">
                  <EnumBadge map={NOTION_STATUS_LABELS} value={e.toStatus} className="mt-0.5" />
                  <div className="min-w-0">
                    {e.item.url ? (
                      <a href={e.item.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline">
                        {e.item.title}
                      </a>
                    ) : (
                      <span className="block truncate font-medium">{e.item.title}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDateTimeAr(e.occurredAt)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">الإشعارات</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/notifications">
                الكل <ArrowLeft />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.notifications.length === 0 ? (
              <EmptyState title="لا توجد إشعارات" className="py-6" />
            ) : (
              data.notifications.map((n) => (
                <Link key={n.id} href={n.link ?? "/notifications"} className="flex items-start gap-2 rounded-lg p-2 hover:bg-muted">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-muted-foreground/30" : "bg-primary"}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTimeAr(n.createdAt)}</span>
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">آخر ملاحظات المدير</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.lastReview && (
              <Link href="/my-performance" className="block rounded-lg border p-3 hover:bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">تقييم {monthLabel(data.lastReview.year, data.lastReview.month)}</span>
                  <StatusBadge tone="success">
                    {formatNumber(num(data.lastReview.finalScore), 1)} — {data.lastReview.ratingLabel}
                  </StatusBadge>
                </div>
                {data.lastReview.managerNotes && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{data.lastReview.managerNotes}</p>}
              </Link>
            )}
            {data.weeklyFeedback.map((f) => (
              <Link key={f.id} href={`/reports/weekly/${f.id}`} className="flex gap-2 rounded-lg p-2 hover:bg-muted">
                <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">أسبوع {formatDateAr(f.weekStart)}</span>
                  <span className="line-clamp-2 text-sm">{f.managerComment}</span>
                </span>
              </Link>
            ))}
            {!data.lastReview && data.weeklyFeedback.length === 0 && <EmptyState icon={MessageSquareQuote} title="لا توجد ملاحظات بعد" className="py-6" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
