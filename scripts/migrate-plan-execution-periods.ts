/**
 * Move plans onto explicit execution periods — generic, for any plan / employee / month.
 * DRY RUN by default: prints what would change and writes nothing. `--apply` writes.
 *
 *   npx tsx scripts/migrate-plan-execution-periods.ts [selection] [action] [--apply] [--test-db]
 *
 * Selection (combine freely): --plan=<id>  --employee=<id>  --year=YYYY  --month=M
 *
 * Actions on the selected plans:
 *   --mode=rebuild (default)  keep identities, achievement, completed tasks and reports;
 *                             move the weeks and re-schedule pending tasks
 *   --mode=reset              clean start: drop weeks, weekly goals, reports and generated
 *                             pending tasks, regenerate from the new period (goals are kept)
 *   --start=YYYY-MM-DD        execution start (default: the day after the employee's previous plan)
 *   --weeks=N                 weeks count (default: the plan's current count, else 4)
 *
 *   --purge-before=YYYY-MM    delete the selected employee's plans whose administrative month is
 *                             before YYYY-MM (with their tasks, reports, attachments, comments).
 *                             Runs first; can be combined with an action on the remaining plans.
 *
 * Example — clean start from October 2026:
 *   npx tsx scripts/migrate-plan-execution-periods.ts --employee=<id> --purge-before=2026-10 \
 *     --year=2026 --month=10 --mode=reset --start=2026-10-03 --weeks=4
 *
 * Every change is transactional and audited (plan.execution_period_rebuilt / plan.purged).
 * Review the dry run and take a backup before --apply on production.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

// server services import "server-only": re-run with a shim that resolves it to an empty module
const SHIM = new URL("./support/server-only-shim.mjs", import.meta.url).href;
if (!process.env.MASAR_SCRIPT_SHIM) {
  const child = spawnSync(process.execPath, ["--import", SHIM, "--import", "tsx", process.argv[1], ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, MASAR_SCRIPT_SHIM: "1" } });
  process.exit(child.status ?? 1);
}

const KNOWN = ["plan", "employee", "year", "month", "mode", "start", "weeks", "purge-before", "apply", "test-db", "dry-run"];
const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m || !KNOWN.includes(m[1])) throw new Error(`Unknown argument: ${a}`);
    return [m[1], m[2] ?? "true"] as const;
  }),
);
const apply = args.get("apply") === "true";
if (args.get("test-db") === "true") {
  if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST is not set");
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

async function main() {
  const { db } = await import("../src/server/db");
  const { purgePlans, rebuildPlanExecutionPeriod, resetPlanExecutionPeriod } = await import("../src/server/services/plan-execution");
  const { firstPeriodStart } = await import("../src/server/services/periods");
  const { DEFAULT_WEEKS_COUNT } = await import("../src/lib/execution-period");
  const { isDateKey } = await import("../src/lib/dates");

  const mode = args.get("mode") ?? "rebuild";
  if (!["rebuild", "reset"].includes(mode)) throw new Error("--mode must be rebuild or reset");
  const start = args.get("start");
  if (start && !isDateKey(start)) throw new Error("--start must be YYYY-MM-DD");
  const weeks = args.has("weeks") ? Number(args.get("weeks")) : undefined;
  const employeeId = args.get("employee");
  const where = {
    ...(args.has("plan") ? { id: args.get("plan") } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(args.has("year") ? { year: Number(args.get("year")) } : {}),
    ...(args.has("month") ? { month: Number(args.get("month")) } : {}),
  };
  const url = new URL(process.env.DATABASE_URL!);
  console.log(`${apply ? "APPLY" : "DRY RUN"} on ${url.host}${url.pathname}\n`);

  const purge = args.get("purge-before");
  if (purge) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(purge);
    if (!m) throw new Error("--purge-before must be YYYY-MM");
    const [y, mo] = [Number(m[1]), Number(m[2])];
    const report = await purgePlans({ ...(employeeId ? { employeeId } : {}), OR: [{ year: { lt: y } }, { year: y, month: { lt: mo } }] }, apply);
    console.log(`── Purge plans before ${purge}${employeeId ? ` (employee ${employeeId})` : " (ALL employees)"}`);
    console.table(report.plans.map((p) => ({ plan: p.id, employee: p.employeeId, month: `${p.year}-${String(p.month).padStart(2, "0")}` })));
    console.table(report.counts);
    console.log(report.applied ? "Deleted.\n" : "Would delete the rows above.\n");
  }

  const hasSelection = ["plan", "year", "month"].some((k) => args.has(k)) || ((args.has("start") || args.has("weeks") || args.has("mode")) && !!employeeId);
  if (!hasSelection) return;
  const plans = await db.monthlyPlan.findMany({ where, select: { id: true, employeeId: true, year: true, month: true, weeksCount: true, employee: { select: { fullName: true } } }, orderBy: [{ year: "asc" }, { month: "asc" }] });
  if (plans.length === 0) console.log("No plan matches the selection.");
  let failed = false;
  for (const plan of plans) {
    const executionStartDate = start ?? (await firstPeriodStart(plan.employeeId, plan.year, plan.month));
    const weeksCount = weeks ?? plan.weeksCount ?? DEFAULT_WEEKS_COUNT;
    const run = mode === "reset" ? resetPlanExecutionPeriod : rebuildPlanExecutionPeriod;
    const r = await run(plan.id, { executionStartDate, weeksCount, apply });
    console.log(`── ${mode.toUpperCase()} plan ${plan.id} — ${plan.employee.fullName} — ${plan.year}-${String(plan.month).padStart(2, "0")}`);
    console.log(`Before: ${r.before.start} → ${r.before.end} (${r.before.weeksCount} weeks)`);
    r.before.weeks.forEach((w) => console.log(`   ${w}`));
    console.log(`After:  ${r.after.start} → ${r.after.end} (${r.after.weeksCount} weeks)`);
    r.after.weeks.forEach((w) => console.log(`   ${w}`));
    console.table({
      "WeeklyPlans removed": r.weeklyPlansRemoved,
      "WeeklyPlans created": r.weeklyPlansCreated,
      "WeeklyPlans moved": r.weeklyPlansMoved,
      "WeeklyGoals affected": r.weeklyGoalsAffected,
      "DailyTasks moved": r.dailyTasks.moved,
      "DailyTasks removed": r.dailyTasks.removed,
      "DailyTasks cancelled": r.dailyTasks.cancelled,
      "DailyTasks created": mode === "reset" && !r.applied ? "regenerated on --apply" : r.dailyTasks.created,
      "Completed tasks protected": r.protectedCompletedTasks,
      "Reports affected (kept)": r.reportsAffected,
      "Reports removed": r.reportsRemoved,
    });
    if (r.conflicts.length) {
      failed = true;
      console.log("Conflicts (nothing written for this plan):");
      r.conflicts.forEach((c) => console.log(`   ! ${c}`));
    }
    console.log(r.applied ? "Applied.\n" : apply ? "NOT applied.\n" : "Dry run — nothing written.\n");
  }
  if (!apply) console.log("Re-run with --apply to write these changes.");
  if (failed) process.exitCode = 2;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { db } = await import("../src/server/db");
    await db.$disconnect();
  });
