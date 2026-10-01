import { describe, expect, it } from "vitest";
import {
  applyMetricsToContent,
  planMetricsRefresh,
  planReportsRebuild,
  snapshotDiffers,
  weeklyReportMetrics,
  weeklyText,
  type LiveWeeklyGoal,
} from "@/lib/weekly-report";
import { weightedProgress } from "@/lib/weighted-progress";
import type { WeeklyReportContent } from "@/lib/report-types";

const goal = (id: string, o: { weight?: number; target?: number; achieved?: number; status?: string; sortOrder?: number } = {}): LiveWeeklyGoal => {
  const target = o.target ?? 10;
  const achieved = o.achieved ?? 0;
  return {
    monthlyGoalId: id,
    targetValue: target,
    achievedValue: achieved,
    progressPct: target > 0 ? Math.min((achieved / target) * 100, 100) : 0,
    breakdown: null,
    monthlyGoal: { name: `هدف ${id}`, dutyName: null, unit: "منتج", category: "PRODUCTIVITY", source: "MANUAL", goalType: "NUMERIC", weight: o.weight ?? 50, status: o.status ?? "IN_PROGRESS", sortOrder: o.sortOrder ?? 0 },
  };
};

/** A report snapshot as generateWeeklyReport stored it at that time. */
function snapshotOf(goals: LiveWeeklyGoal[]): WeeklyReportContent {
  const m = weeklyReportMetrics(goals);
  return {
    version: 1,
    employee: { id: "e1", name: "موظف", jobTitle: null },
    week: { index: 2, start: "2026-09-08", end: "2026-09-14", year: 2026, month: 9 },
    goals: m.goals,
    totals: m.totals,
    manualTasks: [{ id: "t1", title: "مهمة يدوية", date: "2026-09-08", deadline: null, status: "NOT_STARTED", source: "MANUAL", progress: 0, target: 0, achieved: 0, delayReason: null, notes: null }],
    delayedTasks: [],
    adHocTasks: [],
    autoHighlights: ["إنجاز التكليف: تصوير"],
    autoCarryOver: ["مهمة: مهمة يدوية"],
  };
}

const NOW = new Date("2026-10-01T10:00:00Z");

