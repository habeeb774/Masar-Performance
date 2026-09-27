import type { NotionFilterRule } from "@/lib/notion/filter-rule";
import type { ProgressBreakdown } from "@/lib/notion/progress";
import type { GoalSourceKey, GoalStatusKey, GoalTypeKey, KpiCategoryKey, PriorityKey } from "@/lib/labels";

/** Serializable monthly goal passed to client components. */
export interface PlanGoalRow {
  id: string;
  name: string;
  dutyName: string | null;
  description: string | null;
  goalType: GoalTypeKey;
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
  targetValue: number;
  unit: string;
  dueDate: string | null;
}
