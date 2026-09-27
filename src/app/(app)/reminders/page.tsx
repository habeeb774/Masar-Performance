import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getReminders } from "@/server/queries/reminders";
import { getScopeEmployees } from "@/server/queries/tasks";
import { PageHeader } from "@/components/shared/page";
import { ReminderNotebook } from "@/features/reminders/reminder-notebook";

export const metadata: Metadata = { title: "ملاحظات وتذكيرات" };

export default async function RemindersPage() {
  const user = await requireUser();
  const canAssign = hasPermission(user, PERMISSIONS.TASKS_ASSIGN);
  const [data, employees] = await Promise.all([getReminders(user), canAssign || user.employeeId ? getScopeEmployees(user) : Promise.resolve([])]);
  return (
    <>
      <PageHeader title="ملاحظات وتذكيرات" description="دفتر سريع للأفكار والمهام المقترحة. لا تدخل في المهام أو الخطة أو التقييم إلا بعد اعتمادها وتحويلها إلى مهمة." />
      <ReminderNotebook data={data} employees={employees} canAssign={canAssign} selfEmployeeId={user.employeeId} />
    </>
  );
}
