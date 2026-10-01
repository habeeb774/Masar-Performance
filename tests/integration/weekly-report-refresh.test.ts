/**
 * Weekly reports follow the weekly goals (DATABASE_URL_TEST):
 * WeeklyGoal = current truth, WeeklyReport.content = snapshot refreshed from it,
 * and nothing the employee or the manager wrote is ever lost.
 */
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import * as plans from "@/server/services/plans";
import * as manual from "@/server/services/manual";
import { recomputePlan } from "@/server/services/progress";
import { generateWeeklyReport, reviewWeeklyReport, submitWeeklyReport, updateWeeklyNotes } from "@/server/services/reports";
import { getWeeklyReportMetrics } from "@/server/services/weekly-report-metrics";
import { getWeeklyReport, listWeeklyReports } from "@/server/queries/reports";
import { toDateKey } from "@/lib/dates";
import { formatPct, num } from "@/lib/num";
import type { WeeklyReportContent } from "@/lib/report-types";

const YEAR = 2033;
const MONTH = 3;

async function authUser(email: string): Promise<AuthUser> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } }, employee: { include: { reports: true, jobTitle: true } } },
  });
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleKey: u.role.key,
    roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((p) => p.permission.key)),
    employeeId: u.employee?.id ?? null,
    employeeName: u.employee?.fullName ?? null,
    jobTitle: u.employee?.jobTitle?.name ?? null,
    directReportIds: u.employee?.reports.map((r) => r.id) ?? [],
    sessionId: "test",
  };
}

const manualGoal = (name: string, target: number, weight: number) => ({
  name,
  description: null,
  goalType: "NUMERIC" as const,
  targetValue: target,
  unit: "منتج",
  weight,
  priority: "HIGH" as const,
  source: "MANUAL" as const,
  category: "PRODUCTIVITY" as const,
  notionDataSourceId: null,
  notionFilter: null,
  startDate: null,
  dueDate: null,
});

let manager: AuthUser, employee: AuthUser;
let planId: string, goalA: string, goalB: string;
let weeks: { id: string; weekIndex: number; start: string }[];
const weekGoal = (weekIndex: number, goalId: string) => db.weeklyGoal.findFirstOrThrow({ where: { monthlyGoalId: goalId, weeklyPlan: { monthlyPlanId: planId, weekIndex } } });
const weekAchieved = async (goalId: string) =>
  Promise.all(weeks.map(async (w) => num((await weekGoal(w.weekIndex, goalId)).achievedValue)));
const reportOf = (weeklyPlanId: string) => db.weeklyReport.findUniqueOrThrow({ where: { weeklyPlanId } });
const totals = (r: { content: unknown }) => (r.content as WeeklyReportContent).totals;
/** a day in the middle of a week (start + 2 days) */
const dayIn = (w: { start: string }) => toDateKey(new Date(new Date(`${w.start}T00:00:00Z`).getTime() + 2 * 86_400_000));

async function cleanup() {
  await db.monthlyPlan.deleteMany({ where: { employeeId: employee.employeeId!, year: YEAR, month: MONTH } });
}

beforeAll(async () => {
  [manager, employee] = await Promise.all([authUser("manager@store.local"), authUser("products@store.local")]);
  await cleanup();
  const plan = await plans.createMonthlyPlan(manager, { employeeId: employee.employeeId!, year: YEAR, month: MONTH, templateId: null, useTemplate: false, executionStartDate: "2033-03-01", weeksCount: 5 });
  planId = plan.id;
  await plans.addGoal(manager, planId, manualGoal("إضافة المنتجات", 100, 50));
  await plans.addGoal(manager, planId, manualGoal("تجهيز الصور", 100, 50));
  [goalA, goalB] = (await db.monthlyGoal.findMany({ where: { planId }, orderBy: { sortOrder: "asc" } })).map((g) => g.id);
  await plans.approvePlan(manager, planId, "معتمد");
  weeks = (await db.weeklyPlan.findMany({ where: { monthlyPlanId: planId }, orderBy: { weekIndex: "asc" } })).map((w) => ({ id: w.id, weekIndex: w.weekIndex, start: toDateKey(w.startDate) }));
});

afterAll(cleanup);

