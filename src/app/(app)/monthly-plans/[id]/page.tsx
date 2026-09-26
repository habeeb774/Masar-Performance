import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ArrowRight, ChevronDown, Target } from "lucide-react";
import type { IdParams } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { canAccessEmployee, hasAnyPermission, PERMISSIONS } from "@/lib/permissions";
import { monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { PLAN_STATUS_LABELS } from "@/lib/labels";
import { companyToday, distributionGoals, getNotionSourceOptions, getPlanDetail, monthPeriod, serializeGoal, weekColumns, weeklyTargetsMatrix } from "@/server/queries/plans";
import { weightedProgress } from "@/server/queries/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { PlanGoalsSummary, PlanGoalsTable } from "@/features/plans/plan-goals-table";
import { WeeklyDistributionEditor } from "@/features/plans/weekly-distribution-editor";
import { ManagerNotes, PlanSummaryCard, PlanWorkflowActions, WeeksOverview, planCapabilities } from "@/features/plans/plan-sections";

export const metadata: Metadata = { title: "تفاصيل الخطة الشهرية" };

export default async function MonthlyPlanPage({ params }: { params: IdParams }) {
  const user = await requireUser();
  const { id } = await params;
  const plan = await getPlanDetail(id);
  if (!plan) notFound();
  const isOwner = plan.employeeId === user.employeeId;
  if (!isOwner && !(canAccessEmployee(user, plan.employeeId) && hasAnyPermission(user, [PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE]))) forbidden();

  const [now, sources, approvedBy] = await Promise.all([
    companyToday(),
    getNotionSourceOptions(),
    plan.approvedById ? db.user.findUnique({ where: { id: plan.approvedById }, select: { name: true } }) : null,
  ]);
  const cap = planCapabilities(user, plan);
  const goals = plan.goals.map(serializeGoal);
  const active = goals.filter((g) => g.status !== "CANCELLED");
  const progress = weightedProgress(plan.goals);
  const managerView = cap.canManage || cap.canApprove;
  const running = plan.status === "APPROVED" || plan.status === "IN_PROGRESS" || plan.status === "COMPLETED";
  const returned = plan.status === "DRAFT";
  const dates = { start: monthStart(plan.year, plan.month), end: monthEnd(plan.year, plan.month) };
  const varianceNote = plan.weeklyPlans.find((w) => w.varianceNote)?.varianceNote ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`خطة ${plan.employee.fullName}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {monthLabel(plan.year, plan.month)} <EnumBadge map={PLAN_STATUS_LABELS} value={plan.status} />
          </span>
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={managerView ? `/monthly-plans?year=${plan.year}&month=${plan.month}` : "/my-plan"}>
              <ArrowRight /> {managerView ? "خطة الفريق" : "خطتي"}
            </Link>
          </Button>
        }
      />

      {returned && <ManagerNotes notes={plan.managerNotes} returned />}
      <PlanWorkflowActions plan={plan} user={user} />

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4.5 text-primary" /> الأهداف
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PlanGoalsSummary goals={goals} today={now.today} dates={dates} canEdit={cap.canEdit} />
        </CardContent>
      </Card>

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
          إعدادات متقدمة
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t p-4">
          {!returned && <ManagerNotes notes={plan.managerNotes} />}
          <PlanGoalsTable
            planId={plan.id}
            employeeId={plan.employeeId}
            goals={goals}
            sources={sources}
            testPeriod={monthPeriod(plan.year, plan.month)}
            dates={dates}
            canEdit={cap.canEdit}
            canDelete={cap.canDelete}
            canCancel={cap.canCancel}
          />
          {running && plan.weeklyPlans.length > 0 && (
            <WeeklyDistributionEditor
              planId={plan.id}
              goals={distributionGoals(plan)}
              weeks={weekColumns(plan.weeklyPlans, now.company.workDays)}
              initial={weeklyTargetsMatrix(plan)}
              varianceNote={varianceNote}
              readOnly={!cap.canDistribute}
              isManager={cap.canManage}
            />
          )}
          <WeeksOverview plan={plan} workDays={now.company.workDays} weekHref={isOwner ? (weekId) => `/my-week?week=${weekId}` : undefined} />
          <div className="grid gap-5 lg:grid-cols-2">
            <PlanSummaryCard plan={plan} progress={progress} approvedByName={approvedBy?.name} />
            {plan.notes && (
              <div className="rounded-xl border bg-card p-4 text-sm">
                <p className="mb-1 font-medium">ملاحظات الخطة</p>
                <p className="whitespace-pre-line text-muted-foreground">{plan.notes}</p>
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
