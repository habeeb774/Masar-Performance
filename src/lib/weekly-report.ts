/**
 * Weekly report metrics — pure, shared by the server, the UI queries and maintenance scripts.
 *
 * WeeklyGoal is the source of truth for a week's achievement. `WeeklyReport.content` is a
 * historical / textual snapshot: its numbers are refreshed from the live weekly goals, and the
 * UI always shows the live metrics computed here (never a stale `content.totals`).
 */
import { formatDateAr, monthLabel } from "./dates";
import { TASK_STATUS_LABELS } from "./labels";
import { formatPct, num, round2 } from "./num";
import type { ProgressBreakdown } from "./notion/progress";
import type { ReportBatchLine, ReportGoalLine, ReportTotals, WeeklyReportContent } from "./report-types";
import { weightedProgress } from "./weighted-progress";

const asBreakdown = (v: unknown) => (v && typeof v === "object" ? (v as ProgressBreakdown) : null);

/** A weekly goal row joined with its monthly goal (current weight / status / name). */
export interface LiveWeeklyGoal {
  monthlyGoalId: string;
  targetValue: unknown;
  achievedValue: unknown;
  progressPct: unknown;
  breakdown: unknown;
  monthlyGoal: {
    name: string;
    dutyName: string | null;
    unit: string;
    category: string;
    source: string;
    goalType: string;
    weight: unknown;
    status: string;
    sortOrder?: number;
  };
}

export interface WeeklyReportMetrics {
  weightedProgress: number;
  completedGoals: number;
  goalsCount: number;
  goals: ReportGoalLine[];
  totals: ReportTotals;
}

export function goalLinesOf(weeklyGoals: LiveWeeklyGoal[]): ReportGoalLine[] {
  return [...weeklyGoals]
    .sort((a, b) => (a.monthlyGoal.sortOrder ?? 0) - (b.monthlyGoal.sortOrder ?? 0))
    .map((wg) => ({
      goalId: wg.monthlyGoalId,
      name: wg.monthlyGoal.name,
      dutyName: wg.monthlyGoal.dutyName,
      unit: wg.monthlyGoal.unit,
      category: wg.monthlyGoal.category,
      source: wg.monthlyGoal.source,
      goalType: wg.monthlyGoal.goalType,
      // always the monthly goal's current weight — never a weight frozen in a snapshot
      weight: num(wg.monthlyGoal.weight),
      status: wg.monthlyGoal.status,
      target: num(wg.targetValue),
      achieved: num(wg.achievedValue),
      progressPct: num(wg.progressPct),
      breakdown: asBreakdown(wg.breakdown),
    }));
}

export function reportTotals(goals: ReportGoalLine[]): ReportTotals {
  const active = goals.filter((g) => g.status !== "CANCELLED");
  const sum = (k: keyof ProgressBreakdown) => active.reduce((a, g) => a + (g.breakdown ? Number(g.breakdown[k] ?? 0) : 0), 0);
  const approved = sum("completed");
  const needsRevision = sum("needsRevision");
  const worked = sum("worked");
  const reworkCount = sum("reworkCount");
  return {
    goalsCount: active.length,
    completedGoals: active.filter((g) => g.progressPct >= 100).length,
    weightedProgress: weightedProgress(active),
    approved,
    worked,
    pendingApproval: sum("pendingApproval"),
    needsRevision,
    blocked: sum("blocked"),
    reworkCount,
    approvalRate: approved + needsRevision > 0 ? round2((approved / (approved + needsRevision)) * 100) : null,
    revisionRate: worked > 0 ? round2((Math.max(reworkCount, needsRevision) / worked) * 100) : null,
  };
}

/** Live metrics of one week, from its current weekly goals. */
export function weeklyReportMetrics(weeklyGoals: LiveWeeklyGoal[]): WeeklyReportMetrics {
  const goals = goalLinesOf(weeklyGoals);
  const totals = reportTotals(goals);
  return { weightedProgress: totals.weightedProgress, completedGoals: totals.completedGoals, goalsCount: totals.goalsCount, goals, totals };
}

const GOAL_HIGHLIGHT_PREFIX = "تحقيق هدف \"";
const TASK_CARRY_PREFIX = "مهمة: ";

export function goalHighlights(goals: ReportGoalLine[]) {
  return goals
    .filter((g) => g.progressPct >= 100 && g.target > 0)
    .map((g) => `${GOAL_HIGHLIGHT_PREFIX}${g.name}" بنسبة ${formatPct(g.progressPct)} (${g.achieved} من ${g.target} ${g.unit})`);
}

