import type { Metadata } from "next";
import { BadgeCheck, CheckCircle2, RotateCcw, Target, UserX } from "lucide-react";
import type { SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { monthLabel } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { KPI_CATEGORIES, KPI_CATEGORY_LABELS, PLAN_STATUS_LABELS } from "@/lib/labels";
import { companyToday, serializeGoal } from "@/server/queries/plans";
import { breakdownTotals, weightedProgress } from "@/server/queries/dashboard";
import { EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { MonthPicker } from "@/components/shared/url-filters";
import { GoalDetailCard } from "@/features/plans/goal-detail-card";

export const metadata: Metadata = { title: "أهدافي" };

export default async function MyGoalsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = await companyToday();
  const year = int(sp.year, now.year, 2020, 2100);
  const month = int(sp.month, now.month, 1, 12);

  if (!user.employeeId) {
    return (
      <>
        <PageHeader title="أهدافي" />
        <EmptyState icon={UserX} title="حسابك غير مرتبط بملف موظف" description="اطلب من مدير النظام ربط حسابك بملف موظف." />
      </>
    );
  }

  const plan = await db.monthlyPlan.findUnique({
    where: { employeeId_year_month: { employeeId: user.employeeId, year, month } },
    include: { goals: { orderBy: { sortOrder: "asc" }, include: { notionDataSource: { select: { name: true } } } } },
  });
  const header = (
    <PageHeader
      title="أهدافي"
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {monthLabel(year, month)} {plan && <EnumBadge map={PLAN_STATUS_LABELS} value={plan.status} />}
        </span>
      }
      actions={<MonthPicker year={year} month={month} />}
    />
  );
  if (!plan || plan.goals.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={Target} title={`لا توجد أهداف لشهر ${monthLabel(year, month)}`} description="سيقوم المدير بإنشاء خطتك الشهرية وأهدافها." />
      </>
    );
  }

  const goals = plan.goals.map(serializeGoal);
  const active = goals.filter((g) => g.status !== "CANCELLED");
  const totals = breakdownTotals(plan.goals);
  const progress = weightedProgress(plan.goals);
  const revisionRate = totals.completed + totals.needsRevision > 0 ? (totals.needsRevision / (totals.completed + totals.needsRevision)) * 100 : null;

  return (
    <div className="space-y-6">
      {header}
      <div className="space-y-3">
        <SectionTitle>الإنتاجية</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="الإنجاز الموزون" value={formatPct(progress)} icon={Target} footer={<ProgressBar value={progress} size="sm" />} />
          <StatCard label="أهداف مكتملة" value={`${formatNumber(active.filter((g) => g.status === "COMPLETED").length)}/${formatNumber(active.length)}`} icon={CheckCircle2} tone="success" />
          <StatCard label="عناصر Notion مكتملة" value={formatNumber(totals.completed)} hint={`تم العمل على ${formatNumber(totals.worked)}`} tone="info" />
          <StatCard label="بانتظار الاعتماد" value={formatNumber(totals.pendingApproval)} tone="pending" />
        </div>
      </div>
      <div className="space-y-3">
        <SectionTitle>الجودة</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="نسبة الاعتماد" value={formatPct(totals.approvalRate)} icon={BadgeCheck} tone="success" />
          <StatCard label="نسبة إعادة العمل" value={formatPct(revisionRate, 1)} icon={RotateCcw} tone={revisionRate && revisionRate > 10 ? "warning" : "neutral"} hint={`يحتاج تحسين حاليًا: ${formatNumber(totals.needsRevision)}`} />
          <StatCard label="عناصر أعيدت للتحسين" value={formatNumber(totals.reworkCount)} tone={totals.reworkCount ? "warning" : "neutral"} />
        </div>
      </div>

      {KPI_CATEGORIES.map((cat) => {
        const list = goals.filter((g) => g.category === cat);
        if (list.length === 0) return null;
        return (
          <section key={cat}>
            <SectionTitle>أهداف {KPI_CATEGORY_LABELS[cat].label}</SectionTitle>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((g) => (
                <GoalDetailCard key={g.id} goal={g} today={now.today} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
