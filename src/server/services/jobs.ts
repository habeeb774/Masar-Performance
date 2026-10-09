import "server-only";
import { db } from "@/server/db";
import { addDays, diffDays, fromDateKey, toDateKey, todayKey } from "@/lib/dates";
import { currentPlanWhere, planSpan } from "./periods";
import { num } from "@/lib/num";
import { dueDataSources, syncDataSource } from "@/server/notion/sync";
import { getCompanyFresh } from "./company";
import { notifyUsers } from "./notifications";
import { ensureDueReports, refreshDraftsForDataSource } from "./reports";
import { recomputeAllActive, recomputeForDataSource } from "./progress";
import { PERMISSIONS } from "@/lib/permissions";
import { ensureThursdayRecurringTasks } from "./recurring-tasks";

/** Notify owners when items were sent back for revision during a sync. */
export async function notifyRevisions(itemIds: string[]) {
  if (itemIds.length === 0) return;
  const items = await db.notionSyncedItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, title: true, url: true, employee: { select: { userId: true } }, dataSourceId: true },
  });
  for (const item of items) {
    const owners = await db.notionFieldMapping.findMany({
      where: { dataSourceId: item.dataSourceId, role: "STATUS", ownerEmployeeId: { not: null } },
      select: { ownerEmployee: { select: { userId: true } } },
    });
    const userIds = [item.employee?.userId, ...owners.map((o) => o.ownerEmployee?.userId)].filter((x): x is string => !!x);
    await notifyUsers(userIds, {
      type: "ITEM_RETURNED_FOR_REVISION",
      title: "تمت إعادة عنصر للتحسين",
      body: item.title,
      link: item.url ?? "/my-tasks",
    });
  }
}

