import Link from "next/link";
import { AlarmClock, ArrowLeft, CheckCircle2, ChevronDown, MessageSquareQuote, Play, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { DashboardTodayTasks } from "@/features/tasks/dashboard-today-tasks";
import type { getEmployeeDashboard } from "@/server/queries/dashboard";
import type { AdHocTaskRow, DailyTaskRow } from "@/server/queries/tasks";
import { formatDateAr, formatDateTimeAr, formatDayAr, monthLabel } from "@/lib/dates";
import { formatNumber, formatPct, num } from "@/lib/num";
import { NOTION_STATUS_LABELS } from "@/lib/labels";

type Data = Awaited<ReturnType<typeof getEmployeeDashboard>>;

const RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
const open = (s: string) => s !== "COMPLETED" && s !== "CANCELLED";

/** The one task to start now: overdue first, then today's by priority. */
function nextTask(daily: DailyTaskRow[], adHoc: AdHocTaskRow[], today: string) {
  const candidates = [
    ...daily.filter((t) => open(t.status)).map((t) => ({ id: t.id, title: t.title, overdue: t.overdue, priority: t.priority, detail: t.target > 0 ? `${formatNumber(t.achieved)} من ${formatNumber(t.target)} ${t.unit ?? ""}` : null })),
    ...adHoc
      .filter((t) => open(t.status) && (!t.dueDate || t.dueDate <= today))
      .map((t) => ({ id: t.id, title: t.title, overdue: t.overdue, priority: t.priority, detail: t.assignedByName ? `تكليف من ${t.assignedByName}` : null })),
  ];
  return candidates.sort((a, b) => Number(b.overdue) - Number(a.overdue) || RANK[a.priority] - RANK[b.priority])[0] ?? null;
}

export function EmployeeDashboard({ name, userId, data }: { name: string; userId: string; data: Data }) {
  const { stats, week } = data;
  const next = nextTask(data.todayTaskRows, data.adHocRows, data.today);
  const allDone = stats.todayCount > 0 && stats.todayDone >= stats.todayCount;
  const weekGoals = (week?.goals ?? []).filter((g) => g.monthlyGoal.status !== "CANCELLED");
  const alerts = [
    stats.delayed > 0 && { icon: AlarmClock, tone: "text-danger", text: `${formatNumber(stats.delayed)} مهام متأخرة`, href: "/my-tasks" },
    stats.needsRevision > 0 && { icon: RotateCcw, tone: "text-warning", text: `${formatNumber(stats.needsRevision)} عناصر تحتاج تحسين`, href: "/my-plan" },
  ].filter((a): a is { icon: typeof AlarmClock; tone: string; text: string; href: string } => !!a);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">السلام عليكم، {name}</h1>
        <p className="text-sm text-muted-foreground">{formatDayAr(data.today)}</p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          {next ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{next.overdue ? "متأخرة — ابدأ بها" : "مهمتك التالية"}</p>
                <p className="mt-1 truncate text-lg font-bold">{next.title}</p>
                {next.detail && <p className="text-sm text-muted-foreground">{next.detail}</p>}
              </div>
              <Button size="lg" asChild>
                <Link href={`/focus/${next.id}`}>
                  <Play /> بدء العمل
                </Link>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-6 shrink-0 text-success" />
              <div>
                <p className="font-semibold">{allDone ? "أنجزت كل مهام اليوم" : "لا توجد مهام لليوم"}</p>
                <p className="text-sm text-muted-foreground">{allDone ? "عمل رائع. يمكنك إضافة مهمة جديدة إن احتجت." : "أضف مهمة سريعة أدناه، أو راجع «خطتي»."}</p>
              </div>
            </div>
          )}
        </CardContent>
        {stats.todayCount > 0 && (
          <div className="flex items-center gap-3 border-t bg-muted/30 px-5 py-2.5">
            <span className="text-xs text-muted-foreground">تقدم اليوم</span>
            <ProgressBar value={(stats.todayDone / stats.todayCount) * 100} size="sm" className="flex-1" />
            <span className="text-xs font-medium tabular-nums">
              {formatNumber(stats.todayDone)}/{formatNumber(stats.todayCount)}
            </span>
          </div>
        )}
      </Card>

      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.map(({ icon: Icon, tone, text, href }) => (
            <Link key={text} href={href} className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm hover:bg-accent/50">
              <Icon className={`size-4 ${tone}`} /> {text}
            </Link>
          ))}
        </div>
      )}

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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">التقدم هذا الأسبوع</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/my-plan">
                خطتي <ArrowLeft />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {weekGoals.length === 0 ? (
              <EmptyState title="لا توجد أهداف لهذا الأسبوع" description="سيقوم مديرك بإعداد خطتك، وتتوزع أهدافها تلقائيًا." className="py-6" />
            ) : (
              <div className="space-y-3">
                {weekGoals.map((g) => (
                  <div key={g.id} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{g.monthlyGoal.name}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-semibold">{formatNumber(num(g.achievedValue))}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          / {formatNumber(num(g.targetValue))} {g.monthlyGoal.unit}
                        </span>
                      </span>
                    </div>
                    <ProgressBar value={num(g.progressPct)} size="sm" />
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">
                  إنجاز الشهر {formatPct(stats.monthProgress)} — {monthLabel(data.year, data.month)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(data.notionActivity.length > 0 || data.lastReview || data.weeklyFeedback.length > 0) && (
        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
            المزيد
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 border-t p-4 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium">آخر ملاحظات المدير</p>
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
              {!data.lastReview && data.weeklyFeedback.length === 0 && <p className="text-xs text-muted-foreground">لا توجد ملاحظات بعد.</p>}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">آخر التحديثات من Notion</p>
              {data.notionActivity.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا يوجد نشاط بعد.</p>
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
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
