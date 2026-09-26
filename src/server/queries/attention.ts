import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { employeeIdScope, employeeWhere } from "@/server/auth/session";
import { fromDateKey, monthEnd, monthStart, toDateKey, todayKey } from "@/lib/dates";
import { num } from "@/lib/num";
import { deriveGoalStatus } from "@/lib/goal-status";
import { getCompany } from "@/server/services/company";
import type { Tone } from "@/lib/labels";

export type AttentionType = "OVERDUE_EMPLOYEE" | "GOAL_AT_RISK" | "TASK_BLOCKED" | "WEEKLY_REPORT_MISSING" | "PENDING_APPROVAL";

export interface AttentionItem {
  id: string;
  type: AttentionType;
  severity: number;
  tone: Tone;
  text: string;
  href: string;
}

const OVERDUE_THRESHOLD = 3;
const BLOCKED_DAYS_THRESHOLD = 3;
const FEED_LIMIT = 8;

/**
 * A single prioritized "needs attention" feed synthesizing several existing
 * signals (overdue tasks, at-risk goals, stuck blocked tasks, missing weekly
 * reports, pending approvals) scoped to the manager's visible team.
 */
export async function getAttentionFeed(user: AuthUser): Promise<{ items: AttentionItem[]; total: number }> {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const todayDate = fromDateKey(today);
  const threeDaysAgo = fromDateKey(today);
  threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - BLOCKED_DAYS_THRESHOLD);
  const year = +today.slice(0, 4);
  const month = +today.slice(5, 7);
  const scope = employeeIdScope(user);
  const employeeFrag = scope === "ALL" ? {} : { id: { in: scope } };

  const employees = await db.employee.findMany({ where: { status: "ACTIVE", ...employeeFrag }, select: { id: true, fullName: true } });
  const ids = employees.map((e) => e.id);
  const nameOf = new Map(employees.map((e) => [e.id, e.fullName]));
  if (ids.length === 0) return { items: [], total: 0 };

  const [overdueDaily, overdueAdHoc, blockedDaily, blockedAdHoc, weeklyDue, atRiskGoals, reviewCounts] = await Promise.all([
    db.dailyTask.groupBy({
      by: ["employeeId"],
      where: { employeeId: { in: ids }, OR: [{ status: "DELAYED" }, { deadline: { lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED"] } }] },
      _count: { _all: true },
    }),
    db.adHocTask.groupBy({
      by: ["employeeId"],
      where: { employeeId: { in: ids }, dueDate: { lt: todayDate }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      _count: { _all: true },
    }),
    db.dailyTask.findMany({
      where: { employeeId: { in: ids }, status: "BLOCKED", updatedAt: { lte: threeDaysAgo } },
      select: { id: true, title: true, employeeId: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 50,
    }),
    db.adHocTask.findMany({
      where: { employeeId: { in: ids }, status: "BLOCKED", updatedAt: { lte: threeDaysAgo } },
      select: { id: true, title: true, employeeId: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 50,
    }),
    db.weeklyPlan.findMany({
      where: { employeeId: { in: ids }, endDate: { lt: todayDate }, OR: [{ report: null }, { report: { is: { status: "DRAFT" } } }] },
      select: { id: true, employeeId: true, endDate: true, weekIndex: true },
      orderBy: { endDate: "asc" },
      take: 50,
    }),
    db.monthlyGoal.findMany({
      where: { employeeId: { in: ids }, status: { notIn: ["CANCELLED", "COMPLETED", "PARTIAL"] }, plan: { year, month } },
      select: { id: true, name: true, employeeId: true, progressPct: true, startDate: true, dueDate: true, status: true },
      take: 200,
    }),
    getReviewCounts(user),
  ]);

  const overdueMap = new Map<string, number>();
  for (const r of [...overdueDaily, ...overdueAdHoc]) overdueMap.set(r.employeeId, (overdueMap.get(r.employeeId) ?? 0) + r._count._all);

  const items: AttentionItem[] = [];

  for (const [employeeId, count] of overdueMap) {
    if (count < OVERDUE_THRESHOLD) continue;
    const name = nameOf.get(employeeId);
    if (!name) continue;
    items.push({
      id: `overdue-${employeeId}`,
      type: "OVERDUE_EMPLOYEE",
      severity: 1000 + count,
      tone: "danger",
      text: `${name} لديه ${count} مهام متأخرة`,
      href: `/tasks?tab=daily&employee=${employeeId}&status=DELAYED`,
    });
  }

  const monthStartKey = monthStart(year, month);
  const monthEndKey = monthEnd(year, month);
  // one line per employee, not per goal — the manager needs "who", the details are one click away
  const riskByEmployee = new Map<string, { names: string[]; worst: number }>();
  for (const g of atRiskGoals) {
    if (!nameOf.has(g.employeeId)) continue;
    const start = g.startDate ? toDateKey(g.startDate) : monthStartKey;
    const end = g.dueDate ? toDateKey(g.dueDate) : monthEndKey;
    const derived = deriveGoalStatus({ current: g.status, progressPct: num(g.progressPct), start, end, today });
    if (derived !== "AT_RISK") continue;
    const entry = riskByEmployee.get(g.employeeId) ?? { names: [], worst: 0 };
    entry.names.push(g.name);
    entry.worst = Math.max(entry.worst, Math.round(100 - num(g.progressPct)));
    riskByEmployee.set(g.employeeId, entry);
  }
  for (const [employeeId, { names, worst }] of riskByEmployee) {
    const name = nameOf.get(employeeId)!;
    items.push({
      id: `goal-${employeeId}`,
      type: "GOAL_AT_RISK",
      severity: 800 + worst + names.length,
      tone: "warning",
      text: names.length === 1 ? `هدف "${names[0]}" لدى ${name} متأخر عن المسار` : `${names.length} أهداف لدى ${name} متأخرة عن المسار`,
      href: `/employees/${employeeId}`,
    });
  }

  for (const t of [...blockedDaily, ...blockedAdHoc]) {
    const name = nameOf.get(t.employeeId);
    if (!name) continue;
    const days = Math.max(1, Math.round((todayDate.getTime() - t.updatedAt.getTime()) / 86_400_000));
    items.push({
      id: `blocked-${t.id}`,
      type: "TASK_BLOCKED",
      severity: 700 + days,
      tone: "blocked",
      text: `مهمة "${t.title}" معلّقة منذ ${days} يومًا لدى ${name}`,
      href: `/tasks?tab=daily&employee=${t.employeeId}&status=BLOCKED`,
    });
  }

  const missingByEmployee = new Map<string, typeof weeklyDue>();
  for (const w of weeklyDue) if (nameOf.has(w.employeeId)) missingByEmployee.set(w.employeeId, [...(missingByEmployee.get(w.employeeId) ?? []), w]);
  for (const [employeeId, weeks] of missingByEmployee) {
    const name = nameOf.get(employeeId)!;
    const oldest = Math.max(1, Math.round((todayDate.getTime() - weeks[0].endDate.getTime()) / 86_400_000));
    items.push({
      id: `weekly-${employeeId}`,
      type: "WEEKLY_REPORT_MISSING",
      severity: 500 + oldest,
      tone: "pending",
      text: weeks.length === 1 ? `${name} لم يسلّم تقرير الأسبوع ${weeks[0].weekIndex}` : `${name} لم يسلّم ${weeks.length} تقارير أسبوعية`,
      href: `/review-center?tab=weekly`,
    });
  }

  if (reviewCounts.plans > 0) {
    items.push({
      id: "review-plans",
      type: "PENDING_APPROVAL",
      severity: 400 + reviewCounts.plans,
      tone: "pending",
      text: `${reviewCounts.plans} خطة شهرية بانتظار اعتمادك`,
      href: "/review-center?tab=plans",
    });
  }
  if (reviewCounts.weekly > 0) {
    items.push({
      id: "review-weekly",
      type: "PENDING_APPROVAL",
      severity: 400 + reviewCounts.weekly,
      tone: "pending",
      text: `${reviewCounts.weekly} تقرير أسبوعي بانتظار المراجعة`,
      href: "/review-center?tab=weekly",
    });
  }
  if (reviewCounts.monthly > 0) {
    items.push({
      id: "review-monthly",
      type: "PENDING_APPROVAL",
      severity: 400 + reviewCounts.monthly,
      tone: "pending",
      text: `${reviewCounts.monthly} تقرير شهري بانتظار المراجعة`,
      href: "/review-center?tab=monthly",
    });
  }

  items.sort((a, b) => b.severity - a.severity);
  return { items: items.slice(0, FEED_LIMIT), total: items.length };
}

async function getReviewCounts(user: AuthUser) {
  const scope = employeeWhere(user);
  const [weekly, monthly, plans] = await Promise.all([
    db.weeklyReport.count({ where: { ...scope, status: { in: ["SUBMITTED", "REVIEWED"] } } }),
    db.monthlyReport.count({ where: { ...scope, status: { in: ["SUBMITTED", "REVIEWED"] } } }),
    db.monthlyPlan.count({ where: { ...scope, status: "SUBMITTED" } }),
  ]);
  return { weekly, monthly, plans };
}
