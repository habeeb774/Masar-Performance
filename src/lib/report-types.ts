import type { ProgressBreakdown } from "./notion/progress";

export interface ReportGoalLine {
  goalId: string;
  name: string;
  /** older reports have none — grouped by category then */
  dutyName?: string | null;
  unit: string;
  category: string;
  source: string;
  goalType: string;
  weight: number;
  status: string;
  target: number;
  achieved: number;
  progressPct: number;
  breakdown: ProgressBreakdown | null;
}

export interface ReportTaskLine {
  id: string;
  title: string;
  date: string | null;
  deadline: string | null;
  status: string;
  source: string;
  progress: number;
  target: number;
  achieved: number;
  delayReason: string | null;
  notes: string | null;
}

export interface ReportTotals {
  goalsCount: number;
  completedGoals: number;
  weightedProgress: number;
  approved: number;
  worked: number;
  pendingApproval: number;
  needsRevision: number;
  blocked: number;
  reworkCount: number;
  approvalRate: number | null;
  revisionRate: number | null;
}

export interface ReportBatchLine {
  label: string;
  total: number;
  imagesApproved: number;
  added: number;
  needsImprovement: number;
  /** waiting for approval + edited and resubmitted */
  waiting: number;
  imagesPct: number;
  addedPct: number;
}

export interface WeeklyReportContent {
  version: 1;
  employee: { id: string; name: string; jobTitle: string | null };
  week: { index: number; start: string; end: string; year: number; month: number };
  goals: ReportGoalLine[];
  totals: ReportTotals;
  manualTasks: ReportTaskLine[];
  delayedTasks: ReportTaskLine[];
  adHocTasks: ReportTaskLine[];
  autoHighlights: string[];
  autoCarryOver: string[];
  /** older reports have none */
  batches?: ReportBatchLine[];
  /** totals as first frozen in the report, kept when its numbers are later refreshed from the live weekly goals */
  originalTotals?: ReportTotals;
  /** ISO time the numbers were last refreshed from the live weekly goals */
  metricsRefreshedAt?: string;
}

export interface StageSummaryLine {
  dataSourceName: string;
  stageKey: string;
  label: string;
  counts: Record<string, number>;
  revisionEvents: number;
}

export interface MonthlyReportContent {
  version: 1;
  employee: { id: string; name: string; jobTitle: string | null };
  period: { year: number; month: number; start: string; end: string };
  goals: ReportGoalLine[];
  totals: ReportTotals;
  weeks: { index: number; start: string; end: string; progressPct: number; reportStatus: string | null }[];
  adHocTasks: ReportTaskLine[];
  delayedTasks: ReportTaskLine[];
  cancelledTasks: ReportTaskLine[];
  stageSummary: StageSummaryLine[];
  autoHighlights: string[];
  weeklyNotes: { week: number; highlights: string | null; blockers: string | null }[];
  /** older reports have none */
  batches?: ReportBatchLine[];
}