describe("weekly report metrics — WeeklyGoal is the truth", () => {
  it("uses the system weightedProgress formula", () => {
    const goals = [goal("a", { weight: 70, achieved: 5 }), goal("b", { weight: 30, achieved: 10 })];
    const m = weeklyReportMetrics(goals);
    expect(m.weightedProgress).toBe(weightedProgress(goals.map((g) => ({ weight: g.monthlyGoal.weight, progressPct: g.progressPct, status: g.monthlyGoal.status }))));
    expect(m.weightedProgress).toBe(65);
    expect(m.completedGoals).toBe(1);
    expect(m.goalsCount).toBe(2);
  });

  it("case 1 + 7: a report generated at 0% shows the live 50% once the weekly goal moves", () => {
    const snapshot = snapshotOf([goal("a", { achieved: 0 })]);
    expect(snapshot.totals.weightedProgress).toBe(0);
    const live = weeklyReportMetrics([goal("a", { achieved: 5 })]);
    expect(live.weightedProgress).toBe(50);
    expect(snapshotDiffers(snapshot, live)).toBe(true);
    const refreshed = applyMetricsToContent(snapshot, live, NOW);
    expect(refreshed.totals.weightedProgress).toBe(50);
    expect(refreshed.goals[0].achieved).toBe(5);
  });

  it("case 2: a submitted report's numbers refresh while its snapshot history and task lists stay", () => {
    const snapshot = snapshotOf([goal("a", { achieved: 0 })]);
    const plan = planMetricsRefresh({ content: snapshot, generatedText: "قديم" }, weeklyReportMetrics([goal("a", { achieved: 10 })]), NOW);
    expect(plan.changed).toBe(true);
    expect(plan.before).toBe(0);
    expect(plan.after).toBe(100);
    expect(plan.content.originalTotals?.weightedProgress).toBe(0);
    expect(plan.content.metricsRefreshedAt).toBe(NOW.toISOString());
    expect(plan.content.manualTasks).toEqual(snapshot.manualTasks);
    // goal-derived lines follow the numbers, the rest of the snapshot is kept
    expect(plan.content.autoHighlights).toContain("إنجاز التكليف: تصوير");
    expect(plan.content.autoHighlights.some((h) => h.startsWith('تحقيق هدف "هدف a"'))).toBe(true);
    expect(plan.content.autoCarryOver).toEqual(["مهمة: مهمة يدوية"]);
    expect(plan.generatedText).toContain("نسبة الإنجاز الموزونة: 100");
  });

  it("keeps the first stored totals across several refreshes", () => {
    const snapshot = snapshotOf([goal("a", { achieved: 0 })]);
    const first = applyMetricsToContent(snapshot, weeklyReportMetrics([goal("a", { achieved: 5 })]), NOW);
    const second = applyMetricsToContent(first, weeklyReportMetrics([goal("a", { achieved: 8 })]), NOW);
    expect(second.originalTotals?.weightedProgress).toBe(0);
    expect(second.totals.weightedProgress).toBe(80);
  });

  it("case 4: a changed monthly-goal weight changes the report's weighted progress", () => {
    const before = [goal("a", { weight: 50, achieved: 10 }), goal("b", { weight: 50, achieved: 0 })];
    const snapshot = snapshotOf(before);
    expect(snapshot.totals.weightedProgress).toBe(50);
    const live = weeklyReportMetrics([goal("a", { weight: 80, achieved: 10 }), goal("b", { weight: 20, achieved: 0 })]);
    expect(live.weightedProgress).toBe(80);
    expect(snapshotDiffers(snapshot, live)).toBe(true);
    expect(applyMetricsToContent(snapshot, live, NOW).goals.find((g) => g.goalId === "a")?.weight).toBe(80);
  });

  it("a cancelled goal leaves the weighted progress", () => {
    const live = weeklyReportMetrics([goal("a", { achieved: 10 }), goal("b", { achieved: 0, status: "CANCELLED" })]);
    expect(live.weightedProgress).toBe(100);
    expect(live.goalsCount).toBe(1);
  });

  it("an up-to-date snapshot is left alone", () => {
    const goals = [goal("a", { achieved: 3 })];
    const snapshot = snapshotOf(goals);
    const plan = planMetricsRefresh({ content: snapshot, generatedText: weeklyText(snapshot) }, weeklyReportMetrics(goals), NOW);
    expect(plan.changed).toBe(false);
    expect(plan.content).toBe(snapshot);
  });

  it("case 8: the rebuild plan is pure — it only describes content + text", () => {
    const stored = [
      { id: "r1", weeklyPlanId: "w1", status: "SUBMITTED", content: snapshotOf([goal("a", { achieved: 0 })]), generatedText: "قديم" },
      { id: "r2", weeklyPlanId: "w2", status: "APPROVED", content: snapshotOf([goal("a", { achieved: 4 })]), generatedText: "x" },
    ];
    const frozen = JSON.stringify(stored);
    const live = new Map([
      ["w1", weeklyReportMetrics([goal("a", { achieved: 6 })])],
      ["w2", weeklyReportMetrics([goal("a", { achieved: 4 })])],
    ]);
    const plan = planReportsRebuild(stored, live, NOW);
    expect(JSON.stringify(stored)).toBe(frozen);
    expect(plan.map((p) => [p.id, p.changed, p.before, p.after])).toEqual([
      ["r1", true, 0, 60],
      ["r2", false, 40, 40],
    ]);
    // nothing but the numeric snapshot is produced — notes / comments are not part of the plan
    for (const p of plan) for (const k of ["employeeNotes", "highlights", "blockers", "carryOver", "managerComment", "submittedAt", "reviewedAt", "approvedAt"]) expect(p).not.toHaveProperty(k);
  });

  it("tolerates legacy / partial snapshots", () => {
    const plan = planReportsRebuild([{ id: "r", weeklyPlanId: "w", status: "SUBMITTED", content: { totals: { weightedProgress: 0 } }, generatedText: "" }], new Map([["w", weeklyReportMetrics([goal("a", { achieved: 5 })])]]), NOW);
    expect(plan[0].changed).toBe(true);
    expect(plan[0].after).toBe(50);
  });
});
