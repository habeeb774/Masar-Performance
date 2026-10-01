/**
 * Re-sync the numbers of stored weekly reports with the current weekly goals
 * (default: September 2026, the weeks whose reports were frozen at 0%).
 *
 * DRY RUN by default — prints, per report, the weekly-goal progress, the stored snapshot
 * and what would be written. Nothing is written unless `--apply` is passed.
 *
 *   npx tsx scripts/rebuild-september-weekly-reports.ts                  # dry run
 *   npx tsx scripts/rebuild-september-weekly-reports.ts --apply          # write
 *   npx tsx scripts/rebuild-september-weekly-reports.ts --year=2026 --month=9 --employee=<id>
 *
 * Only `content` (goals, totals, goal-derived highlights / carry-over) and `generatedText`
 * are written. employeeNotes, highlights, blockers, carryOver, managerComment, status,
 * submittedAt, reviewedAt and approvedAt are never touched; the first stored totals are
 * kept in `content.originalTotals`.
 *
 * It is not wired to package scripts or migrations. Review the dry run and take a backup
 * before running it with --apply on production.
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { planReportsRebuild, weeklyReportMetrics, type WeeklyReportMetrics } from "../src/lib/weekly-report";

function arg(name: string) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

const apply = arg("apply") === "true";
const year = Number(arg("year") ?? 2026);
const month = Number(arg("month") ?? 9);
const employeeId = arg("employee");
if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("--year / --month are invalid");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString, max: 4 });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const pctText = (v: number) => `${v.toFixed(2)}%`;

async function main() {
  const host = new URL(connectionString!).host;
  console.log(`${apply ? "APPLY" : "DRY RUN"} — weekly reports of ${year}-${String(month).padStart(2, "0")}${employeeId ? ` (employee ${employeeId})` : ""} on ${host}\n`);

  const reports = await db.weeklyReport.findMany({
    where: { weeklyPlan: { monthlyPlan: { year, month } }, ...(employeeId ? { employeeId } : {}) },
    select: {
      id: true,
      weeklyPlanId: true,
      status: true,
      content: true,
      generatedText: true,
      employee: { select: { fullName: true } },
      weeklyPlan: { select: { weekIndex: true } },
    },
    orderBy: [{ employeeId: "asc" }, { weekStart: "asc" }],
  });
  if (reports.length === 0) {
    console.log("No weekly reports found.");
    return;
  }

  // the live weekly goals of every week, in one query
  const goals = await db.weeklyGoal.findMany({
    where: { weeklyPlanId: { in: reports.map((r) => r.weeklyPlanId) } },
    select: {
      weeklyPlanId: true,
      monthlyGoalId: true,
      targetValue: true,
      achievedValue: true,
      progressPct: true,
      breakdown: true,
      monthlyGoal: { select: { name: true, dutyName: true, unit: true, category: true, source: true, goalType: true, weight: true, status: true, sortOrder: true } },
    },
  });
  const live = new Map<string, WeeklyReportMetrics>();
  for (const id of new Set(reports.map((r) => r.weeklyPlanId))) live.set(id, weeklyReportMetrics(goals.filter((g) => g.weeklyPlanId === id)));

  const plan = planReportsRebuild(reports, live, new Date());
  const meta = new Map(reports.map((r) => [r.id, r]));
  console.table(
    plan.map((p) => ({
      employee: meta.get(p.id)!.employee.fullName,
      week: meta.get(p.id)!.weeklyPlan.weekIndex,
      status: p.status,
      weeklyGoals: pctText(p.live),
      reportSnapshot: pctText(p.before),
      afterRebuild: pctText(p.after),
      change: p.changed ? "update" : "—",
    })),
  );

  const changes = plan.filter((p) => p.changed);
  console.log(`\n${changes.length} of ${plan.length} report(s) out of date.`);
  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply to update them.");
    return;
  }
  for (const p of changes) {
    await db.weeklyReport.update({
      where: { id: p.id },
      // numbers only — no note, comment, status or date column is part of this write
      data: { content: p.content as unknown as Prisma.InputJsonValue, generatedText: p.generatedText },
    });
  }
  console.log(`Updated ${changes.length} report(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    await pool.end();
  });
