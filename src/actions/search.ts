"use server";

import { db } from "@/server/db";
import { actionUser, employeeWhere } from "@/server/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { matchIntentActions } from "@/lib/intent-actions";

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchResultGroup {
  key: "actions" | "tasks" | "goals" | "employees";
  label: string;
  items: SearchResultItem[];
}

const TAKE = 5;

/** Runs one search section in isolation: a failure there must never take down the rest of the search. */
async function section<T>(name: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[search:${name}]`, e);
    return fallback;
  }
}

/**
 * Global search across daily/ad-hoc tasks, monthly goals, and (when permitted)
 * employees — all scoped through `employeeWhere` exactly like the rest of the app.
 * Every section is queried independently so one failing query still lets the
 * others render instead of failing the whole search.
 */
export async function globalSearchAction(query: string): Promise<SearchResultGroup[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const user = await actionUser();
  const scope = employeeWhere(user);
  const groups: SearchResultGroup[] = [];

  // what the user wants to do («خطة جديدة», «اعتماد التقييم», «تصدير اكسل») comes first
  const actions = matchIntentActions(q, user.permissions, !!user.employeeId);
  if (actions.length > 0) groups.push({ key: "actions", label: "ماذا تريد أن تفعل؟", items: actions.map((a) => ({ id: `action-${a.id}`, title: a.label, subtitle: a.hint, href: a.href })) });

  if (user.employeeId || hasPermission(user, PERMISSIONS.EMPLOYEES_VIEW_ALL) || hasPermission(user, PERMISSIONS.TASKS_ASSIGN)) {
    const [dailyTasks, adHocTasks, goals] = await Promise.all([
      section("daily-tasks", [] as { id: string; title: string; employee: { fullName: string } }[], () =>
        db.dailyTask.findMany({
          where: { ...scope, title: { contains: q, mode: "insensitive" } },
          select: { id: true, title: true, date: true, employee: { select: { fullName: true } } },
          orderBy: { date: "desc" },
          take: TAKE,
        }),
      ),
      section("adhoc-tasks", [] as { id: string; title: string; employee: { fullName: string } }[], () =>
        db.adHocTask.findMany({
          where: { ...scope, title: { contains: q, mode: "insensitive" } },
          select: { id: true, title: true, assignedDate: true, employee: { select: { fullName: true } } },
          orderBy: { assignedDate: "desc" },
          take: TAKE,
        }),
      ),
      section("goals", [] as { id: string; name: string; plan: { id: string } | null; employee: { fullName: string } }[], () =>
        db.monthlyGoal.findMany({
          where: { ...scope, name: { contains: q, mode: "insensitive" } },
          select: { id: true, name: true, plan: { select: { id: true, year: true, month: true } }, employee: { select: { fullName: true } } },
          take: TAKE,
        }),
      ),
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

    // a goal's plan should always exist, but never let a dangling relation break the whole search
    const goalsWithPlan = goals.filter((g) => g.plan);
    if (goalsWithPlan.length > 0) {
      groups.push({
        key: "goals",
        label: "الأهداف الشهرية",
        items: goalsWithPlan.map((g) => ({
          id: g.id,
          title: g.name,
          subtitle: g.employee.fullName,
          href: `/monthly-plans/${g.plan!.id}`,
        })),
      });
    }
  }

  if (hasPermission(user, PERMISSIONS.EMPLOYEES_VIEW_ALL)) {
    const employees = await section("employees", [] as { id: string; fullName: string; jobTitle: { name: string } | null }[], () =>
      db.employee.findMany({
        where: { fullName: { contains: q, mode: "insensitive" } },
        select: { id: true, fullName: true, jobTitle: { select: { name: true } } },
        take: TAKE,
      }),
    );
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
