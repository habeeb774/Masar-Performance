import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, ChevronDown, Hourglass, Target, UserX } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { requireUser, type AuthUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { fromDateKey, monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { formatNumber, formatPct, num } from "@/lib/num";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { dutyOf, groupByDuty } from "@/lib/duties";
import { companyToday, distributionGoals, getNotionSourceOptions, getPlanDetail, monthPeriod, serializeGoal, weekColumns, weeklyTargetsMatrix } from "@/server/queries/plans";
import { breakdownTotals, weightedProgress } from "@/server/queries/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { MonthPicker } from "@/components/shared/url-filters";
import { PlanGoalsTable } from "@/features/plans/plan-goals-table";
import { WeeklyDistributionEditor } from "@/features/plans/weekly-distribution-editor";
import { ManagerNotes, PlanWorkflowActions, WeeksOverview, planCapabilities } from "@/features/plans/plan-sections";

export const metadata: Metadata = { title: "خطتي" };

const qty = (v: number) => formatNumber(v, v % 1 ? 1 : 0);

function GoalLine({ name, achieved, target, unit, status }: { name: string; achieved: number; target: number; unit: string; status?: string }) {
  const pct = target > 0 ? (achieved / target) * 100 : 0;
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          {status === "COMPLETED" && <StatusBadge tone="success">تم</StatusBadge>}
          {status === "AT_RISK" && <StatusBadge tone="warning">متأخر</StatusBadge>}
        </span>
        <span className="shrink-0 text-sm tabular-nums">
          <span className="font-semibold">{qty(achieved)}</span>
          <span className="text-muted-foreground">
            {" "}
            / {qty(target)} {unit}
          </span>
        </span>
      </div>
      <ProgressBar value={pct} size="sm" />
    </li>
  );
}

/** Role-aware empty states: an employee waits for the manager, a manager is pointed to the team plan. */
function NoPlan({ user, year, month }: { user: AuthUser; year: number; month: number }) {
  const manager = hasPermission(user, PERMISSIONS.PLANS_MANAGE);
  return (
    <EmptyState
      icon={CalendarClock}
      title={manager ? "لم يتم تعيين خطة شخصية لك" : `لم يتم إعداد خطة ${monthLabel(year, month)} بعد`}
      description={manager ? "خطط موظفيك في «خطة الفريق»." : "سيقوم مديرك بإعداد خطتك، وستظهر هنا فور إنشائها."}
      action={
        manager ? (
          <Button size="sm" asChild>
            <Link href="/monthly-plans">خطة الفريق</Link>
          </Button>
        ) : undefined
      }
    />
  );
}

export default async function MyPlanPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = await companyToday();
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);
  const header = <PageHeader title={`خطة ${monthLabel(year, month)}`} actions={<MonthPicker year={year} month={month} />} />;

  if (!user.employeeId) {
    return (
      <>
        {header}
        {hasPermission(user, PERMISSIONS.PLANS_MANAGE) ? (
          <NoPlan user={user} year={year} month={month} />
        ) : (
          <EmptyState icon={UserX} title="حسابك غير مرتبط بملف موظف" description="اطلب من مدير النظام ربط حسابك بملف موظف." />
        )}
      </>
    );
  }

  const ref = await db.monthlyPlan.findUnique({ where: { employeeId_year_month: { employeeId: user.employeeId, year, month } }, select: { id: true } });
  const plan = ref ? await getPlanDetail(ref.id) : null;
  if (!plan || plan.goals.length === 0) {
    return (
      <>
        {header}
        <NoPlan user={user} year={year} month={month} />
      </>
    );
  }

  const goals = plan.goals.map(serializeGoal);
  const active = goals.filter((g) => g.status !== "CANCELLED");
  const progress = weightedProgress(plan.goals);
  const cap = planCapabilities(user, plan);
  const running = plan.status === "APPROVED" || plan.status === "IN_PROGRESS" || plan.status === "COMPLETED";

  const currentWeek = running
    ? await db.weeklyPlan.findFirst({
        where: { monthlyPlanId: plan.id, startDate: { lte: fromDateKey(now.today) }, endDate: { gte: fromDateKey(now.today) } },
        include: { goals: { include: { monthlyGoal: { select: { name: true, unit: true, status: true, sortOrder: true } } } } },
      })
    : null;
  const weekGoals = (currentWeek?.goals ?? []).filter((g) => g.monthlyGoal.status !== "CANCELLED").sort((a, b) => a.monthlyGoal.sortOrder - b.monthlyGoal.sortOrder);

  const sources = await getNotionSourceOptions();
  const totals = breakdownTotals(plan.goals);
  const weeks = weekColumns(plan.weeklyPlans, now.company.workDays);
  const varianceNote = plan.weeklyPlans.find((w) => w.varianceNote)?.varianceNote ?? null;

  return (
    <div className="space-y-5">
      {header}

      <ManagerNotes notes={plan.managerNotes} returned={plan.status === "DRAFT"} />
      {plan.status === "SUBMITTED" && (
        <Alert className="border-pending/40 bg-pending-soft/40">
          <Hourglass />
          <AlertTitle>بانتظار اعتماد مديرك</AlertTitle>
          <AlertDescription>بعد الاعتماد تُوزَّع الأهداف على الأسابيع تلقائيًا.</AlertDescription>
        </Alert>
      )}
      {plan.status === "DRAFT" && <PlanWorkflowActions plan={plan} user={user} />}

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">التقدم الكلي</p>
              <p className="text-3xl font-bold tabular-nums">{formatPct(progress)}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatNumber(active.filter((g) => g.status === "COMPLETED").length)} من {formatNumber(active.length)} أهداف مكتملة
            </p>
          </div>
          <ProgressBar value={progress} size="lg" />
        </CardContent>
      </Card>

      {currentWeek && weekGoals.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">هذا الأسبوع</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/my-week?week=${currentWeek.id}`}>
                أيام الأسبوع <ArrowLeft />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {weekGoals.map((g) => (
                <GoalLine key={g.id} name={g.monthlyGoal.name} achieved={num(g.achievedValue)} target={num(g.targetValue)} unit={g.monthlyGoal.unit} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4.5 text-primary" /> أهداف الشهر
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const groups = groupByDuty(active, dutyOf);
            return groups.map((group) => (
              <section key={group.duty}>
                {groups.length > 1 && <h3 className="text-xs font-semibold text-muted-foreground">{group.duty}</h3>}
                <ul className="divide-y">
                  {group.items.map((g) => (
                    <GoalLine key={g.id} name={g.name} achieved={g.achievedValue} target={g.targetValue} unit={g.unit} status={g.status} />
                  ))}
                </ul>
              </section>
            ));
          })()}
        </CardContent>
      </Card>

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
          تفاصيل إضافية
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["عناصر مكتملة", formatNumber(totals.completed)],
              ["بانتظار الاعتماد", formatNumber(totals.pendingApproval)],
              ["نسبة الاعتماد", formatPct(totals.approvalRate)],
              ["أعيدت للتحسين", formatNumber(totals.reworkCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <PlanGoalsTable
            planId={plan.id}
            employeeId={plan.employeeId}
            goals={goals}
            sources={sources}
            testPeriod={monthPeriod(year, month)}
            dates={{ start: monthStart(year, month), end: monthEnd(year, month) }}
            canEdit={cap.canEdit}
            canDelete={cap.canDelete}
            canCancel={cap.canCancel}
          />
          {running && (
            <WeeklyDistributionEditor
              planId={plan.id}
              goals={distributionGoals(plan)}
              weeks={weeks}
              initial={weeklyTargetsMatrix(plan)}
              varianceNote={varianceNote}
              readOnly={!cap.canDistribute}
              isManager={cap.canManage}
            />
          )}
          <WeeksOverview plan={plan} workDays={now.company.workDays} weekHref={(id) => `/my-week?week=${id}`} />
        </div>
      </details>
    </div>
  );
}
