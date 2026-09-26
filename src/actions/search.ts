"use server";

import { db } from "@/server/db";
import { actionUser, employeeWhere } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchResultGroup {
  key: "tasks" | "goals" | "employees";
  label: string;
  items: SearchResultItem[];
}

const TAKE = 5;

/**
 * Global search across daily/ad-hoc tasks, monthly goals, and (when permitted)
 * employees — all scoped through `employeeWhere` exactly like the rest of the app.
 */
export async function globalSearchAction(query: string): Promise<SearchResultGroup[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const user = await actionUser();
  const scope = employeeWhere(user);
  const groups: SearchResultGroup[] = [];

  if (user.employeeId || hasPermission(user, PERMISSIONS.EMPLOYEES_VIEW_ALL) || hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) {
    const [dailyTasks, adHocTasks, goals] = await Promise.all([
      db.dailyTask.findMany({
        where: { ...scope, title: { contains: q, mode: "insensitive" } },
        select: { id: true, title: true, date: true, employee: { select: { fullName: true } } },
        orderBy: { date: "desc" },
        take: TAKE,
      }),
      db.adHocTask.findMany({
        where: { ...scope, title: { contains: q, mode: "insensitive" } },
        select: { id: true, title: true, assignedDate: true, employee: { select: { fullName: true } } },
        orderBy: { assignedDate: "desc" },
        take: TAKE,
      }),
      db.monthlyGoal.findMany({
        where: { ...scope, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, plan: { select: { id: true, year: true, month: true } }, employee: { select: { fullName: true } } },
        take: TAKE,
      }),
    ]);

    const taskItems: SearchResultItem[] = [
      ...dailyTasks.map((t) => ({
        id: `daily-${t.id}`,
        title: t.title,
        subtitle: t.employee.fullName,
        href: `/my-tasks?highlight=${t.id}`,
      })),
      ...adHocTasks.map((t) => ({
        id: `adhoc-${t.id}`,
        title: t.title,
        subtitle: t.employee.fullName,
        href: `/my-tasks?highlight=${t.id}`,
      })),
    ].slice(0, TAKE);
    if (taskItems.length > 0) groups.push({ key: "tasks", label: "المهام", items: taskItems });

    if (goals.length > 0) {
      groups.push({
        key: "goals",
        label: "الأهداف الشهرية",
        items: goals.map((g) => ({
          id: g.id,
          title: g.name,
          subtitle: g.employee.fullName,
          href: `/monthly-plans/${g.plan.id}`,
        })),
      });
    }
  }

  if (hasPermission(user, PERMISSIONS.EMPLOYEES_VIEW_ALL)) {
    const employees = await db.employee.findMany({
      where: { fullName: { contains: q, mode: "insensitive" } },
      select: { id: true, fullName: true, jobTitle: { select: { name: true } } },
      take: TAKE,
    });
    if (employees.length > 0) {
      groups.push({
        key: "employees",
        label: "الموظفون",
        items: employees.map((e) => ({
          id: e.id,
          title: e.fullName,
          subtitle: e.jobTitle?.name ?? undefined,
          href: `/employees/${e.id}`,
        })),
      });
    }
  }

  return groups;
}
