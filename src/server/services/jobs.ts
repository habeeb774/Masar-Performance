import "server-only";
import { db } from "@/server/db";
import { addDays, diffDays, fromDateKey, monthEnd, monthLabel, shiftMonth, toDateKey, todayKey } from "@/lib/dates";
import { num } from "@/lib/num";
import { dueDataSources, syncDataSource } from "@/server/notion/sync";
import { getCompanyFresh } from "./company";
import { notifyUsers } from "./notifications";
import { generateMonthlyReport, generateWeeklyReport } from "./reports";
import { recomputeAllActive, recomputeForDataSource } from "./progress";
import { PERMISSIONS } from "@/lib/permissions";

/** Notify owners when items were sent back for revision during a sync. */
async function notifyRevisions(itemIds: string[]) {
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
    if (r.created + r.updated > 0) await recomputeForDataSource(ds.id);
  }
  return results;
}

/**
 * Daily housekeeping — safe to run many times a day (dedupe keys make
 * reminders idempotent):
 * - move approved plans of the current month to IN_PROGRESS, close last month
 * - generate weekly report drafts for ended weeks, monthly drafts at month end
 * - reminders (week ending, low progress, pending approvals, month ending)
 */
export async function runDailyJobs() {
  const company = await getCompanyFresh();
  const today = todayKey(company.timezone);
  const year = +today.slice(0, 4);
  const month = +today.slice(5, 7);
  const prev = shiftMonth(year, month, -1);
  const summary: Record<string, number> = {};

  summary.plansStarted = (
    await db.monthlyPlan.updateMany({ where: { year, month, status: "APPROVED" }, data: { status: "IN_PROGRESS" } })
  ).count;
  summary.plansCompleted = (
    await db.monthlyPlan.updateMany({
      where: { status: { in: ["APPROVED", "IN_PROGRESS"] }, OR: [{ year: { lt: prev.year } }, { year: prev.year, month: { lte: prev.month } }] },
      data: { status: "COMPLETED" },
    })
  ).count;

  await recomputeAllActive();

  // weekly reports for weeks that ended (up to 14 days back)
  const endedWeeks = await db.weeklyPlan.findMany({
    where: {
      endDate: { lt: fromDateKey(today), gte: fromDateKey(addDays(today, -14)) },
      report: null,
      monthlyPlan: { status: { in: ["APPROVED", "IN_PROGRESS", "COMPLETED"] } },
    },
    select: { id: true },
  });
  for (const w of endedWeeks) await generateWeeklyReport(w.id, { notify: true });
  summary.weeklyReports = endedWeeks.length;

  // monthly report drafts on the last day of the month or for last month's plans
  const lastDay = monthEnd(year, month) === today;
  const monthlyTargets = await db.monthlyPlan.findMany({
    where: {
      report: null,
      status: { in: ["APPROVED", "IN_PROGRESS", "COMPLETED"] },
      OR: [{ year: prev.year, month: prev.month }, ...(lastDay ? [{ year, month }] : [])],
    },
    select: { id: true, employee: { select: { userId: true } }, year: true, month: true },
  });
  for (const p of monthlyTargets) {
    const report = await generateMonthlyReport(p.id);
    await notifyUsers([p.employee.userId], {
      type: "WEEKLY_REPORT_READY",
      title: `التقرير الشهري لشهر ${monthLabel(p.year, p.month)} جاهز للمراجعة`,
      link: `/reports/monthly/${report.id}`,
      dedupeKey: `monthly-ready:${report.id}`,
    });
  }
  summary.monthlyReports = monthlyTargets.length;

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
  const daysToMonthEnd = diffDays(monthEnd(year, month), today);
  if (daysToMonthEnd === 3) {
    const plans = await db.monthlyPlan.findMany({ where: { year, month, status: { in: ["APPROVED", "IN_PROGRESS"] } }, select: { id: true, employee: { select: { userId: true } } } });
    for (const p of plans) {
      await notifyUsers([p.employee.userId], {
        type: "MONTH_ENDING",
        title: "بقي 3 أيام على نهاية الشهر",
        link: "/my-month",
        dedupeKey: `month-ending:${p.id}`,
      });
      reminders++;
    }
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