async function adminUserIds() {
  const users = await db.user.findMany({
    where: { status: "ACTIVE", role: { permissions: { some: { permission: { key: { in: [PERMISSIONS.NOTION_MANAGE, PERMISSIONS.SYSTEM_ADMIN] } } } } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function runScheduledSync() {
  const due = await dueDataSources();
  const results = [];
  for (const ds of due) {
    const r = await syncDataSource(ds.id, "SCHEDULED");
    results.push({ id: ds.id, status: r.status, scanned: r.scanned, created: r.created, updated: r.updated });
    await notifyRevisions(r.newRevisionItemIds);
    if (r.status === "FAILED") {
      await notifyUsers(await adminUserIds(), {
        type: "SYNC_FAILED",
        title: "فشلت مزامنة Notion",
        body: r.errors[0]?.message ?? null,
        link: "/notion/sync-logs",
        dedupeKey: `sync-failed:${r.logId}`,
      });
    }
    if (r.created + r.updated > 0) {
      await recomputeForDataSource(ds.id);
      await refreshDraftsForDataSource(ds.id);
    }
  }
  return results;
}

/**
 * Daily housekeeping — safe to run many times a day (dedupe keys make
 * reminders idempotent):
 * - move approved plans of the current month to IN_PROGRESS, close last month
 * - generate missing weekly drafts for ended weeks and monthly drafts at month
 *   end (the same idempotent routine also runs lazily when reports are opened)
 * - reminders (week ending, low progress, pending approvals, month ending)
 */
export async function runDailyJobs() {
  const company = await getCompanyFresh();
  const today = todayKey(company.timezone);
  const summary: Record<string, number> = {};

  summary.plansStarted = (
    await db.monthlyPlan.updateMany({ where: { ...currentPlanWhere(today), status: "APPROVED" }, data: { status: "IN_PROGRESS" } })
  ).count;
  const executing = await db.monthlyPlan.findMany({ where: { status: { in: ["APPROVED", "IN_PROGRESS"] } }, include: { weeklyPlans: true, employee: { select: { userId: true } } } });
  const ended: string[] = [];
  for (const plan of executing) if ((await planSpan(plan)).end < today) ended.push(plan.id);
  summary.plansCompleted = (
    await db.monthlyPlan.updateMany({
      where: { id: { in: ended } },
      data: { status: "COMPLETED" },
    })
  ).count;

  await recomputeAllActive();

  summary.recurringTasks = await ensureThursdayRecurringTasks(today);

  summary.goalsWithNewTasks = await ensureMissingGoalTasks();
  summary.evaluations = await ensureDraftEvaluations(today);

  const generated = await ensureDueReports({ employeeIds: "ALL", notify: true });
  summary.weeklyReports = generated.weekly;
  summary.monthlyReports = generated.monthly;
  summary.reportFailures = generated.failed;

  // reminders on the current week
  const weeks = await db.weeklyPlan.findMany({
    where: { startDate: { lte: fromDateKey(today) }, endDate: { gte: fromDateKey(today) }, monthlyPlan: { status: { in: ["APPROVED", "IN_PROGRESS"] } } },
    include: { employee: { select: { userId: true } }, goals: { include: { monthlyGoal: { select: { weight: true, status: true } } } } },
  });
  let reminders = 0;
  for (const w of weeks) {
    const daysLeft = diffDays(toDateKey(w.endDate), today);
    const active = w.goals.filter((g) => g.monthlyGoal.status !== "CANCELLED");
    const weightSum = active.reduce((a, g) => a + num(g.monthlyGoal.weight), 0);
    const progress =
      active.length === 0
        ? 100
        : weightSum > 0
          ? active.reduce((a, g) => a + Math.min(num(g.progressPct), 100) * num(g.monthlyGoal.weight), 0) / weightSum
          : active.reduce((a, g) => a + Math.min(num(g.progressPct), 100), 0) / active.length;
    if (daysLeft === 2) {
      await notifyUsers([w.employee.userId], {
        type: "WEEK_ENDING",
        title: "بقي يومان على نهاية الأسبوع",
        body: `إنجازك الحالي ${Math.round(progress)}%`,
        link: "/my-week",
        dedupeKey: `week-ending:${w.id}`,
      });
      reminders++;
    }
    if (daysLeft <= 2 && progress < 60) {
      await notifyUsers([w.employee.userId], {
        type: "LOW_WEEKLY_PROGRESS",
        title: `لم تحقق إلا ${Math.round(progress)}% من هدف الأسبوع`,
        link: "/my-week",
        dedupeKey: `low-progress:${w.id}`,
      });
      reminders++;
    }
  }

  // month ending
    for (const p of executing) {
      if (diffDays((await planSpan(p)).end, today) !== 3) continue;
      await notifyUsers([p.employee.userId], {
        type: "MONTH_ENDING",
        title: "بقي 3 أيام على نهاية فترة التنفيذ",
        link: "/my-plan",
        dedupeKey: `month-ending:${p.id}`,
      });
      reminders++;
    }

  // pending approvals per employee (Notion items waiting for approval)
  const pending = await db.notionItemStage.groupBy({
    by: ["itemId"],
    where: { systemStatus: "PENDING_APPROVAL", item: { isArchived: false, employeeId: { not: null } } },
  });
  if (pending.length > 0) {
    const byEmployee = await db.notionSyncedItem.groupBy({
      by: ["employeeId"],
      where: { id: { in: pending.map((p) => p.itemId) } },
      _count: { _all: true },
    });
    for (const row of byEmployee) {
      if (!row.employeeId) continue;
      const emp = await db.employee.findUnique({ where: { id: row.employeeId }, select: { userId: true } });
      if (!emp) continue;
      await notifyUsers([emp.userId], {
        type: "PENDING_APPROVAL_ITEMS",
        title: `لديك ${row._count._all} عنصر بانتظار الاعتماد`,
        link: "/my-tasks",
        dedupeKey: `pending:${row.employeeId}:${today}`,
      });
      reminders++;
    }
  }
  summary.reminders = reminders;

  // housekeeping
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  return summary;
}

/**
 * Every running (or recently ended) plan gets its official evaluation draft automatically, so the
 * manager only reviews and approves — no «إنشاء التقييم» click. Existing evaluations are left as they are.
 */
export async function ensureDraftEvaluations(today: string) {
  const since = fromDateKey(addDays(today, -45));
  const plans = await db.monthlyPlan.findMany({
    where: { status: { in: ["IN_PROGRESS", "COMPLETED"] }, evaluation: null, executionEndDate: { gte: since } },
    select: { employeeId: true, year: true, month: true },
  });
  const { createEvaluation } = await import("./evaluation");
  let created = 0;
  for (const p of plans) {
    try {
      await createEvaluation(null, p.employeeId, p.year, p.month);
      created++;
    } catch (e) {
      console.error("[jobs] draft evaluation failed", p, e);
    }
  }
  return created;
}

/**
 * Self-heal: every goal of a running plan that has no daily task at all (e.g. a plan from before
 * automatic distribution) gets its tasks generated. Goals that already have tasks are never
 * re-split, so no target can be inflated.
 */
export async function ensureMissingGoalTasks() {
  const goals = await db.monthlyGoal.findMany({
    where: { status: { not: "CANCELLED" }, targetValue: { gt: 0 }, plan: { status: { in: ["APPROVED", "IN_PROGRESS"] } }, dailyTasks: { none: {} } },
    select: { id: true, planId: true },
  });
  const byPlan = new Map<string, string[]>();
  for (const g of goals) byPlan.set(g.planId, [...(byPlan.get(g.planId) ?? []), g.id]);
  const { autoDistributePlan, ensureWeeklyPlans } = await import("./plans");
  const { recomputePlan } = await import("./progress");
  for (const [planId, ids] of byPlan) {
    try {
      // a plan from before automatic distribution may have no weeks / weekly targets at all
      await ensureWeeklyPlans(planId);
      await autoDistributePlan(planId, null, { onlyGoalIds: ids });
      await recomputePlan(planId);
    } catch (e) {
      console.error("[jobs] task self-heal failed", planId, e);
    }
  }
  return goals.length;
}
