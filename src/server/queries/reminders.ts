import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { reminderWhere } from "@/server/services/reminders";
import { getCompany } from "@/server/services/company";
import { addDays, fromDateKey, startOfWeek, toDateKey, todayKey } from "@/lib/dates";

export type ReminderRow = {
  id: string;
  title: string;
  details: string | null;
  remindOn: string;
  priority: "NORMAL" | "IMPORTANT";
  status: "OPEN" | "POSTPONED" | "APPROVED" | "CANCELLED";
  employeeId: string | null;
  employeeName: string | null;
  ownerName: string;
  mine: boolean;
  taskId: string | null;
  taskTitle: string | null;
};

/** The notebook grouped by reminder date. Closed notes (approved / cancelled) are listed apart. */
export async function getReminders(user: AuthUser) {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  // «this week»: the employee's running 7-day weekly plan, else a full calendar week — never cut at a month end
  const running = user.employeeId
    ? await db.weeklyPlan.findFirst({ where: { employeeId: user.employeeId, startDate: { lte: fromDateKey(today) }, endDate: { gte: fromDateKey(today) } }, select: { endDate: true } })
    : null;
  const weekEnd = running ? toDateKey(running.endDate) : addDays(startOfWeek(today, company.weekStartDay), 6);
  const rows = await db.reminder.findMany({
    where: { AND: [reminderWhere(user), { status: { not: "CANCELLED" } }] },
    include: { employee: { select: { fullName: true } }, owner: { select: { name: true } }, adHocTask: { select: { id: true, title: true } } },
    orderBy: [{ remindOn: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
  });
  const list: ReminderRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    details: r.details,
    remindOn: toDateKey(r.remindOn),
    priority: r.priority,
    status: r.status,
    employeeId: r.employeeId,
    employeeName: r.employee?.fullName ?? null,
    ownerName: r.owner.name,
    mine: r.ownerId === user.id,
    taskId: r.adHocTask?.id ?? null,
    taskTitle: r.adHocTask?.title ?? null,
  }));
  const open = list.filter((r) => r.status === "OPEN" || r.status === "POSTPONED");
  return {
    today,
    overdue: open.filter((r) => r.remindOn < today),
    today_: open.filter((r) => r.remindOn === today),
    thisWeek: open.filter((r) => r.remindOn > today && r.remindOn <= weekEnd),
    later: open.filter((r) => r.remindOn > weekEnd),
    approved: list.filter((r) => r.status === "APPROVED").reverse().slice(0, 20),
  };
}

/** Count for the small «تذكيرات متأخرة» nudge on the home page (own notes only). */
export async function overdueReminderCount(user: AuthUser) {
  const company = await getCompany();
  return db.reminder.count({ where: { ownerId: user.id, status: { in: ["OPEN", "POSTPONED"] }, remindOn: { lte: new Date(`${todayKey(company.timezone)}T00:00:00Z`) } } });
}
