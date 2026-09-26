import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarRange, CheckCircle2, Hourglass } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { int, str } from "@/lib/params";
import { employeeWhere, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { canAccessEmployee, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDateTimeAr, monthLabel } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { PLAN_STATUS_LABELS } from "@/lib/labels";
import { getCompany } from "@/server/services/company";
import { companyToday, distributionGoals, getPlanDetail, weekColumns, weekProgress, weeklyTargetsMatrix } from "@/server/queries/plans";
import { weightedProgress } from "@/server/queries/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { ActionButton } from "@/components/shared/action-button";
import { MonthPicker } from "@/components/shared/url-filters";
import { WeeklyDistributionEditor } from "@/features/plans/weekly-distribution-editor";
import { approveWeeklyVarianceAction } from "@/actions/plans";

export const metadata: Metadata = { title: "التوزيع الأسبوعي" };

export default async function WeeklyPlansPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission(PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE);
  const sp = await searchParams;
  const planId = str(sp.plan);

  if (planId) {
    const plan = await getPlanDetail(planId);
    if (!plan) notFound();
    if (!canAccessEmployee(user, plan.employeeId)) forbidden();
    const company = await getCompany();
    const weeks = weekColumns(plan.weeklyPlans, company.workDays);
    const pending = plan.weeklyPlans.filter((w) => w.status === "PENDING_APPROVAL");
    const note = plan.weeklyPlans.find((w) => w.varianceNote)?.varianceNote ?? null;
    const approvedAt = plan.weeklyPlans.find((w) => w.varianceApprovedAt)?.varianceApprovedAt ?? null;
    const goals = distributionGoals(plan);
    const editable = (plan.status === "APPROVED" || plan.status === "IN_PROGRESS") && hasPermission(user, PERMISSIONS.PLANS_MANAGE);

    return (
      <div className="space-y-5">
        <PageHeader
          title={`التوزيع الأسبوعي — ${plan.employee.fullName}`}
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              {monthLabel(plan.year, plan.month)} <EnumBadge map={PLAN_STATUS_LABELS} value={plan.status} />
            </span>
          }
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href={`/weekly-plans?year=${plan.year}&month=${plan.month}`}>
                  <ArrowRight /> كل الخطط
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/monthly-plans/${plan.id}`}>
                  الخطة الشهرية <ArrowLeft />
                </Link>
              </Button>
            </>
          }
        />

        {pending.length > 0 && (
          <Alert className="border-pending/40 bg-pending-soft/40">
            <Hourglass />
            <AlertTitle>التوزيع يختلف عن الهدف الشهري ويحتاج اعتمادك ({formatNumber(pending.length)} أسابيع)</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="whitespace-pre-line">مبرر الموظف: {note ?? "—"}</p>
              {hasPermission(user, PERMISSIONS.PLANS_APPROVE) && (
                <ActionButton size="sm" action={approveWeeklyVarianceAction.bind(null, plan.id)} confirm={{ title: "اعتماد التوزيع الأسبوعي؟", description: "تُفعّل الأسابيع بالمستهدفات الحالية كما هي.", confirmLabel: "اعتماد" }}>
                  <CheckCircle2 /> اعتماد التوزيع
                </ActionButton>
              )}
            </AlertDescription>
          </Alert>
        )}
        {pending.length === 0 && note && approvedAt && (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>فرق معتمد في {formatDateTimeAr(approvedAt)}</AlertTitle>
            <AlertDescription>{note}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">مصفوفة التوزيع</CardTitle>
          </CardHeader>
          <CardContent>
            {plan.status === "DRAFT" || plan.status === "SUBMITTED" ? (
              <EmptyState icon={CalendarRange} title="لم تُعتمد الخطة بعد" description="يبدأ التوزيع الأسبوعي بعد اعتماد الخطة الشهرية." />
            ) : (
              <WeeklyDistributionEditor
                planId={plan.id}
                goals={goals}
                weeks={weeks}
                initial={weeklyTargetsMatrix(plan)}
                varianceNote={note}
                readOnly={!editable}
                isManager
              />
            )}
          </CardContent>
        </Card>

        {plan.weeklyPlans.length > 0 && (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {plan.weeklyPlans.map((w) => (
              <div key={w.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between text-sm font-semibold">
                  الأسبوع {w.weekIndex}
                  <span className="text-xs font-normal text-muted-foreground">إنجاز</span>
                </div>
                <ProgressBar value={weekProgress(w)} showLabel size="sm" className="mt-2" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- list mode --------------------------------------------------------------
  const now = await companyToday();
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);
  const plans = await db.monthlyPlan.findMany({
    where: { year, month, ...employeeWhere(user), weeklyPlans: { some: {} } },
    orderBy: { employee: { fullName: "asc" } },
    include: {
      employee: { select: { fullName: true, jobTitle: { select: { name: true } } } },
      goals: { select: { weight: true, progressPct: true, status: true } },
      weeklyPlans: { orderBy: { weekIndex: "asc" }, select: { id: true, status: true, varianceNote: true } },
    },
  });
  const sorted = [...plans].sort(
    (a, b) => Number(b.weeklyPlans.some((w) => w.status === "PENDING_APPROVAL")) - Number(a.weeklyPlans.some((w) => w.status === "PENDING_APPROVAL")),
  );

  return (
    <>
      <PageHeader title="التوزيع الأسبوعي" description={`خطط ${monthLabel(year, month)} التي تولدت أسابيعها — راجع التوزيع واعتمد الفروق.`} actions={<MonthPicker year={year} month={month} />} />
      {sorted.length === 0 ? (
        <EmptyState icon={CalendarRange} title="لا توجد خطط معتمدة بأسابيع لهذا الشهر" description="تتولد الأسابيع عند اعتماد الخطط الشهرية." action={<Button size="sm" asChild><Link href={`/monthly-plans?year=${year}&month=${month}`}>الخطط الشهرية</Link></Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => {
            const pending = p.weeklyPlans.filter((w) => w.status === "PENDING_APPROVAL").length;
            const distributed = p.weeklyPlans.filter((w) => w.status !== "DRAFT").length;
            return (
              <Link key={p.id} href={`/weekly-plans?plan=${p.id}`} className="block">
                <Card className={`h-full gap-3 transition-colors hover:border-primary/40 ${pending ? "border-pending/50 bg-pending-soft/20" : ""}`}>
                  <CardHeader className="gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{p.employee.fullName}</CardTitle>
                      <EnumBadge map={PLAN_STATUS_LABELS} value={p.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{p.employee.jobTitle?.name ?? "—"}</p>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    <ProgressBar value={weightedProgress(p.goals)} showLabel size="sm" />
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge tone="info" dot={false}>
                        {formatNumber(p.weeklyPlans.length)} أسابيع
                      </StatusBadge>
                      <StatusBadge tone={distributed === p.weeklyPlans.length ? "success" : "neutral"} dot={false}>
                        موزّع {formatNumber(distributed)}/{formatNumber(p.weeklyPlans.length)}
                      </StatusBadge>
                      {pending > 0 && <StatusBadge tone="pending">فرق بانتظار الاعتماد</StatusBadge>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
