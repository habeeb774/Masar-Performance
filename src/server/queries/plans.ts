import "server-only";
import { isNotionGoal } from "@/server/services/manual";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import { employeeIdScope } from "@/server/auth/session";
import { getCompany } from "@/server/services/company";
import { eachDay, isWorkDay, monthEnd, monthLabel, monthStart, toDateKey, todayKey } from "@/lib/dates";
import { num } from "@/lib/num";
import { normalizeRule, readBreakdown, type NotionSourceOption, type TestPeriod } from "@/features/goals/types";
import type { DistributionGoal, PlanGoalRow, WeekColumn } from "@/features/plans/types";
import type { DistributionModeKey, GoalSourceKey, GoalStatusKey, GoalTypeKey, KpiCategoryKey, PriorityKey } from "@/lib/labels";
import { weightedProgress } from "./dashboard";

/** Current year/month + today in the company timezone. */
export async function companyToday() {
  const company = await getCompany();
  const today = todayKey(company.timezone);
  return { company, today, year: +today.slice(0, 4), month: +today.slice(5, 7) };
}

/** Period used by "اختبار القاعدة" (the current month). */
export function monthPeriod(year: number, month: number): TestPeriod {
  return { start: monthStart(year, month), end: monthEnd(year, month), label: monthLabel(year, month) };
}

function schemaProperties(schema: unknown): NotionSourceOption["properties"] {
  if (!Array.isArray(schema)) return [];
  return schema
    .filter((p): p is { name: string; type?: string; options?: unknown } => !!p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string")
    .map((p) => ({
      name: p.name,
      type: typeof p.type === "string" ? p.type : "unknown",
      options: Array.isArray(p.options)
        ? p.options
            .map((o) => (typeof o === "string" ? o : o && typeof o === "object" && typeof (o as { name?: unknown }).name === "string" ? (o as { name: string }).name : null))
            .filter((o): o is string => !!o)
        : [],
    }));
}

/** Notion data sources with their workflow stages and schema properties. */
export async function getNotionSourceOptions(): Promise<NotionSourceOption[]> {
  const sources = await db.notionDataSource.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      schemaCache: true,
      fieldMappings: {
        where: { role: "STATUS", stageKey: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: { stageKey: true, label: true, statusMappings: { orderBy: { precedence: "desc" }, select: { notionValue: true } } },
      },
    },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    isActive: s.isActive,
    stages: s.fieldMappings.map((m) => ({ stageKey: m.stageKey!, label: m.label, rawValues: m.statusMappings.map((sm) => sm.notionValue) })),
    properties: schemaProperties(s.schemaCache),
  }));
}

type GoalRecord = {
  id: string;
  name: string;
  dutyName?: string | null;
  description: string | null;
  goalType: string;
  distributionMode: string;
  targetValue: unknown;
  achievedValue: unknown;
  progressPct: unknown;
  unit: string;
  weight: unknown;
  priority: string;
  source: string;
  category: string;
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  notionDataSourceId: string | null;
  notionFilter: unknown;
  breakdown: unknown;
  lastComputedAt: Date | null;
  isAdHoc: boolean;
  notionDataSource?: { name: string } | null;
  sourceValue?: unknown;
  overrideValue?: unknown;
  overrideReason?: string | null;
  overrideKeptAt?: Date | null;
};

export function serializeGoal(g: GoalRecord): PlanGoalRow {
  return {
    id: g.id,
    name: g.name,
    dutyName: g.dutyName ?? null,
    description: g.description,
    goalType: g.goalType as GoalTypeKey,
    distributionMode: g.distributionMode as DistributionModeKey,
    targetValue: num(g.targetValue),
    achievedValue: num(g.achievedValue),
    progressPct: num(g.progressPct),
    unit: g.unit,
    weight: num(g.weight),
    priority: g.priority as PriorityKey,
    source: g.source as GoalSourceKey,
    category: g.category as KpiCategoryKey,
    status: g.status as GoalStatusKey,
    startDate: g.startDate ? toDateKey(g.startDate) : null,
    dueDate: g.dueDate ? toDateKey(g.dueDate) : null,
    notionDataSourceId: g.notionDataSourceId,
    notionDataSourceName: g.notionDataSource?.name ?? null,
    notionFilter: normalizeRule(g.notionFilter),
    breakdown: readBreakdown(g.breakdown),
    lastComputedAt: g.lastComputedAt ? g.lastComputedAt.toISOString() : null,
    isAdHoc: g.isAdHoc,
    auto: isNotionGoal(g),
    sourceValue: g.sourceValue === null || g.sourceValue === undefined ? null : num(g.sourceValue),
    overrideValue: g.overrideValue === null || g.overrideValue === undefined ? null : num(g.overrideValue),
    overrideReason: g.overrideReason ?? null,
    overrideKept: !!g.overrideKeptAt,
  };
}

