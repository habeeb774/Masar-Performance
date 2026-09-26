import type { Metadata } from "next";
import { CalendarRange, CheckCircle2, ClipboardList, Hourglass, UserPlus } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { FilterBar, MonthPicker, Pager, SearchInput, SelectFilter } from "@/components/shared/url-filters";
import { PlansTable, type PlanListRow } from "@/features/plans/plans-table";
import { CreatePlanDialog } from "@/features/plans/create-plan-dialog";

export const metadata: Metadata = { title: "الخطط الشهرية" };

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
  const withPlan = new Set(
    (await db.monthlyPlan.findMany({ where: { year, month, ...scope }, select: { employeeId: true } })).map((p) => p.employeeId),
  );
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

  return (
    <>
      <PageHeader
        title="الخطط الشهرية"
        description={`خطط ${monthLabel(year, month)} للموظفين: الإنشاء من القوالب، الاعتماد، ومتابعة الإنجاز الموزون.`}
        actions={
          <>
            <MonthPicker year={year} month={month} />
            {canCreate && employeeOptions.length > 0 && <CreatePlanDialog employees={employeeOptions} templates={templates} year={year} month={month} />}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">موظفون بدون خطة في {monthLabel(year, month)}</CardTitle>
        </CardHeader>
        <CardContent>
          {withoutPlan.length === 0 ? (
            <EmptyState icon={CalendarRange} title="كل الموظفين النشطين لديهم خطة لهذا الشهر" className="py-6" />
          ) : (
            <div className="divide-y">
              {withoutPlan.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.fullName}</p>
                    <p className="text-xs text-muted-foreground">{e.jobTitle?.name ?? "بدون مسمى وظيفي"}</p>
                  </div>
                  {canCreate && <CreatePlanDialog employees={employeeOptions} templates={templates} year={year} month={month} employeeId={e.id} size="sm" variant="outline" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
