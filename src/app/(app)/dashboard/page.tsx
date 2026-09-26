import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getEmployeeDashboard, getManagerDashboard } from "@/server/queries/dashboard";
import { EmployeeDashboard } from "@/features/dashboard/employee-dashboard";
import { ManagerDashboard } from "@/features/dashboard/manager-dashboard";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { UserX } from "lucide-react";

export const metadata: Metadata = { title: "لوحة التحكم" };

export default async function DashboardPage() {
  const user = await requireUser();
  if (hasPermission(user, PERMISSIONS.EMPLOYEES_VIEW_ALL)) {
    const data = await getManagerDashboard(user);
    return <ManagerDashboard name={user.employeeName ?? user.name} data={data} />;
  }
  if (!user.employeeId) {
    return (
      <>
        <PageHeader title={`السلام عليكم، ${user.name}`} />
        <EmptyState icon={UserX} title="حسابك غير مرتبط بملف موظف" description="اطلب من مدير النظام ربط حسابك بملف موظف لعرض مهامك وأهدافك." />
      </>
    );
  }
  const data = await getEmployeeDashboard(user);
  return <EmployeeDashboard name={user.employeeName ?? user.name} userId={user.id} data={data} />;
}
