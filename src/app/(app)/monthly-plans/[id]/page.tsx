import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { IdParams } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { canAccessEmployee, hasAnyPermission, PERMISSIONS } from "@/lib/permissions";
import { monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { PLAN_STATUS_LABELS } from "@/lib/labels";
import { getCompany } from "@/server/services/company";
import { getNotionSourceOptions, getPlanDetail, monthPeriod, serializeGoal } from "@/server/queries/plans";
import { weightedProgress } from "@/server/queries/dashboard";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { PlanGoalsTable } from "@/features/plans/plan-goals-table";
import { ManagerNotes, PlanSummaryCard, PlanWorkflowActions, WeeksOverview, planCapabilities } from "@/features/plans/plan-sections";

export const metadata: Metadata = { title: "تفاصيل الخطة الشهرية" };

export default async function MonthlyPlanPage({ params }: { params: IdParams }) {
  const user = await requireUser();
  const { id } = await params;
  const plan = await getPlanDetail(id);
  if (!plan) notFound();
  const isOwner = plan.employeeId === user.employeeId;
  if (!isOwner && !(canAccessEmployee(user, plan.employeeId) && hasAnyPermission(user, [PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE]))) forbidden();

  const [company, sources, approvedBy] = await Promise.all([
    getCompany(),
    getNotionSourceOptions(),
    plan.approvedById ? db.user.findUnique({ where: { id: plan.approvedById }, select: { name: true } }) : null,
  ]);
  const cap = planCapabilities(user, plan);
  const goals = plan.goals.map(serializeGoal);
  const progress = weightedProgress(plan.goals);
  const managerView = cap.canManage || cap.canApprove;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`خطة ${plan.employee.fullName}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {monthLabel(plan.year, plan.month)} · {plan.employee.jobTitle?.name ?? "بدون مسمى"} <EnumBadge map={PLAN_STATUS_LABELS} value={plan.status} />
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={managerView ? `/monthly-plans?year=${plan.year}&month=${plan.month}` : "/my-month"}>
                <ArrowRight /> {managerView ? "الخطط" : "شهري"}
              </Link>
            </Button>
            <PlanWorkflowActions plan={plan} user={user} />
          </>
        }
      />

      <ManagerNotes notes={plan.managerNotes} returned={plan.status === "DRAFT"} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <PlanGoalsTable
            planId={plan.id}
            employeeId={plan.employeeId}
            goals={goals}
            sources={sources}
            testPeriod={monthPeriod(plan.year, plan.month)}
            dates={{ start: monthStart(plan.year, plan.month), end: monthEnd(plan.year, plan.month) }}
            canEdit={cap.canEdit}
            canDelete={cap.canDelete}
            canCancel={cap.canCancel}
          />
          <WeeksOverview
            plan={plan}
            workDays={company.workDays}
            distributeHref={managerView ? `/weekly-plans?plan=${plan.id}` : cap.canDistribute ? `/my-month?year=${plan.year}&month=${plan.month}` : undefined}
            weekHref={isOwner ? (weekId) => `/my-week?week=${weekId}` : undefined}
          />
        </div>
        <div className="space-y-5">
          <PlanSummaryCard plan={plan} progress={progress} approvedByName={approvedBy?.name} />
          {plan.notes && (
            <div className="rounded-xl border bg-card p-4 text-sm">
              <p className="mb-1 font-medium">ملاحظات الخطة</p>
              <p className="whitespace-pre-line text-muted-foreground">{plan.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