describe("weekly report = live weekly goals", () => {
  it("case 1 / 7: a report generated at 0% shows the new progress, in the list and the detail", async () => {
    const w2 = weeks[1];
    const report = await generateWeeklyReport(w2.id);
    expect(totals(report).weightedProgress).toBe(0);
    const target = num((await weekGoal(2, goalA)).targetValue);
    await manual.setManualAchievement(employee, goalA, { value: target / 2, date: dayIn(w2) });

    const live = await getWeeklyReportMetrics(w2.id);
    expect(live.weightedProgress).toBeGreaterThan(0);
    // the stored draft followed automatically
    expect(totals(await reportOf(w2.id)).weightedProgress).toBe(live.weightedProgress);
    // even a stale snapshot never wins in the UI
    await db.weeklyReport.update({ where: { id: report.id }, data: { content: { ...(report.content as object), totals: { ...totals(report), weightedProgress: 0 } } } });
    const { rows } = await listWeeklyReports(employee, { skip: 0, take: 50, month: `${YEAR}-0${MONTH}` }, true);
    const row = rows.find((r) => r.id === report.id)!;
    expect(row.progress).toBe(live.weightedProgress);
    expect(row.progressUpdated).toBe(true);
    const detail = (await getWeeklyReport(report.id))!;
    expect(detail.content.totals.weightedProgress).toBe(live.weightedProgress);
    expect(detail.metricsUpdated).toBe(true);
  });

  it("case 5: a dated manual achievement only raises its own week", async () => {
    const before = await weekAchieved(goalB);
    await manual.setManualAchievement(employee, goalB, { delta: 7, date: dayIn(weeks[1]) });
    const after = await weekAchieved(goalB);
    expect(after.map((v, i) => v - before[i])).toEqual(weeks.map((_, i) => (i === 1 ? 7 : 0)));
    // a distributed goal needs the date
    await expect(manual.setManualAchievement(employee, goalB, { delta: 1 })).rejects.toThrow();
  });

  it("case 6: a new total 38 → 43 adds only +5 to the dated week", async () => {
    await manual.setManualAchievement(employee, goalB, { value: 38, date: dayIn(weeks[1]) });
    const before = await weekAchieved(goalB);
    await manual.setManualAchievement(employee, goalB, { value: 43, date: dayIn(weeks[2]) });
    const after = await weekAchieved(goalB);
    expect(num((await db.monthlyGoal.findUniqueOrThrow({ where: { id: goalB } })).achievedValue)).toBe(43);
    expect(after.map((v, i) => v - before[i])).toEqual(weeks.map((_, i) => (i === 2 ? 5 : 0)));
    // a correction can't take from a week more than it has
    await expect(manual.setManualAchievement(employee, goalB, { delta: -10, date: dayIn(weeks[2]) })).rejects.toThrow();
  });

  it("case 2 / 3: a submitted, reviewed report refreshes its numbers and keeps every note", async () => {
    const w2 = weeks[1];
    const report = await reportOf(w2.id);
    await updateWeeklyNotes(employee, report.id, { employeeNotes: "ملاحظتي", highlights: "أبرز", blockers: "معوق", carryOver: "مرحّل" });
    await submitWeeklyReport(employee, report.id);
    await reviewWeeklyReport(manager, report.id, "REVIEWED", "تعليق المدير");
    const sent = await reportOf(w2.id);
    const sentProgress = totals(sent).weightedProgress;

    await manual.setManualAchievement(employee, goalA, { delta: 3, date: dayIn(w2) });
    const live = await getWeeklyReportMetrics(w2.id);
    const after = await reportOf(w2.id);
    expect(live.weightedProgress).toBeGreaterThan(sentProgress);
    expect(totals(after).weightedProgress).toBe(live.weightedProgress);
    expect((after.content as unknown as WeeklyReportContent).originalTotals?.weightedProgress).toBe(sentProgress);
    expect(after.generatedText).toContain(`نسبة الإنجاز الموزونة: ${formatPct(live.weightedProgress)}`);
    expect(after).toMatchObject({
      status: "REVIEWED",
      employeeNotes: "ملاحظتي",
      highlights: "أبرز",
      blockers: "معوق",
      carryOver: "مرحّل",
      managerComment: "تعليق المدير",
      submittedAt: sent.submittedAt,
      reviewedAt: sent.reviewedAt,
      approvedAt: sent.approvedAt,
    });
    expect((await getWeeklyReport(report.id))!.metricsUpdated).toBe(true);
  });

  it("case 4: a changed monthly-goal weight changes the report's weighted progress", async () => {
    const w2 = weeks[1];
    const before = totals(await reportOf(w2.id)).weightedProgress;
    await db.monthlyGoal.update({ where: { id: goalA }, data: { weight: 90 } });
    await db.monthlyGoal.update({ where: { id: goalB }, data: { weight: 10 } });
    await recomputePlan(planId);
    const live = await getWeeklyReportMetrics(w2.id);
    const after = await reportOf(w2.id);
    expect(after.content).toBeTruthy();
    expect(totals(after).weightedProgress).toBe(live.weightedProgress);
    expect(live.weightedProgress).not.toBe(before);
    expect((after.content as unknown as WeeklyReportContent).goals.find((g) => g.goalId === goalA)?.weight).toBe(90);
  });

  it("case 8 / 9: the rebuild script is a dry run by default and --apply writes numbers only", async () => {
    const w2 = weeks[1];
    const report = await reportOf(w2.id);
    // simulate a report frozen at 0% before this fix
    const stale = { ...(report.content as unknown as WeeklyReportContent), totals: { ...totals(report), weightedProgress: 0 }, goals: [] };
    await db.weeklyReport.update({ where: { id: report.id }, data: { content: stale as object, generatedText: "قديم" } });

    const run = (...extra: string[]) =>
      execFileSync(process.execPath, ["--import", "tsx", "scripts/rebuild-september-weekly-reports.ts", `--year=${YEAR}`, `--month=${MONTH}`, `--employee=${employee.employeeId}`, ...extra], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
        encoding: "utf8",
      });

    const dry = run();
    expect(dry).toContain("DRY RUN");
    const untouched = await reportOf(w2.id);
    expect(untouched.generatedText).toBe("قديم");
    expect(untouched.updatedAt).toEqual((await reportOf(w2.id)).updatedAt);
    expect(totals(untouched).weightedProgress).toBe(0);

    run("--apply");
    const applied = await reportOf(w2.id);
    const live = await getWeeklyReportMetrics(w2.id);
    expect(totals(applied).weightedProgress).toBe(live.weightedProgress);
    expect(applied.generatedText).not.toBe("قديم");
    expect(applied).toMatchObject({
      status: untouched.status,
      employeeNotes: untouched.employeeNotes,
      highlights: untouched.highlights,
      blockers: untouched.blockers,
      carryOver: untouched.carryOver,
      managerComment: untouched.managerComment,
      submittedAt: untouched.submittedAt,
      reviewedAt: untouched.reviewedAt,
      approvedAt: untouched.approvedAt,
    });
  });
});
