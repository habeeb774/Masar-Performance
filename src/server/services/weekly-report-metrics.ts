import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { WeeklyReportContent } from "@/lib/report-types";
import { planMetricsRefresh, snapshotDiffers, weeklyReportMetrics, weeklyText, type WeeklyReportMetrics } from "@/lib/weekly-report";

/**
 * WeeklyGoal = current truth, WeeklyReport.content = snapshot.
 *
 * - getWeeklyReportMetrics*: live metrics for the UI (one batched query, no N+1).
 * - refreshWeeklyReportMetrics*: keep the stored snapshot's numbers in line with the live
 *   weekly goals. Called once per plan at the end of recomputePlan, which every achievement
 *   change (manual entry, daily task, Notion sync, weight edit, redistribution) goes through.
 */

const liveGoalSelect = {
  weeklyPlanId: true,
  monthlyGoalId: true,
  targetValue: true,
  achievedValue: true,
  progressPct: true,
  breakdown: true,
  monthlyGoal: {
    select: { name: true, dutyName: true, unit: true, category: true, source: true, goalType: true, weight: true, status: true, sortOrder: true },
  },
} satisfies Prisma.WeeklyGoalSelect;

/** Live metrics for many weeks in a single query. */
export async function getWeeklyReportMetricsMany(weeklyPlanIds: string[]): Promise<Map<string, WeeklyReportMetrics>> {
  const ids = [...new Set(weeklyPlanIds)];
  const out = new Map<string, WeeklyReportMetrics>();
  if (ids.length === 0) return out;
  const rows = await db.weeklyGoal.findMany({ where: { weeklyPlanId: { in: ids } }, select: liveGoalSelect });
  const byWeek = new Map<string, typeof rows>();
  for (const r of rows) byWeek.set(r.weeklyPlanId, [...(byWeek.get(r.weeklyPlanId) ?? []), r]);
  for (const id of ids) out.set(id, weeklyReportMetrics(byWeek.get(id) ?? []));
  return out;
}

export async function getWeeklyReportMetrics(weeklyPlanId: string): Promise<WeeklyReportMetrics> {
  return (await getWeeklyReportMetricsMany([weeklyPlanId])).get(weeklyPlanId)!;
}

/** Statuses whose whole content (tasks, batches, text) may still be rebuilt. */
const REBUILDABLE = ["DRAFT", "RETURNED"];

/**
 * Refresh the stored reports of the given weeks:
 * - DRAFT / RETURNED: the whole snapshot is rebuilt from current data.
 * - SUBMITTED / REVIEWED / APPROVED: only the numbers (goals, totals, the numeric generated
 *   text) are updated; the first frozen totals are kept in `content.originalTotals`.
 * Employee notes, highlights, blockers, carry-over, the manager's comment and every
 * status date live in their own columns and are never written here.
 */
export async function refreshWeeklyReportMetricsMany(weeklyPlanIds: string[]) {
  if (weeklyPlanIds.length === 0) return 0;
  const reports = await db.weeklyReport.findMany({
    where: { weeklyPlanId: { in: weeklyPlanIds } },
    select: { id: true, weeklyPlanId: true, status: true, content: true, generatedText: true },
  });
  if (reports.length === 0) return 0;
  const live = await getWeeklyReportMetricsMany(reports.map((r) => r.weeklyPlanId));
  const now = new Date();
  let updated = 0;
  for (const r of reports) {
    const metrics = live.get(r.weeklyPlanId)!;
    const content = r.content as unknown as WeeklyReportContent;
    if (!snapshotDiffers(content, metrics)) continue;
    if (REBUILDABLE.includes(r.status)) {
      // a draft follows the data fully (lazy import: reports.ts depends on progress.ts)
      const { buildWeeklyContent } = await import("./reports");
      const fresh = await buildWeeklyContent(r.weeklyPlanId);
      await db.weeklyReport.update({
        where: { id: r.id },
        data: { content: fresh as unknown as Prisma.InputJsonValue, generatedText: weeklyText(fresh), generatedAt: now },
      });
    } else {
      const plan = planMetricsRefresh({ content, generatedText: r.generatedText }, metrics, now);
      if (!plan.changed) continue;
      await db.weeklyReport.update({
        where: { id: r.id },
        data: { content: plan.content as unknown as Prisma.InputJsonValue, generatedText: plan.generatedText },
      });
    }
    updated++;
  }
  return updated;
}

export async function refreshWeeklyReportMetrics(weeklyPlanId: string) {
  return refreshWeeklyReportMetricsMany([weeklyPlanId]);
}

/** Every weekly report of a monthly plan. */
export async function refreshPlanWeeklyReports(monthlyPlanId: string) {
  const weeks = await db.weeklyPlan.findMany({ where: { monthlyPlanId, report: { isNot: null } }, select: { id: true } });
  return refreshWeeklyReportMetricsMany(weeks.map((w) => w.id));
}
