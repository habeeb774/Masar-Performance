/**
 * Dry-run by default. Explicit application: node --conditions=react-server
 * --import tsx scripts/fix-plan-periods.ts --apply [--employee=<id>]
 * Use --test-db to target DATABASE_URL_TEST. Back up before --apply.
 * Completed/in-progress tasks outside the proposed span or surplus reports block
 * an employee's repair; nothing is deleted to bypass those review blockers.
 */
import "dotenv/config";
import { executionEndDate, fromDateKey, planWeekPeriods, toDateKey } from "../src/lib/dates";

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.includes("--test-db")) {
    if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST is required");
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  }
  const { db } = await import("../src/server/db");
  const employeeId = process.argv.find((arg) => arg.startsWith("--employee="))?.slice(11);
  // Explicit select keeps the dry-run usable before the additive migration.
  const plans = await db.monthlyPlan.findMany({
    where: { year: 2026, month: { in: [9, 10] }, ...(employeeId ? { employeeId } : {}) },
    select: { id: true, employeeId: true, month: true, status: true,
      employee: { select: { fullName: true } },
      weeklyPlans: { select: { id: true, weekIndex: true, startDate: true, endDate: true, report: { select: { id: true } }, goals: { select: { manualAdjust: true } } } },
      goals: { select: { dailyTasks: { select: { id: true, title: true, date: true, status: true, source: true, achieved: true, progress: true } } } } },
    orderBy: [{ employeeId: "asc" }, { month: "asc" }],
  });
  const company = await db.company.findFirstOrThrow({ select: { workDays: true } });
  const proposals = plans.map((plan) => {
    const start = plan.month === 9 ? "2026-09-05" : "2026-10-03";
    const end = executionEndDate(start, 4);
    const affected = plan.goals.flatMap((goal) => goal.dailyTasks).filter((task) => toDateKey(task.date) < start || toDateKey(task.date) > end);
    const reasons = [];
    if (affected.some((task) => task.status !== "CANCELLED" && (task.status !== "NOT_STARTED" || Number(task.achieved) > 0 || task.progress > 0))) reasons.push("مهام منفذة خارج الفترة الجديدة");
    if (plan.weeklyPlans.some((week) => week.weekIndex > 4 && week.report)) reasons.push("تقرير محفوظ في أسبوع زائد يحتاج مراجعة");
    if (plan.weeklyPlans.some((week) => week.weekIndex > 4 && week.goals.some((goal) => Number(goal.manualAdjust) !== 0))) reasons.push("إنجاز يدوي في أسبوع زائد يحتاج مراجعة");
    const originalSpan = { start: plan.weeklyPlans.map((week) => toDateKey(week.startDate)).sort()[0] ?? `2026-${plan.month === 9 ? "09" : "10"}-01`, end: plan.weeklyPlans.map((week) => toDateKey(week.endDate)).sort().at(-1) ?? `2026-${plan.month === 9 ? "09-30" : "10-31"}` };
    return { plan, start, end, affected, blocked: reasons.length > 0, reasons, originalSpan };
  });
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", plans: proposals.map(({ plan, start, end, affected, blocked, reasons }) => ({
    id: plan.id, employee: plan.employee.fullName, month: plan.month, start, end, weeksCount: 4,
    weeks: planWeekPeriods(start, 4, company.workDays), blocked, reasons,
    affectedTasks: affected.map((task) => ({ ...task, date: toDateKey(task.date), action: task.status === "NOT_STARTED" && Number(task.achieved) === 0 && task.progress === 0 ? "إعادة توزيع داخل الفترة" : "الاحتفاظ للمراجعة" })),
  })) }, null, 2));
  if (!apply) { await db.$disconnect(); return; }
  const { rebuildPlanPeriods } = await import("../src/server/services/rebuild-plan-periods");
  const { recomputePlan } = await import("../src/server/services/progress");
  const employeeIds = [...new Set(plans.map((plan) => plan.employeeId))];
  for (const id of employeeIds) {
    const group = proposals.filter((proposal) => proposal.plan.employeeId === id);
    if (group.some((proposal) => proposal.blocked)) throw new Error(`Repair blocked for ${id}: review protected tasks/reports first`);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${id} FOR UPDATE`;
      // Set both proposed bounds together to avoid false overlap with October's old span.
      for (const proposal of group) await tx.monthlyPlan.update({ where: { id: proposal.plan.id }, data: { executionStartDate: fromDateKey(proposal.start), executionEndDate: fromDateKey(proposal.end), weeksCount: 4 } });
      for (const proposal of group) await rebuildPlanPeriods(proposal.plan.id, proposal.start, 4, company.workDays, tx, proposal.originalSpan);
    }, { timeout: 180_000 });
    for (const proposal of group) await recomputePlan(proposal.plan.id);
  }
  await db.$disconnect();
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  // This is a standalone process, not the running application's shared pool.
  const pool = (globalThis as unknown as { pool?: { end(): Promise<void> } }).pool;
  if (pool) await pool.end();
});
