import type { NotionFilterRule } from "@/lib/notion/filter-rule";
import type { ProgressBreakdown } from "@/lib/notion/progress";
import type { DistributionModeKey, GoalSourceKey, GoalStatusKey, GoalTypeKey, KpiCategoryKey, PriorityKey } from "@/lib/labels";

/** Serializable monthly goal passed to client components. */
export interface PlanGoalRow {
  id: string;
  name: string;
  dutyName: string | null;
  description: string | null;
  goalType: GoalTypeKey;
  distributionMode: DistributionModeKey;
  targetValue: number;
  achievedValue: number;
  progressPct: number;
  unit: string;
  weight: number;
  priority: PriorityKey;
  source: GoalSourceKey;
  category: KpiCategoryKey;
  status: GoalStatusKey;
  startDate: string | null;
  dueDate: string | null;
  notionDataSourceId: string | null;
  notionDataSourceName: string | null;
  notionFilter: NotionFilterRule | null;
  breakdown: ProgressBreakdown | null;
  lastComputedAt: string | null;
  isAdHoc: boolean;
  /** achievement comes automatically from Notion */
  auto: boolean;
  sourceValue: number | null;
  overrideValue: number | null;
  overrideReason: string | null;
  overrideKept: boolean;
}

/** A week column for the weekly distribution matrix. */
export interface WeekColumn {
  index: number;
  start: string;
  end: string;
  workDays: string[];
  status: "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "CLOSED";
}

export interface DistributionGoal {
  id: string;
  name: string;
  goalType: GoalTypeKey;
  distributionMode: DistributionModeKey;
  targetValue: number;
  unit: string;
  dueDate: string | null;
  startDate: string | null;
}
