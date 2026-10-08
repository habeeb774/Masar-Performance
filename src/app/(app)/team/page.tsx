import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { PERMISSIONS } from "@/lib/permissions";
import { monthLabel } from "@/lib/dates";
import { requirePermission } from "@/server/auth/session";
import { getManagerDashboard } from "@/server/queries/dashboard";
import { STANDING } from "@/features/team/standing";

export const metadata: Metadata = { title: "الفريق" };

/** One row per employee, people needing attention first. Details live on the employee page. */
export default async function TeamPage() {
  const user = await requirePermission(PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE, PERMISSIONS.TASKS_ASSIGN, PERMISSIONS.EMPLOYEES_VIEW_ALL, PERMISSIONS.PERFORMANCE_REVIEW);
  const data = await getManagerDashboard(user);

  return (
    <>
      <PageHeader title="الفريق" description={`إنجاز ${monthLabel(data.year, data.month)} — الأكثر حاجة لانتباهك أولًا`} />
      <Card>
        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState icon={Users} title="لا يوجد موظفون بعد" description="أضف موظفيك من صفحة الموظفين." />
          ) : (
            <ul className="divide-y">
              {data.rows.map((r) => {
                const s = STANDING[r.standing];
                return (
                  <li key={r.id}>
                    <Link href={`/employees/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 hover:bg-accent/30 sm:flex-nowrap">
                      <div className="min-w-0 flex-1 basis-40">
                        <div className="truncate font-medium">{r.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.role}</div>
                      </div>
                      <div className="flex basis-full items-center gap-2 sm:w-56 sm:basis-auto">
                        {r.planId ? (
                          <>
                            <ProgressBar value={r.monthly} size="sm" className="flex-1" />
                            <span className="w-10 text-end text-sm font-medium tabular-nums">{Math.round(r.monthly)}%</span>
                          </>
                        ) : (
                          <span className="flex-1 text-xs text-muted-foreground">لم تُعد خطة هذا الشهر</span>
                        )}
                      </div>
                      <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                      <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                        <span>
                          فتح <ArrowLeft />
                        </span>
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
