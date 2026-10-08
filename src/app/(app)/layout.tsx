import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { visibleNav } from "@/components/layout/nav";
import { employeeWhere, requireUser } from "@/server/auth/session";
import { getCompany } from "@/server/services/company";
import { fromDateKey, todayKey } from "@/lib/dates";
import { db } from "@/server/db";
import { unreadCount } from "@/server/services/notifications";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

async function reviewBadge(user: Awaited<ReturnType<typeof requireUser>>) {
  if (!hasPermission(user, PERMISSIONS.REVIEW_CENTER)) return 0;
  // decisions in the manager's own scope: reports, plans and evaluations whose period is over
  const scope = employeeWhere(user);
  const today = fromDateKey(todayKey((await getCompany()).timezone));
  const [weekly, monthly, plans, evaluations] = await Promise.all([
    db.weeklyReport.count({ where: { ...scope, status: "SUBMITTED" } }),
    db.monthlyReport.count({ where: { ...scope, status: "SUBMITTED" } }),
    db.monthlyPlan.count({ where: { ...scope, status: "SUBMITTED" } }),
    db.performanceEvaluation.count({ where: { ...scope, status: "DRAFT", periodEnd: { lte: today } } }),
  ]);
  return weekly + monthly + plans + evaluations;
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [unread, pendingReviews, jar] = await Promise.all([unreadCount(user.id), reviewBadge(user), cookies()]);
  const groups = visibleNav(user.permissions, !!user.employeeId);
  const defaultOpen = jar.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar groups={groups} badges={{ "/review-center": pendingReviews, "/notifications": unread }} />
      <SidebarInset className="min-w-0">
        <AppHeader user={{ name: user.employeeName ?? user.name, email: user.email, roleName: user.roleName, jobTitle: user.jobTitle }} unread={unread} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 pb-20 md:px-6 md:py-7 md:pb-7">{children}</main>
        {user.employeeId && <MobileBottomNav />}
      </SidebarInset>
    </SidebarProvider>
  );
}
