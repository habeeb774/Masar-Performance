import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, FileText, UserX } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { str } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDateAr, formatDayAr, monthLabel, toDateKey } from "@/lib/dates";
import { formatNumber, formatPct, num } from "@/lib/num";
import { suggestDailyTargets } from "@/lib/distribution";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { GOAL_STATUS_LABELS, PLAN_STATUS_LABELS, REPORT_STATUS_LABELS, TASK_SOURCE_LABELS, TASK_STATUS_LABELS, WEEKLY_PLAN_STATUS_LABELS, type GoalTypeKey } from "@/lib/labels";
import { companyToday, weekWorkDays } from "@/server/queries/plans";
import { weightedProgress } from "@/server/queries/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, NotionSyncedTag, PageHeader, StatCard } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { TaskStatusControl } from "@/features/tasks/task-status-control";
import { DailyDistributionEditor, type DailyGoalRow } from "@/features/plans/daily-distribution-editor";
import { GenerateReportButton } from "@/features/plans/generate-report-button";
import { NotionBreakdownGrid } from "@/features/plans/notion-breakdown";
import { readBreakdown } from "@/features/goals/types";

export const metadata: Metadata = { title: "أسبوعي" };

export default async function MyWeekPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (!user.employeeId) {
    return (
      <>
        <PageHeader title="أسبوعي" />
        <EmptyState icon={UserX} title="حسابك غير مرتبط بملف موظف" description="اطلب من مدير النظام ربط حسابك بملف موظف." />
      </>
    );
  }
  const employeeId = user.employeeId;
  const { company, today } = await companyToday();

  const all = await db.weeklyPlan.findMany({
    where: { employeeId },
    orderBy: { startDate: "asc" },
    select: { id: true, startDate: true, endDate: true },
  });
  const requested = str(sp.week);
  let idx = requested ? all.findIndex((w) => w.id === requested) : -1;
  if (idx < 0) idx = all.findIndex((w) => toDateKey(w.startDate) <= today && toDateKey(w.endDate) >= today);
  if (idx < 0) {
    const past = all.filter((w) => toDateKey(w.startDate) <= today);
    idx = past.length ? past.length - 1 : all.length ? 0 : -1;
  }

  if (idx < 0) {
    return (
      <>
        <PageHeader title="أسبوعي" />
        <EmptyState icon={CalendarDays} title="لا توجد خطة أسبوعية بعد" description="تتولد الأسابيع تلقائيًا بعد اعتماد خطتك الشهرية." action={<Button size="sm" asChild><Link href="/my-month">خطتي الشهرية</Link></Button>} />
      </>
    );
  }
  const prev = all[idx - 1];
  const next = all[idx + 1];

  const week = await db.weeklyPlan.findUniqueOrThrow({
    where: { id: all[idx].id },
    include: {
      monthlyPlan: { select: { id: true, status: true, year: true, month: true } },
      report: { select: { id: true, status: true } },
      goals: { include: { monthlyGoal: true }, orderBy: { monthlyGoal: { sortOrder: "asc" } } },
    },
  });
  const tasks = await db.dailyTask.findMany({
    where: { employeeId, date: { gte: week.startDate, lte: week.endDate } },
    include: { monthlyGoal: { select: { source: true, unit: true } } },
    orderBy: [{ date: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
  });

  const days = weekWorkDays(week.startDate, week.endDate, company.workDays);
  const activeGoals = week.goals.filter((g) => g.monthlyGoal.status !== "CANCELLED");
  const dailyGoals: DailyGoalRow[] = activeGoals.map((g) => ({
    id: g.id,
    name: g.monthlyGoal.name,
    unit: g.monthlyGoal.unit,
    goalType: g.monthlyGoal.goalType as GoalTypeKey,
    targetValue: num(g.targetValue),
    notion: g.monthlyGoal.source === "NOTION",
  }));
  const initial: Record<string, Record<string, number>> = {};
  for (const g of activeGoals) {
    const distributed = tasks.filter((t) => t.weeklyGoalId === g.id && t.source === "DISTRIBUTED");
    if (distributed.length > 0) {
      initial[g.id] = Object.fromEntries(distributed.map((t) => [toDateKey(t.date), num(t.target)]));
    } else {
      const split = suggestDailyTargets(num(g.targetValue), days.length);
      initial[g.id] = Object.fromEntries(days.map((d, i) => [d, split[i] ?? 0]));
    }
  }
  const planActive = week.monthlyPlan.status === "APPROVED" || week.monthlyPlan.status === "IN_PROGRESS";
  const canDistribute = planActive && week.status !== "CLOSED" && (hasPermission(user, PERMISSIONS.PLANS_DISTRIBUTE_OWN) || hasPermission(user, PERMISSIONS.PLANS_MANAGE));
  const progress = weightedProgress(week.goals.map((g) => ({ weight: g.monthlyGoal.weight, progressPct: g.progressPct, status: g.monthlyGoal.status })));
  const doneTasks = tasks.filter((t) => t.status === "COMPLETED").length;

  const byDay = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const k = toDateKey(t.date);
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  const taskDays = [...new Set([...days, ...byDay.keys()])].sort();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`الأسبوع ${week.weekIndex} — ${monthLabel(week.monthlyPlan.year, week.monthlyPlan.month)}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatDateAr(week.startDate)} – {formatDateAr(week.endDate)} <EnumBadge map={WEEKLY_PLAN_STATUS_LABELS} value={week.status} />
            <span className="text-xs">الخطة: </span>
            <EnumBadge map={PLAN_STATUS_LABELS} value={week.monthlyPlan.status} />
          </span>
        }
        actions={
          <>
            <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
              <Button variant="ghost" size="icon-sm" disabled={!prev} asChild={!!prev} aria-label="الأسبوع السابق">
                {prev ? (
                  <Link href={`/my-week?week=${prev.id}`}>
                    <ChevronRight />
                  </Link>
                ) : (
                  <ChevronRight />
                )}
              </Button>
              <span className="min-w-24 text-center text-sm font-medium">الأسبوع {week.weekIndex}</span>
              <Button variant="ghost" size="icon-sm" disabled={!next} asChild={!!next} aria-label="الأسبوع التالي">
                {next ? (
                  <Link href={`/my-week?week=${next.id}`}>
                    <ChevronLeft />
                  </Link>
                ) : (
                  <ChevronLeft />
                )}
              </Button>
            </div>
            {week.report && (
              <Button variant="outline" asChild>
                <Link href={`/reports/weekly/${week.report.id}`}>
                  <FileText /> التقرير <EnumBadge map={REPORT_STATUS_LABELS} value={week.report.status} />
                </Link>
              </Button>
            )}
            <GenerateReportButton weeklyPlanId={week.id} exists={!!week.report} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="إنجاز الأسبوع" value={formatPct(progress)} footer={<ProgressBar value={progress} size="sm" />} />
        <StatCard label="أهداف الأسبوع" value={formatNumber(activeGoals.length)} tone="info" />
        <StatCard label="المهام المكتملة" value={`${formatNumber(doneTasks)}/${formatNumber(tasks.length)}`} tone="success" />
        <StatCard label="أيام العمل" value={formatNumber(days.length)} tone="primary" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">أهداف الأسبوع</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/my-month?year=${week.monthlyPlan.year}&month=${week.monthlyPlan.month}`}>
              خطة الشهر <ArrowLeft />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activeGoals.length === 0 ? (
            <EmptyState title="لا توجد أهداف لهذا الأسبوع" className="py-6" />
          ) : (
            <div className="divide-y">
              {activeGoals.map((g) => {
                const breakdown = readBreakdown(g.breakdown);
                const target = num(g.targetValue);
                const achieved = num(g.achievedValue);
                return (
                  <div key={g.id} className="space-y-2 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{g.monthlyGoal.name}</span>
                          {g.monthlyGoal.source === "NOTION" && <NotionSyncedTag />}
                          <EnumBadge map={GOAL_STATUS_LABELS} value={g.monthlyGoal.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {formatNumber(achieved, 2)} من {formatNumber(target, 2)} {g.monthlyGoal.unit} · المتبقي {formatNumber(Math.max(target - achieved, 0), 2)}
                        </p>
                      </div>
                      <ProgressBar value={num(g.progressPct)} showLabel className="sm:w-56" />
                    </div>
                    {breakdown && <NotionBreakdownGrid breakdown={breakdown} />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">توزيع الأسبوع على الأيام</CardTitle>
          {!planActive && <p className="text-xs text-muted-foreground">يتاح التوزيع اليومي بعد اعتماد الخطة الشهرية.</p>}
        </CardHeader>
        <CardContent>
          <DailyDistributionEditor weeklyPlanId={week.id} goals={dailyGoals} days={days} initial={initial} today={today} readOnly={!canDistribute} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">مهام الأسبوع حسب اليوم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tasks.length === 0 ? (
            <EmptyState icon={CalendarDays} title="لا توجد مهام في هذا الأسبوع" description="احفظ توزيع الأيام أعلاه لتوليد مهام يومية من أهداف الأسبوع." className="py-6" />
          ) : (
            taskDays.map((d) => {
              const list = byDay.get(d) ?? [];
              return (
                <div key={d}>
                  <p className={`mb-1.5 text-xs font-semibold ${d === today ? "text-primary" : "text-muted-foreground"}`}>
                    {formatDayAr(d)} {d === today && "— اليوم"}
                  </p>
                  {list.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">لا توجد مهام</p>
                  ) : (
                    <div className="space-y-1.5">
                      {list.map((t) => {
                        const notion = t.monthlyGoal?.source === "NOTION" && t.source !== "MANUAL";
                        const target = num(t.target);
                        const achieved = num(t.achieved);
                        return (
                          <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 sm:flex-nowrap">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-medium">{t.title}</span>
                                <StatusBadge tone="neutral" dot={false}>
                                  {TASK_SOURCE_LABELS[t.source]}
                                </StatusBadge>
                                {notion && <NotionSyncedTag />}
                              </div>
                              {target > 0 && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <ProgressBar value={(achieved / target) * 100} size="sm" className="max-w-48 flex-1" />
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {formatNumber(achieved, 2)}/{formatNumber(target, 2)} {t.monthlyGoal?.unit ?? ""}
                                  </span>
                                </div>
                              )}
                            </div>
                            <EnumBadge map={TASK_STATUS_LABELS} value={t.status} />
                            <TaskStatusControl
                              task={{ id: t.id, kind: "daily", title: t.title, status: t.status, achieved, target, progress: t.progress, notes: t.notes, delayReason: t.delayReason, notionDriven: notion }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