/** Working days of a stored week (company work days, inside the week range). */
export function weekWorkDays(start: Date, end: Date, workDays: number[]) {
  return eachDay(toDateKey(start), toDateKey(end)).filter((d) => isWorkDay(d, workDays));
}

export function weekColumns(
  weeks: { weekIndex: number; startDate: Date; endDate: Date; status: WeekColumn["status"] }[],
  workDays: number[],
): WeekColumn[] {
  return weeks.map((w) => ({
    index: w.weekIndex,
    start: toDateKey(w.startDate),
    end: toDateKey(w.endDate),
    workDays: weekWorkDays(w.startDate, w.endDate, workDays),
    status: w.status,
  }));
}

/** Full plan with goals, weeks and weekly goals. */
export async function getPlanDetail(planId: string) {
  return db.monthlyPlan.findUnique({
    where: { id: planId },
    include: {
      employee: { select: { id: true, fullName: true, userId: true, jobTitle: { select: { id: true, name: true } } } },
      template: { select: { id: true, name: true } },
      goals: { orderBy: { sortOrder: "asc" }, include: { notionDataSource: { select: { name: true } } } },
      weeklyPlans: {
        orderBy: { weekIndex: "asc" },
        include: { goals: { include: { monthlyGoal: { select: { id: true, weight: true, status: true } } } }, report: { select: { id: true, status: true } } },
      },
    },
  });
}

export type PlanDetail = NonNullable<Awaited<ReturnType<typeof getPlanDetail>>>;

/** Weekly weighted progress for a stored week. */
export function weekProgress(week: PlanDetail["weeklyPlans"][number]) {
  return weightedProgress(week.goals.map((g) => ({ weight: g.monthlyGoal.weight, progressPct: g.progressPct, status: g.monthlyGoal.status })));
}

/** Current weekly targets as goalId → weekIndex → value. */
export function weeklyTargetsMatrix(plan: PlanDetail) {
  const out: Record<string, Record<string, number>> = {};
  for (const w of plan.weeklyPlans) {
    for (const g of w.goals) {
      (out[g.monthlyGoalId] ??= {})[String(w.weekIndex)] = num(g.targetValue);
    }
  }
  return out;
}

/** Employees visible to the user (active), for plan creation / filters. */
export async function scopedEmployees(user: AuthUser) {
  const scope = employeeIdScope(user);
  return db.employee.findMany({
    where: { status: "ACTIVE", ...(scope === "ALL" ? {} : { id: { in: scope } }) },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, jobTitleId: true, jobTitle: { select: { name: true } } },
  });
}

/** Goal templates (for plan creation). */
export async function templateOptions() {
  const templates = await db.goalTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, jobTitleId: true, isActive: true, updatedAt: true, _count: { select: { items: true } } },
  });
  return templates.map((t) => ({ id: t.id, name: t.name, jobTitleId: t.jobTitleId, isActive: t.isActive, itemCount: t._count.items }));
}

/** Non-cancelled monthly goals as rows of the weekly distribution matrix. */
export function distributionGoals(plan: PlanDetail): DistributionGoal[] {
  return plan.goals
    .filter((g) => g.status !== "CANCELLED")
    .map((g) => ({
      id: g.id,
      name: g.name,
      goalType: g.goalType as GoalTypeKey,
      distributionMode: g.distributionMode as DistributionModeKey,
      targetValue: num(g.targetValue),
      unit: g.unit,
      startDate: g.startDate ? toDateKey(g.startDate) : null,
      dueDate: g.dueDate ? toDateKey(g.dueDate) : null,
    }));
}
