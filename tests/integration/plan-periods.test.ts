/**
 * 7-day plan periods against the test branch: consecutive monthly plans chain
 * their periods without overlap (the previous plan keeps its running period),
 * across a month and a year boundary; weekly reports follow the period even when
 * it crosses the month; plans that already have weeks keep them untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/session";
import * as plans from "@/server/services/plans";
import { generateWeeklyReport } from "@/server/services/reports";
import { recomputePlan } from "@/server/services/progress";
import { diffDays, fromDateKey, toDateKey } from "@/lib/dates";
import { num } from "@/lib/num";

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

// a stretch of far-future months nothing else in the suite uses: Nov 2034 → Feb 2035
const MONTHS = [
  { year: 2034, month: 11 },
  { year: 2034, month: 12 },
  { year: 2035, month: 1 },
  { year: 2035, month: 2 },
];
let manager: AuthUser, employee: AuthUser;
const planIds: Record<string, string> = {};
const key = (m: { year: number; month: number }) => `${m.year}-${m.month}`;
const clean = () => db.monthlyPlan.deleteMany({ where: { employeeId: employee.employeeId!, OR: MONTHS.map((m) => ({ year: m.year, month: m.month })) } });

const goal = (name: string, target: number) => ({
  name,
  description: null,
  goalType: "NUMERIC" as const,
  targetValue: target,
  unit: "منتج",
  weight: 100,
  priority: "HIGH" as const,
  source: "MANUAL" as const,
  category: "PRODUCTIVITY" as const,
  notionDataSourceId: null,
  notionFilter: null,
  startDate: null,
  dueDate: null,
});

async function approvedPlan(m: { year: number; month: number }, target = 160) {
  const plan = await plans.createMonthlyPlan(manager, { employeeId: employee.employeeId!, year: m.year, month: m.month, templateId: null, useTemplate: false });
  await plans.addGoal(manager, plan.id, goal("إضافة المنتجات", target));
  await plans.approvePlan(manager, plan.id, "معتمد");
  planIds[key(m)] = plan.id;
  return plan.id;
}
const periodsOf = async (planId: string) =>
  (await db.weeklyPlan.findMany({ where: { monthlyPlanId: planId }, orderBy: { weekIndex: "asc" } })).map((w) => ({
    id: w.id,
    index: w.weekIndex,
    start: toDateKey(w.startDate),
    end: toDateKey(w.endDate),
  }));

beforeAll(async () => {
  [manager, employee] = await Promise.all([authUser("manager@store.local"), authUser("products@store.local")]);
  await clean();
});
afterAll(clean);

describe("7-day plan periods across months", () => {
  it("first plan starts on the 1st; every period is 7 days; the last runs into the next month", async () => {
    const nov = await periodsOf(await approvedPlan(MONTHS[0]));
    expect(nov[0]).toMatchObject({ index: 1, start: "2034-11-01", end: "2034-11-07" });
    expect(nov.every((p) => diffDays(p.end, p.start) === 6)).toBe(true);
    expect(nov.at(-1)).toMatchObject({ start: "2034-11-29", end: "2034-12-05" });
  });

  it("the next month continues the day after the previous plan's last period — no overlap", async () => {
    const nov = await periodsOf(planIds[key(MONTHS[0])]);
    const dec = await periodsOf(await approvedPlan(MONTHS[1]));
    expect(dec[0]).toMatchObject({ index: 1, start: "2034-12-06" });
    expect(dec[0].start > nov.at(-1)!.end).toBe(true);
    expect(dec.every((p) => diffDays(p.end, p.start) === 6)).toBe(true);
  });

  it("crosses the year from December into January without overlap", async () => {
    const dec = await periodsOf(planIds[key(MONTHS[1])]);
    expect(dec.at(-1)!.end.startsWith("2035-01")).toBe(true);
    const jan = await periodsOf(await approvedPlan(MONTHS[2]));
    expect(fromDateKey(jan[0].start).getTime() - fromDateKey(dec.at(-1)!.end).getTime()).toBe(86_400_000);
    const all = [...dec, ...jan].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < all.length; i++) expect(all[i].start > all[i - 1].end).toBe(true);
  });

  it("the monthly target is split over the plan's own full periods", async () => {
    const weekly = await db.weeklyGoal.findMany({ where: { weeklyPlan: { monthlyPlanId: planIds[key(MONTHS[2])] } } });
    const periods = await periodsOf(planIds[key(MONTHS[2])]);
    expect(weekly).toHaveLength(periods.length);
    expect(weekly.reduce((a, w) => a + num(w.targetValue), 0)).toBe(160);
  });

  it("a period that crosses the month keeps its own dates in the weekly report", async () => {
    const dec = await periodsOf(planIds[key(MONTHS[1])]);
    const last = dec.at(-1)!;
    const report = await generateWeeklyReport(last.id);
    expect([toDateKey(report.weekStart), toDateKey(report.weekEnd)]).toEqual([last.start, last.end]);
    expect(report.generatedText).toContain(`الفترة ${last.index}`);
  });

  it("work done on the spillover days counts in the plan that owns the period, not the next one", async () => {
    const dec = await periodsOf(planIds[key(MONTHS[1])]);
    const last = dec.at(-1)!; // runs into January 2035
    const decGoal = await db.monthlyGoal.findFirstOrThrow({ where: { planId: planIds[key(MONTHS[1])] } });
    const janGoal = await db.monthlyGoal.findFirstOrThrow({ where: { planId: planIds[key(MONTHS[2])] } });
    const wg = await db.weeklyGoal.findFirstOrThrow({ where: { weeklyPlanId: last.id, monthlyGoalId: decGoal.id } });
    await db.dailyTask.create({
      data: { employeeId: employee.employeeId!, weeklyGoalId: wg.id, monthlyGoalId: decGoal.id, title: "عمل يوم عابر", date: fromDateKey(last.end), target: 3, achieved: 3, status: "COMPLETED", source: "MANUAL" },
    });
    const before = num(janGoal.achievedValue);
    await recomputePlan(planIds[key(MONTHS[1])]);
    await recomputePlan(planIds[key(MONTHS[2])]);
    const decAfter = await db.monthlyGoal.findUniqueOrThrow({ where: { id: decGoal.id } });
    const janAfter = await db.monthlyGoal.findUniqueOrThrow({ where: { id: janGoal.id } });
    expect(num(decAfter.achievedValue)).toBeGreaterThanOrEqual(3);
    expect(num(janAfter.achievedValue)).toBe(before);
  });

  it("a plan that already has weeks keeps them exactly as stored", async () => {
    const febId = await approvedPlan(MONTHS[3]);
    const before = await periodsOf(febId);
    // simulate an older plan made with calendar weeks: a short first week
    await db.weeklyPlan.update({ where: { id: before[0].id }, data: { endDate: fromDateKey(before[0].start) } });
    await plans.addGoal(manager, febId, goal("تجهيز الصور", 40)); // re-runs ensureWeeklyPlans
    const after = await periodsOf(febId);
    expect(after).toHaveLength(before.length);
    expect(after[0].end).toBe(before[0].start);
    expect(after.slice(1)).toEqual(before.slice(1));
  });
});