export function goalCarryOver(goals: ReportGoalLine[]) {
  return goals.filter((g) => g.target > g.achieved && g.goalType !== "PERCENTAGE").map((g) => `${g.name}: متبقي ${round2(g.target - g.achieved)} ${g.unit}`);
}

export const taskCarryOver = (title: string) => `${TASK_CARRY_PREFIX}${title}`;

const EPS = 0.005;
const same = (a: number, b: number) => Math.abs(a - b) < EPS;

/** True when the numbers stored in a report snapshot no longer match the live weekly goals. */
export function snapshotDiffers(content: Pick<WeeklyReportContent, "goals" | "totals">, live: WeeklyReportMetrics) {
  if (!same(num(content.totals?.weightedProgress), live.weightedProgress)) return true;
  if (num(content.totals?.completedGoals) !== live.completedGoals || num(content.totals?.goalsCount) !== live.goalsCount) return true;
  const snap = new Map((content.goals ?? []).map((g) => [g.goalId, g]));
  if (snap.size !== live.goals.length) return true;
  return live.goals.some((g) => {
    const s = snap.get(g.goalId);
    return !s || !same(s.achieved, g.achieved) || !same(s.progressPct, g.progressPct) || !same(s.weight, g.weight) || !same(s.target, g.target) || s.status !== g.status;
  });
}

/**
 * Replace the numeric part of a report snapshot (goals, totals, goal-derived highlights /
 * carry-over) with live metrics. Task lists, batches and everything the employee or the
 * manager wrote are left untouched. The totals first frozen in the report are kept once in
 * `originalTotals` so the history of what was submitted is never lost.
 */
export function applyMetricsToContent(content: WeeklyReportContent, live: WeeklyReportMetrics, now: Date): WeeklyReportContent {
  const highlights = content.autoHighlights ?? [];
  const carry = content.autoCarryOver ?? [];
  return {
    ...content,
    goals: live.goals,
    totals: live.totals,
    autoHighlights: [...goalHighlights(live.goals), ...highlights.filter((h) => !h.startsWith(GOAL_HIGHLIGHT_PREFIX))],
    autoCarryOver: [...goalCarryOver(live.goals), ...carry.filter((h) => h.startsWith(TASK_CARRY_PREFIX))],
    originalTotals: content.originalTotals ?? content.totals,
    metricsRefreshedAt: now.toISOString(),
  };
}

export interface ReportRefreshPlan {
  changed: boolean;
  before: number;
  after: number;
  content: WeeklyReportContent;
  generatedText: string;
}

/** Metrics-only refresh of one stored report (safe for any status: no note or comment is touched). */
export function planMetricsRefresh(report: { content: WeeklyReportContent; generatedText: string }, live: WeeklyReportMetrics, now: Date): ReportRefreshPlan {
  const before = num(report.content.totals?.weightedProgress);
  if (!snapshotDiffers(report.content, live)) return { changed: false, before, after: before, content: report.content, generatedText: report.generatedText };
  const content = applyMetricsToContent(report.content, live, now);
  return { changed: true, before, after: live.weightedProgress, content, generatedText: weeklyText(content) };
}

export interface StoredWeeklyReport {
  id: string;
  weeklyPlanId: string;
  status: string;
  content: unknown;
  generatedText: string;
}

export interface ReportRebuildRow extends ReportRefreshPlan {
  id: string;
  weeklyPlanId: string;
  status: string;
  /** weighted progress of the live weekly goals */
  live: number;
}

/**
 * The plan of a maintenance rebuild (scripts/rebuild-september-weekly-reports.ts): metrics only,
 * whatever the status. Applying it writes `content` + `generatedText` and nothing else.
 */
export function planReportsRebuild(reports: StoredWeeklyReport[], liveByWeek: Map<string, WeeklyReportMetrics>, now: Date): ReportRebuildRow[] {
  return reports.map((r) => {
    const live = liveByWeek.get(r.weeklyPlanId) ?? weeklyReportMetrics([]);
    const content = (r.content && typeof r.content === "object" ? r.content : {}) as WeeklyReportContent;
    const safe: WeeklyReportContent = {
      ...content,
      employee: content.employee ?? { id: "", name: "", jobTitle: null },
      week: content.week ?? { index: 0, start: "", end: "", year: 0, month: 0 },
      goals: content.goals ?? [],
      totals: content.totals ?? reportTotals([]),
      manualTasks: content.manualTasks ?? [],
      delayedTasks: content.delayedTasks ?? [],
      adHocTasks: content.adHocTasks ?? [],
      autoHighlights: content.autoHighlights ?? [],
      autoCarryOver: content.autoCarryOver ?? [],
    };
    return { id: r.id, weeklyPlanId: r.weeklyPlanId, status: r.status, live: live.weightedProgress, ...planMetricsRefresh({ content: safe, generatedText: r.generatedText }, live, now) };
  });
}

