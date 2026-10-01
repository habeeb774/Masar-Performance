/**
 * Build the official monthly evaluation (the manager's Excel model) for one employee and month.
 * DRY RUN by default: prints the duties, indicators, scores and rating it would create — writes
 * nothing. `--apply` creates the evaluation (needs the 20261002010000_performance_evaluations
 * migration). Plans, goals and reports are only read, never changed.
 *
 *   npx tsx scripts/create-monthly-evaluation.ts --employee=<id> --year=2026 --month=9 [--apply] [--test-db]
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

// server services import "server-only": re-run with a shim that resolves it to an empty module
const SHIM = new URL("./support/server-only-shim.mjs", import.meta.url).href;
if (!process.env.MASAR_SCRIPT_SHIM) {
  const child = spawnSync(process.execPath, ["--import", SHIM, "--import", "tsx", process.argv[1], ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, MASAR_SCRIPT_SHIM: "1" } });
  process.exit(child.status ?? 1);
}

const KNOWN = ["employee", "year", "month", "apply", "test-db"];
const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m || !KNOWN.includes(m[1])) throw new Error(`Unknown argument: ${a}`);
    return [m[1], m[2] ?? "true"] as const;
  }),
);
if (args.get("test-db") === "true") {
  if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST is not set");
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

async function main() {
  const employeeId = args.get("employee");
  const year = Number(args.get("year"));
  const month = Number(args.get("month"));
  if (!employeeId || !Number.isInteger(year) || !(month >= 1 && month <= 12)) throw new Error("--employee, --year and --month are required");
  const apply = args.get("apply") === "true";
  const ev = await import("../src/server/services/evaluation");
  const url = new URL(process.env.DATABASE_URL!);
  console.log(`${apply ? "APPLY" : "DRY RUN"} on ${url.host}${url.pathname}\n`);

  const p = await ev.previewEvaluation(employeeId, year, month);
  console.log(`${p.employee.name} — ${p.employee.jobTitle ?? "—"} — ${p.employee.department ?? "—"}`);
  console.log(`Plan: ${p.plan ? `${p.plan.id} (${p.plan.status})` : "none"} · period ${p.period.start} → ${p.period.end}\n`);
  for (const [di, d] of p.duties.entries()) {
    console.log(`── ${d.title} — weight ${d.weight}%`);
    console.table(
      d.indicators.map((x, ii) => ({
        indicator: x.title.slice(0, 48),
        source: x.sourceType + (x.matched ? "" : " (no match)"),
        achieved: x.achieved,
        target: x.target,
        weight: x.weight,
        score: r3(p.result.duties[di].indicators[ii].score),
        rate: r3(p.result.duties[di].indicators[ii].weightedScore),
      })),
    );
    console.log(`   duty result ${r3(p.result.duties[di].score)} → ${r3(p.result.duties[di].rate)} of the final score\n`);
  }
  console.log(`FINAL ${r3(p.result.finalScore)} — ${p.result.rating}`);
  if (p.unusedGoals.length) console.log(`\nPlan goals not used by any indicator (the manager can add them):\n   ${p.unusedGoals.join("\n   ")}`);
  if (p.adHocExcluded) console.log(`\n${p.adHocExcluded} ad-hoc task(s) in the period are not marked «يدخل في تقييم الشهر» — not in duty 4.`);
  if (p.validation.length) console.log(`\nTo fix before approval:\n   ${p.validation.join("\n   ")}`);

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to create this evaluation as a DRAFT.");
    return;
  }
  const created = await ev.createEvaluation(null, employeeId, year, month);
  console.log(`\nCreated evaluation ${created.id} (DRAFT) — open /performance/evaluations/${created.id}`);
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
