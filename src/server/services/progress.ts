import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { computeBreakdown, type EvalItem, type ProgressBreakdown } from "@/lib/notion/progress";
import { parseFilterRule } from "@/lib/notion/filter-rule";
import type { SystemStatus } from "@/lib/notion/status";
import { monthEnd, monthStart, toDateKey, todayKey } from "@/lib/dates";
import { deriveGoalStatus, deriveTaskStatus } from "@/lib/goal-status";
import { num, pct } from "@/lib/num";
import { distributionProgress, manualAchieved } from "@/lib/distribution-progress";
import { planSpan } from "./periods";
import { getCompanyFresh } from "./company";

/** Per-run cache of evaluated items keyed by dataSource + stage. */
export class ItemCache {
  private map = new Map<string, Promise<EvalItem[]>>();
  get(dataSourceId: string, stageKey: string) {
    const key = `${dataSourceId}:${stageKey}`;
    let hit = this.map.get(key);
    if (!hit) {
      hit = loadEvalItems(dataSourceId, stageKey);
      this.map.set(key, hit);
    }
    return hit;
  }
}

export async function loadEvalItems(dataSourceId: string, stageKey: string): Promise<EvalItem[]> {
  const rows = await db.notionSyncedItem.findMany({
    where: { dataSourceId, isArchived: false },
    select: {
      id: true,
      batch: true,
      batchNumber: true,
      productCode: true,
      taskType: true,
      employeeId: true,
      itemDate: true,
      createdTime: true,
      lastEditedTime: true,
      properties: true,
      stages: { where: { stageKey }, select: { rawValues: true, systemStatus: true, statusChangedAt: true } },
      events: { where: { stageKey, toStatus: "NEEDS_REVISION" }, select: { occurredAt: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    batch: r.batch,
    batchNumber: r.batchNumber === null ? null : num(r.batchNumber),
    productCode: r.productCode,
    taskType: r.taskType,
    employeeId: r.employeeId,
    itemDate: r.itemDate ? toDateKey(r.itemDate) : null,
    createdTime: r.createdTime.toISOString(),
    lastEditedTime: r.lastEditedTime.toISOString(),
    properties: (r.properties ?? {}) as EvalItem["properties"],
    stage: r.stages[0]
      ? {
          rawValues: r.stages[0].rawValues,
          systemStatus: r.stages[0].systemStatus as SystemStatus,
          statusChangedAt: r.stages[0].statusChangedAt.toISOString(),
        }
      : null,
    revisionEvents: r.events.map((e) => e.occurredAt.toISOString()),
  }));
}

/** Compute a Notion breakdown for an arbitrary goal-like rule and range. */
export async function breakdownFor(
  goal: { notionDataSourceId: string | null; notionFilter: unknown; employeeId: string },
  range: { start: string | null; end: string | null },
  target: number,
  cache = new ItemCache(),
): Promise<ProgressBreakdown | null> {
  const rule = parseFilterRule(goal.notionFilter);
  if (!rule || !goal.notionDataSourceId) return null;
  const items = await cache.get(goal.notionDataSourceId, rule.stageKey);
  return computeBreakdown(items, rule, { ...range, employeeId: goal.employeeId }, target);
}

const planInclude = {
  goals: { include: { dailyTasks: { select: { achieved: true, target: true, status: true, source: true, weeklyGoalId: true } } } },
  weeklyPlans: {
    include: {
      goals: { include: { dailyTasks: true } },
    },
  },
} satisfies Prisma.MonthlyPlanInclude;


/**
 * Recompute achievement for every goal, weekly goal and daily task of a plan.
 * Notion-synced goals are derived from synced items; manual goals from their tasks.
 * Every change of achievement ends here, so this is also the one place the plan's stored
 * weekly reports are brought back in line with the weekly goals (once per recompute).
 */
export async function recomputePlan(planId: string, cache = new ItemCache(), opts: { refreshReports?: boolean } = {}) {
  const company = await getCompanyFresh();
  const today = todayKey(company.timezone);
  const plan = await db.monthlyPlan.findUnique({ where: { id: planId }, include: planInclude });
  if (!plan) return;
  const mStart = monthStart(plan.year, plan.month);
  const mEnd = monthEnd(plan.year, plan.month);
  // the plan's real span follows its 7-day periods, so each day counts in one plan only
  const { start: pStart, end: pEnd } = await planSpan(plan);
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const now = new Date();

  for (const goal of plan.goals) {
    const target = num(goal.targetValue);
    // Historical calendar defaults follow the real span. Other explicit goal
    // dates are respected, including custom dates spilling into another month.
    const customStart = goal.startDate && toDateKey(goal.startDate) !== mStart ? toDateKey(goal.startDate) : null;
    const customEnd = goal.dueDate && toDateKey(goal.dueDate) !== mEnd ? toDateKey(goal.dueDate) : null;
    const start = customStart && customStart > pStart ? customStart : pStart;
    const end = customEnd && customEnd < pEnd ? customEnd : pEnd;
    const isNotion = goal.source === "NOTION" && goal.notionDataSourceId && goal.notionFilter;
    let achieved = num(goal.achievedValue);
    let breakdown: ProgressBreakdown | null = null;

    let sourceValue: number | null | undefined;
    let progress: number;
    if (goal.distributionMode !== "DISTRIBUTED") {
      const result = distributionProgress(goal.distributionMode, goal.goalType, target, goal.dailyTasks, num(goal.manualAdjust));
      achieved = result.achieved;
      progress = result.progress;
    } else if (isNotion) {
      breakdown = await breakdownFor(goal, { start, end }, target, cache);
      if (breakdown) achieved = sourceValue = breakdown.completed;
      // a manual override wins over Notion and is never replaced by a sync
      if (goal.overrideValue !== null) achieved = num(goal.overrideValue);
      progress = pct(achieved, target);
    } else {
      achieved = manualAchieved(goal.goalType, goal.dailyTasks, num(goal.manualAdjust));
      progress = pct(achieved, target);
    }
    const status = deriveGoalStatus({
      current: goal.status,
      progressPct: progress,
      start,
      end,
      today,
    });
    writes.push(
      db.monthlyGoal.update({
        where: { id: goal.id },
        data: {
          achievedValue: achieved,
          progressPct: Math.min(progress, 100),
          status,
          breakdown: (breakdown ?? undefined) as Prisma.InputJsonValue | undefined,
          sourceValue,
          lastComputedAt: now,
        },
      }),
    );
  }

  const goalById = new Map(plan.goals.map((g) => [g.id, g]));
  for (const week of plan.weeklyPlans) {
    const wStart = toDateKey(week.startDate);
    const wEnd = toDateKey(week.endDate);
    for (const wg of week.goals) {
      const goal = goalById.get(wg.monthlyGoalId);
      if (!goal) continue;
      const target = num(wg.targetValue);
      const isNotion = goal.source === "NOTION" && goal.notionDataSourceId && goal.notionFilter;
      let achieved = num(wg.achievedValue);
      let breakdown: ProgressBreakdown | null = null;
      let progress: number;
      if (goal.distributionMode !== "DISTRIBUTED") {
        const result = distributionProgress(goal.distributionMode, goal.goalType, target, wg.dailyTasks, num(wg.manualAdjust));
        achieved = result.achieved;
        progress = result.progress;
      } else if (isNotion) {
        breakdown = await breakdownFor(goal, { start: wStart, end: wEnd }, target, cache);
        if (breakdown) achieved = breakdown.completed;
        progress = pct(achieved, target);
      } else {
        achieved = manualAchieved("NUMERIC", wg.dailyTasks, num(wg.manualAdjust));
        progress = pct(achieved, target);
      }
      writes.push(
        db.weeklyGoal.update({
          where: { id: wg.id },
          data: {
            achievedValue: achieved,
            progressPct: Math.min(progress, 100),
            breakdown: (breakdown ?? undefined) as Prisma.InputJsonValue | undefined,
            lastComputedAt: now,
          },
        }),
      );

      // daily tasks of Notion goals track the items completed that day
      if (isNotion) {
        for (const task of wg.dailyTasks) {
          if (task.source === "MANUAL" || task.source === "AD_HOC_TASK") continue;
          const day = toDateKey(task.date);
          const tb = await breakdownFor(goal, { start: day, end: day }, num(task.target), cache);
          if (!tb) continue;
          const status = deriveTaskStatus({
            current: task.status,
            achieved: tb.completed,
            target: num(task.target),
            date: day,
            today,
          });
          writes.push(
            db.dailyTask.update({
              where: { id: task.id },
              data: {
                achieved: tb.completed,
                status,
                breakdown: tb as unknown as Prisma.InputJsonValue,
                completedAt: status === "COMPLETED" ? (task.completedAt ?? now) : null,
              },
            }),
          );
        }
      }
    }
  }

  // recompute writes are idempotent derived values — run them concurrently (bounded by the pool)
  for (let i = 0; i < writes.length; i += 8) await Promise.all(writes.slice(i, i + 8));

  if (opts.refreshReports !== false) {
    const { refreshPlanWeeklyReports } = await import("./weekly-report-metrics");
    await refreshPlanWeeklyReports(planId);
  }
}

/** Plans that are currently being executed (current + previous month). */
export async function activePlanIds(filter: Prisma.MonthlyPlanWhereInput = {}) {
  const plans = await db.monthlyPlan.findMany({
    where: { status: { in: ["APPROVED", "IN_PROGRESS"] }, ...filter },
    select: { id: true },
  });
  return plans.map((p) => p.id);
}

export async function recomputeForDataSource(dataSourceId: string) {
  const ids = await activePlanIds({ goals: { some: { notionDataSourceId: dataSourceId } } });
  const cache = new ItemCache();
  for (const id of ids) await recomputePlan(id, cache);
  return ids.length;
}

export async function recomputeAllActive() {
  const ids = await activePlanIds();
  const cache = new ItemCache();
  for (const id of ids) await recomputePlan(id, cache);
  return ids.length;
}

/** Aggregate stage status counts for a data source, optionally within a date range. */
export async function stageStatusCounts(opts: {
  dataSourceIds?: string[];
  employeeId?: string | null;
  from?: Date;
  to?: Date;
}) {
  const rows = await db.notionItemStage.groupBy({
    by: ["stageKey", "systemStatus"],
    where: {
      item: {
        isArchived: false,
        ...(opts.dataSourceIds ? { dataSourceId: { in: opts.dataSourceIds } } : {}),
        ...(opts.employeeId ? { employeeId: opts.employeeId } : {}),
      },
      ...(opts.from || opts.to ? { statusChangedAt: { gte: opts.from, lte: opts.to } } : {}),
    },
    _count: { _all: true },
  });
  return rows.map((r) => ({ stageKey: r.stageKey, systemStatus: r.systemStatus, count: r._count._all }));
}