// ---------------------------------------------------------------------------
//  Text
// ---------------------------------------------------------------------------

export function breakdownText(b: ProgressBreakdown | null) {
  if (!b) return "";
  const parts = [`معتمد/مكتمل ${b.completed}`];
  if (b.pendingApproval) parts.push(`بانتظار الاعتماد ${b.pendingApproval}`);
  if (b.needsRevision) parts.push(`يحتاج تحسين ${b.needsRevision}`);
  if (b.blocked) parts.push(`معلق ${b.blocked}`);
  return ` (${parts.join("، ")})`;
}

export function batchText(b: ReportBatchLine) {
  return `• ${b.label} — المستهدف ${b.total} منتج: الصور المعتمدة ${b.imagesApproved}، تمت الإضافة للمتجر ${b.added}، تحتاج تحسين ${b.needsImprovement}، بانتظار الاعتماد ${b.waiting} — إنجاز الصور ${formatPct(b.imagesPct)}، إضافة المنتجات ${formatPct(b.addedPct)}`;
}

/** The generated (system) text of a weekly report. Employee notes live in their own columns. */
export function weeklyText(c: WeeklyReportContent): string {
  const lines: string[] = [];
  lines.push(`التقرير الأسبوعي — ${c.employee.name}${c.employee.jobTitle ? ` (${c.employee.jobTitle})` : ""}`);
  lines.push(`الفترة ${c.week.index} · ${formatDateAr(c.week.start)} – ${formatDateAr(c.week.end)} (خطة ${monthLabel(c.week.year, c.week.month)})`);
  lines.push("");
  lines.push(`نسبة الإنجاز الموزونة: ${formatPct(c.totals.weightedProgress)} — أهداف مكتملة ${c.totals.completedGoals} من ${c.totals.goalsCount}`);
  if (c.totals.worked > 0) {
    lines.push(
      `عناصر Notion: عمل على ${c.totals.worked}، معتمد ${c.totals.approved}، بانتظار الاعتماد ${c.totals.pendingApproval}، يحتاج تحسين ${c.totals.needsRevision}` +
        (c.totals.approvalRate !== null ? ` — نسبة الاعتماد ${formatPct(c.totals.approvalRate)}` : ""),
    );
  }
  lines.push("");
  lines.push("أولًا: أهداف الأسبوع");
  c.goals.forEach((g, i) => {
    lines.push(`${i + 1}. ${g.name}: المستهدف ${g.target} ${g.unit}، المنجز ${g.achieved} (${formatPct(g.progressPct)})${breakdownText(g.breakdown)}`);
  });
  const status = (s: string) => TASK_STATUS_LABELS[s as keyof typeof TASK_STATUS_LABELS]?.label ?? s;
  if (c.manualTasks.length) {
    lines.push("");
    lines.push("ثانيًا: المهام اليدوية");
    c.manualTasks.forEach((t) => lines.push(`• ${t.title} — ${status(t.status)}`));
  }
  if (c.adHocTasks.length) {
    lines.push("");
    lines.push("ثالثًا: التكليفات المستجدة");
    c.adHocTasks.forEach((t) => lines.push(`• ${t.title} — ${status(t.status)}`));
  }
  if (c.delayedTasks.length) {
    lines.push("");
    lines.push("المعوقات والتأخير");
    c.delayedTasks.forEach((t) => lines.push(`• ${t.title}${t.delayReason ? ` — السبب: ${t.delayReason}` : ""}`));
  }
  if (c.batches?.length) {
    lines.push("");
    lines.push("الدفعات");
    c.batches.forEach((b) => lines.push(batchText(b)));
  }
  if (c.autoHighlights.length) {
    lines.push("");
    lines.push("ما أُنجز");
    c.autoHighlights.forEach((h) => lines.push(`• ${h}`));
  }
  if (c.autoCarryOver.length) {
    lines.push("");
    lines.push("لم يكتمل — أولويات الأسبوع القادم");
    c.autoCarryOver.forEach((h) => lines.push(`• ${h}`));
  }
  return lines.join("\n");
}
