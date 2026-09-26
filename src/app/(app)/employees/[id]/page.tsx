import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Building2, CalendarDays, Mail, Phone, Target, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, NotionSyncedTag, PageHeader } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import type { IdParams, SearchParams } from "@/lib/params";
import { int } from "@/lib/params";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { GOAL_STATUS_LABELS, PLAN_STATUS_LABELS } from "@/lib/labels";
import { formatDateAr, monthLabel } from "@/lib/dates";
import { formatNumber, formatPct } from "@/lib/num";
import { requireEmployeeAccess } from "@/server/auth/session";
import { getEmployeeProfile, getPerformanceHistory } from "@/server/queries/performance";
import { PerformanceHistory } from "@/features/performance/performance-history";
import { EMPLOYEE_STATUS_OPTIONS, EMPLOYEE_STATUS_TONE } from "@/features/employees/constants";

export const metadata: Metadata = { title: "ملف الموظف" };

export default async function EmployeeProfilePage({ params, searchParams }: { params: IdParams; searchParams: SearchParams }) {
  const { id } = await params;
  const user = await requireEmployeeAccess(id);
  const sp = await searchParams;
  const range = int(sp.range, 6) === 12 ? 12 : 6;
  const isSelf = user.employeeId === id;
  const isReviewer = !isSelf && (hasPermission(user, PERMISSIONS.PERFORMANCE_REVIEW) || hasPermission(user, PERMISSIONS.PERFORMANCE_APPROVE));
  const [profile, history] = await Promise.all([getEmployeeProfile(id), getPerformanceHistory(id, range, !isReviewer)]);
  if (!profile) notFound();
  const { employee: e, plan } = profile;

  const contacts = [
    { icon: Briefcase, label: e.jobTitle ?? "بدون مسمى وظيفي" },
    { icon: Building2, label: e.department ?? "بدون إدارة" },
    { icon: Mail, label: e.email, ltr: true },
    ...(e.phone ? [{ icon: Phone, label: e.phone, ltr: true }] : []),
    ...(e.hireDate ? [{ icon: CalendarDays, label: `منذ ${formatDateAr(e.hireDate)}` }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={e.fullName}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge tone={EMPLOYEE_STATUS_TONE[e.status] ?? "neutral"}>{EMPLOYEE_STATUS_OPTIONS.find((s) => s.value === e.status)?.label ?? e.status}</StatusBadge>
            <span>{e.roleName}</span>
            {e.employeeNo && <span dir="ltr">#{e.employeeNo}</span>}
          </span>
        }
        actions={
          hasPermission(user, PERMISSIONS.EMPLOYEES_VIEW_ALL) || hasPermission(user, PERMISSIONS.EMPLOYEES_MANAGE) ? (
            <Button variant="outline" asChild>
              <Link href="/employees">
                كل الموظفين <ArrowLeft />
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-4 text-muted-foreground" /> البيانات الأساسية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {contacts.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <c.icon className="size-4 shrink-0 text-muted-foreground" />
                <span dir={c.ltr ? "ltr" : undefined} className="truncate">
                  {c.label}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t pt-2.5">
              <span className="text-muted-foreground">المدير المباشر:</span>
              {e.manager ? (
                <Link href={`/employees/${e.manager.id}`} className="font-medium hover:underline">
                  {e.manager.fullName}
                </Link>
              ) : (
                <span>—</span>
              )}
            </div>
            {e.notionAlias && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">الاسم في Notion:</span>
                <span className="font-medium">{e.notionAlias}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="size-4 text-muted-foreground" /> خطة {monthLabel(profile.year, profile.month)}
              </CardTitle>
              {plan && (
                <CardDescription className="mt-1 flex items-center gap-2">
                  <EnumBadge map={PLAN_STATUS_LABELS} value={plan.status} /> {plan.goals.length} هدف
                </CardDescription>
              )}
            </div>
            {plan && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/monthly-plans/${plan.id}`}>
                  عرض الخطة <ArrowLeft />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!plan ? (
              <EmptyState icon={Target} title="لا توجد خطة لهذا الشهر" description="تظهر الأهداف هنا بعد إنشاء الخطة الشهرية للموظف." className="py-6" />
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">الإنجاز الموزون</span>
                    <span className="font-semibold tabular-nums">{formatPct(plan.progress)}</span>
                  </div>
                  <ProgressBar value={plan.progress} size="lg" />
                </div>
                {plan.goals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لم تُضف أهداف للخطة بعد.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {plan.goals.map((g) => (
                      <li key={g.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{g.name}</span>
                            {g.source === "NOTION" && <NotionSyncedTag />}
                            <EnumBadge map={GOAL_STATUS_LABELS} value={g.status} />
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {formatNumber(g.achieved)} / {formatNumber(g.target)} {g.unit} · الوزن {formatNumber(g.weight)}%
                          </p>
                        </div>
                        <ProgressBar value={g.progress} showLabel size="sm" className="sm:w-48" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PerformanceHistory rows={history} range={range} basePath={`/employees/${id}`} reviewHref={isReviewer || isSelf ? (rid) => `/performance/reviews/${rid}` : undefined} />
    </div>
  );
}
