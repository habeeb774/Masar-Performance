import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { canAccessEmployee, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/server/db";
import { getCompany } from "@/server/services/company";
import { todayKey, toDateKey } from "@/lib/dates";
import { num } from "@/lib/num";
import { isOverdue } from "@/lib/goal-status";
import { FocusMode } from "@/features/tasks/focus-mode";
import type { DailyTaskRow } from "@/server/queries/tasks";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "وضع التركيز" };

/** Distraction-free single-task view. Only daily tasks are supported for now. */
export default async function FocusPage({ params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId: id } = await params;

  const daily = await db.dailyTask.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true } }, monthlyGoal: { select: { name: true, unit: true, source: true } } },
  });

  if (!daily) {
    const adHoc = await db.adHocTask.findUnique({ where: { id }, select: { id: true } });
    if (adHoc) {
      return (
        <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-lg font-semibold">غير متاح لهذا النوع من المهام</p>
          <p className="text-sm text-muted-foreground">وضع التركيز متاح حاليًا للمهام اليومية فقط.</p>
          <Button asChild>
            <Link href="/my-tasks">العودة لمهامي</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg font-semibold">المهمة غير موجودة</p>
        <Button asChild>
          <Link href="/my-tasks">العودة لمهامي</Link>
        </Button>
      </div>
    );
  }

  if (!canAccessEmployee(user, daily.employeeId)) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg font-semibold">لا تملك صلاحية الوصول لهذه المهمة</p>
        <Button asChild>
          <Link href="/my-tasks">العودة لمهامي</Link>
        </Button>
      </div>
    );
  }

  const company = await getCompany();
  const today = todayKey(company.timezone);
  const deadline = daily.deadline ? toDateKey(daily.deadline) : null;
  const date = toDateKey(daily.date);

  const row: DailyTaskRow = {
    id: daily.id,
    kind: "daily",
    employeeId: daily.employeeId,
    employeeName: daily.employee.fullName,
    title: daily.title,
    description: daily.description,
    date,
    deadline,
    target: num(daily.target),
    achieved: num(daily.achieved),
    progress: daily.progress,
    status: daily.status,
    source: daily.source,
    priority: daily.priority,
    notes: daily.notes,
    delayReason: daily.delayReason,
    monthlyGoalId: daily.monthlyGoalId,
    goalName: daily.monthlyGoal?.name ?? null,
    unit: daily.monthlyGoal?.unit ?? null,
    notionDriven: daily.monthlyGoal?.source === "NOTION" && daily.source !== "MANUAL",
    overdue:
      daily.status === "DELAYED" ||
      isOverdue(daily.status, deadline, today) ||
      (daily.source === "MANUAL" && date < today && (daily.status === "NOT_STARTED" || daily.status === "IN_PROGRESS")),
  };

  const canManage = hasPermission(user, PERMISSIONS.TASKS_ASSIGN);
  return <FocusMode task={row} currentUserId={user.id} canManage={canManage} />;
}
