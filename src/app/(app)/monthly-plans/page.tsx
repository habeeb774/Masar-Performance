import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, CheckCircle2, ChevronDown, ClipboardList, Hourglass, UserPlus, Users } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { SearchParams } from "@/lib/params";
import { int, pageParams, str } from "@/lib/params";
import { requirePermission, employeeWhere } from "@/server/auth/session";
import { db } from "@/server/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { monthLabel } from "@/lib/dates";
import { formatNumber, num } from "@/lib/num";
import { PLAN_STATUS_LABELS, PLAN_STATUSES, type PlanStatusKey } from "@/lib/labels";
import { companyToday, scopedEmployees, templateOptions } from "@/server/queries/plans";
import { weightedProgress } from "@/server/queries/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/shared/action-button";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { TeamPlanDialog } from "@/features/plans/team-plan-dialog";
import { approvePlanAction } from "@/actions/plans";
import { FilterBar, MonthPicker, Pager, SearchInput, SelectFilter } from "@/components/shared/url-filters";
import { PlansTable, type PlanListRow } from "@/features/plans/plans-table";
import { CreatePlanDialog } from "@/features/plans/create-plan-dialog";

export const metadata: Metadata = { title: "خطة الفريق" };

export default async function MonthlyPlansPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE);
  const sp = await searchParams;
  const now = await companyToday();
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);
  const status = str(sp.status);
  const employeeId = str(sp.employee);
  const q = str(sp.q);
  const { page, pageSize, skip, take } = pageParams(sp);
  const canCreate = hasPermission(user, PERMISSIONS.PLANS_MANAGE);
  const canApprove = hasPermission(user, PERMISSIONS.PLANS_APPROVE);

  const scope = employeeWhere(user);
  const where: Prisma.MonthlyPlanWhereInput = {
    year,
    month,
    ...scope,
    ...(status && (PLAN_STATUSES as readonly string[]).includes(status) ? { status: status as PlanStatusKey } : {}),
    ...(employeeId ? { AND: [{ employeeId }] } : {}),
    ...(q ? { employee: { fullName: { contains: q, mode: "insensitive" } } } : {}),
  };

  const [plans, total, statusCounts, employees, templates] = await Promise.all([
    db.monthlyPlan.findMany({
      where,
      orderBy: [{ status: "asc" }, { employee: { fullName: "asc" } }],
      skip,
      take,
      include: {
        employee: { select: { fullName: true, jobTitle: { select: { name: true } } } },
        goals: { select: { weight: true, progressPct: true, status: true } },
        weeklyPlans: { where: { status: "PENDING_APPROVAL" }, select: { id: true } },
      },
    }),
    db.monthlyPlan.count({ where }),
    db.monthlyPlan.groupBy({ by: ["status"], where: { year, month, ...scope }, _count: { _all: true } }),
    scopedEmployees(user),
    canCreate ? templateOptions() : Promise.resolve([]),
  ]);
  const monthPlans = await db.monthlyPlan.findMany({
    where: { year, month, ...scope },
    select: { id: true, employeeId: true, status: true, goals: { select: { weight: true, progressPct: true, status: true } } },
  });
  const planOf = new Map(monthPlans.map((p) => [p.employeeId, p]));
  const withPlan = new Set(planOf.keys());
  const withoutPlan = employees.filter((e) => !withPlan.has(e.id));

  const count = (s: PlanStatusKey) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const allCount = statusCounts.reduce((a, c) => a + c._count._all, 0);

  const rows: PlanListRow[] = plans.map((p) => ({
    id: p.id,
    employeeName: p.employee.fullName,
    jobTitle: p.employee.jobTitle?.name ?? null,
    status: p.status,
    goalsCount: p.goals.filter((g) => g.status !== "CANCELLED").length,
    totalWeight: Math.round(p.goals.filter((g) => g.status !== "CANCELLED").reduce((a, g) => a + num(g.weight), 0) * 100) / 100,
    progress: weightedProgress(p.goals),
    submittedAt: p.submittedAt?.toISOString() ?? null,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    pendingWeeks: p.weeklyPlans.length,
  }));
  const employeeOptions = employees.map((e) => ({ id: e.id, fullName: e.fullName, jobTitleId: e.jobTitleId, jobTitleName: e.jobTitle?.name ?? null }));

  const simpleEmployees = employees.map((e) => ({ id: e.id, fullName: e.fullName }));
  const awaiting = canApprove ? monthPlans.filter((p) => p.status === "SUBMITTED") : [];
  const nameOf = new Map(employees.map((e) => [e.id, e.fullName]));
  const stateOf = (status: string) =>
    status === "DRAFT"
      ? { label: "مسودة", tone: "neutral" as const }
      : status === "SUBMITTED"
        ? { label: "بانتظار الاعتماد", tone: "pending" as const }
        : status === "COMPLETED"
          ? { label: "مكتملة", tone: "success" as const }
          : status === "ARCHIVED"
            ? { label: "مؤرشفة", tone: "blocked" as const }
            : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`خطة الفريق — ${monthLabel(year, month)}`}
        actions={
          <>
            <MonthPicker year={year} month={month} />
            {canCreate && withoutPlan.length > 0 && (
              <TeamPlanDialog employees={withoutPlan.map((e) => ({ id: e.id, fullName: e.fullName }))} year={year} month={month} canApprove={canApprove} label="خطة جديدة" size="default" />
            )}
          </>
        }
      />

      {awaiting.length > 0 && (
        <Card className="border-pending/40">
          <CardHeader>
            <CardTitle className="text-base">يحتاج موافقتك</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {awaiting.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <p className="text-sm">
                  خطة <span className="font-medium">{nameOf.get(p.employeeId)}</span> لشهر {monthLabel(year, month)}
                </p>
                <div className="flex gap-2">
                  <ActionButton size="sm" action={() => approvePlanAction(p.id)}>
                    <CheckCircle2 /> اعتماد
                  </ActionButton>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/monthly-plans/${p.id}`}>تعديل</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد موظفون في فريقك بعد"
          description="أضف موظفيك أولًا، ثم أعد خطة كل موظف بخطوة واحدة."
          action={
            <Button size="sm" asChild>
              <Link href="/employees">الموظفون</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {employees.map((e) => {
              const plan = planOf.get(e.id);
              const progress = plan ? weightedProgress(plan.goals) : 0;
              const state = plan ? stateOf(plan.status) : null;
              return (
                <div key={e.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 sm:w-56">
                    <p className="truncate text-sm font-medium">{e.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.jobTitle?.name ?? "—"}</p>
                  </div>
                  {plan ? (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <ProgressBar value={progress} className="flex-1" />
                        <span className="w-12 text-end text-sm font-semibold tabular-nums">{Math.round(progress)}%</span>
                      </div>
                      <div className="flex items-center gap-2 sm:w-52 sm:justify-end">
                        {state && <StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/monthly-plans/${plan.id}`}>فتح</Link>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">لم تُعد خطة هذا الشهر</span>
                      {canCreate && <TeamPlanDialog employees={simpleEmployees} employeeId={e.id} year={year} month={month} canApprove={canApprove} variant="outline" />}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
          عرض التفاصيل
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="كل الخطط" value={formatNumber(allCount)} icon={ClipboardList} tone="primary" />
            <StatCard label="بانتظار الاعتماد" value={formatNumber(count("SUBMITTED"))} icon={Hourglass} tone={count("SUBMITTED") ? "pending" : "neutral"} />
            <StatCard label="معتمدة / قيد التنفيذ" value={formatNumber(count("APPROVED") + count("IN_PROGRESS"))} icon={CheckCircle2} tone="success" />
            <StatCard label="موظفون بدون خطة" value={formatNumber(withoutPlan.length)} icon={UserPlus} tone={withoutPlan.length ? "warning" : "neutral"} />
          </div>
          <FilterBar>
            <SearchInput placeholder="بحث باسم الموظف…" />
            <SelectFilter param="status" placeholder="الحالة" allLabel="كل الحالات" options={PLAN_STATUSES.map((s) => ({ value: s, label: PLAN_STATUS_LABELS[s].label }))} />
            <SelectFilter param="employee" placeholder="الموظف" allLabel="كل الموظفين" options={employees.map((e) => ({ value: e.id, label: e.fullName }))} className="sm:w-56" />
          </FilterBar>
          <PlansTable rows={rows} />
          <Pager page={page} pageSize={pageSize} total={total} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/weekly-plans?year=${year}&month=${month}`}>
                <CalendarRange /> التوزيع الأسبوعي
              </Link>
            </Button>
            {canCreate && employeeOptions.length > 0 && <CreatePlanDialog employees={employeeOptions} templates={templates} year={year} month={month} variant="outline" size="sm" />}
          </div>
        </div>
      </details>
    </div>
  );
}
