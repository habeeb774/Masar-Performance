import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CalendarRange, Hourglass, Target, UserX } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { PLAN_STATUS_LABELS } from "@/lib/labels";
import { companyToday, distributionGoals, getNotionSourceOptions, getPlanDetail, monthPeriod, serializeGoal, weekColumns, weeklyTargetsMatrix } from "@/server/queries/plans";
import { weightedProgress } from "@/server/queries/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { MonthPicker } from "@/components/shared/url-filters";
import { PlanGoalsTable } from "@/features/plans/plan-goals-table";
import { WeeklyDistributionEditor } from "@/features/plans/weekly-distribution-editor";
import { ManagerNotes, PlanWorkflowActions, WeeksOverview, planCapabilities } from "@/features/plans/plan-sections";

export const metadata: Metadata = { title: "خطتي الشهرية" };

export default async function MyMonthPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = await companyToday();
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);

  if (!user.employeeId) {
    return (
      <>
        <PageHeader title="خطتي الشهرية" />
        <EmptyState icon={UserX} title="حسابك غير مرتبط بملف موظف" description="اطلب من مدير النظام ربط حسابك بملف موظف لعرض خطتك." />
      </>
    );
  }

  const ref = await db.monthlyPlan.findUnique({ where: { employeeId_year_month: { employeeId: user.employeeId, year, month } }, select: { id: true } });
  const plan = ref ? await getPlanDetail(ref.id) : null;

  if (!plan) {
    return (
      <>
        <PageHeader title="خطتي الشهرية" description={monthLabel(year, month)} actions={<MonthPicker year={year} month={month} />} />
        <EmptyState icon={CalendarClock} title={`لا توجد خطة لشهر ${monthLabel(year, month)}`} description="سيقوم المدير بإنشاء خطتك الشهرية من قالب أهداف وظيفتك، وستظهر هنا فور إنشائها." />
      </>
    );
  }

  const sources = await getNotionSourceOptions();
  const cap = planCapabilities(user, plan);
  const goals = plan.goals.map(serializeGoal);
  const active = goals.filter((g) => g.status !== "CANCELLED");
  const progress = weightedProgress(plan.goals);
  const weeks = weekColumns(plan.weeklyPlans, now.company.workDays);
  const pendingWeeks = plan.weeklyPlans.filter((w) => w.status === "PENDING_APPROVAL").length;
  const undistributed = plan.weeklyPlans.length > 0 && plan.weeklyPlans.every((w) => w.status === "DRAFT");
  const varianceNote = plan.weeklyPlans.find((w) => w.varianceNote)?.varianceNote ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="خطتي الشهرية"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {monthLabel(year, month)} <EnumBadge map={PLAN_STATUS_LABELS} value={plan.status} />
          </span>
        }
        actions={
          <>
            <MonthPicker year={year} month={month} />
            <PlanWorkflowActions plan={plan} user={user} />
          </>
        }
      />

      <ManagerNotes notes={plan.managerNotes} returned={plan.status === "DRAFT"} />
      {plan.status === "DRAFT" && (
        <Alert>
          <Target />
          <AlertTitle>خطتك مسودة</AlertTitle>
          <AlertDescription>راجع الأهداف والمستهدفات وعدّلها عند الحاجة، ثم أرسل الخطة لاعتماد المدير.</AlertDescription>
        </Alert>
      )}
      {plan.status === "SUBMITTED" && (
        <Alert className="border-pending/40 bg-pending-soft/40">
          <Hourglass />
          <AlertTitle>الخطة بانتظار اعتماد المدير</AlertTitle>
          <AlertDescription>بعد الاعتماد تتولد أسابيع الشهر ويمكنك توزيع الأهداف عليها.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="الإنجاز الموزون" value={formatPct(progress)} icon={Target} footer={<ProgressBar value={progress} size="sm" />} />
        <StatCard label="الأهداف" value={formatNumber(active.length)} hint={`${formatNumber(active.filter((g) => g.status === "COMPLETED").length)} مكتمل`} tone="info" />
        <StatCard label="متأخر عن المسار" value={formatNumber(active.filter((g) => g.status === "AT_RISK").length)} tone={active.some((g) => g.status === "AT_RISK") ? "warning" : "neutral"} />
        <StatCard label="الأسابيع" value={formatNumber(plan.weeklyPlans.length)} icon={CalendarRange} tone="primary" hint={pendingWeeks ? "فرق بانتظار الاعتماد" : undefined} href="/my-week" />
      </div>

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

      {(plan.status === "APPROVED" || plan.status === "IN_PROGRESS" || plan.status === "COMPLETED") && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">توزيع أهداف الشهر على الأسابيع</CardTitle>
            {undistributed && <span className="text-xs text-warning">لم تحفظ التوزيع بعد — راجع الاقتراح واحفظه لتفعيل الأسابيع.</span>}
            {pendingWeeks > 0 && <span className="text-xs text-pending">التوزيع بانتظار اعتماد المدير للفرق.</span>}
          </CardHeader>
          <CardContent>
            <WeeklyDistributionEditor
              planId={plan.id}
              goals={distributionGoals(plan)}
              weeks={weeks}
              initial={weeklyTargetsMatrix(plan)}
              varianceNote={varianceNote}
              readOnly={!cap.canDistribute}
              isManager={cap.canManage}
            />
          </CardContent>
        </Card>
      )}

      <WeeksOverview plan={plan} workDays={now.company.workDays} weekHref={(id) => `/my-week?week=${id}`} />

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/my-goals">تفاصيل الأهداف وجودة الإنجاز</Link>
        </Button>
      </div>
    </div>
  );
}
