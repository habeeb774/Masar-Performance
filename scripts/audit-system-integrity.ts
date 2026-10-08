/** Read-only diagnostics: no repair mode, no business services, no title-based inference. */
import "dotenv/config";
import { Pool } from "pg";

const checks: Record<string, string> = {
  numeric_target_reached_not_completed: `SELECT "id", "monthlyGoalId", "target", "achieved", "status" FROM "DailyTask" WHERE "target" > 0 AND "achieved" >= "target" AND "status" NOT IN ('COMPLETED','BLOCKED','CANCELLED')`,
  progress_reached_not_completed: `SELECT "id", "status", "progress" FROM "DailyTask" WHERE "progress"=100 AND "status" NOT IN ('COMPLETED','BLOCKED','CANCELLED')`,
  completed_without_timestamp: `SELECT "id", "monthlyGoalId" FROM "DailyTask" WHERE "status"='COMPLETED' AND "completedAt" IS NULL`,
  completed_below_numeric_target_review: `SELECT "id", "monthlyGoalId", "target", "achieved" FROM "DailyTask" WHERE "status"='COMPLETED' AND "target">0 AND "achieved"<"target"`,
  goal_zero_with_completed_child: `SELECT DISTINCT g."id", g."planId", g."goalType", g."distributionMode", g."achievedValue" FROM "MonthlyGoal" g JOIN "DailyTask" t ON t."monthlyGoalId"=g."id" WHERE g."status"<>'CANCELLED' AND g."progressPct"=0 AND t."status"='COMPLETED'`,
  distributed_orphan_tasks: `SELECT "id", "weeklyGoalId", "monthlyGoalId", "status" FROM "DailyTask" WHERE "source"='DISTRIBUTED' AND ("monthlyGoalId" IS NULL OR ("weeklyGoalId" IS NULL AND "status"<>'CANCELLED'))`,
  task_wrong_owner_or_goal: `SELECT t."id", t."employeeId", t."monthlyGoalId", t."weeklyGoalId" FROM "DailyTask" t LEFT JOIN "MonthlyGoal" g ON g."id"=t."monthlyGoalId" LEFT JOIN "WeeklyGoal" w ON w."id"=t."weeklyGoalId" LEFT JOIN "WeeklyPlan" p ON p."id"=w."weeklyPlanId" WHERE (g."id" IS NOT NULL AND g."employeeId"<>t."employeeId") OR (w."id" IS NOT NULL AND (t."monthlyGoalId" IS DISTINCT FROM w."monthlyGoalId" OR p."monthlyPlanId" IS DISTINCT FROM g."planId" OR p."employeeId"<>t."employeeId"))`,
  task_outside_linked_week: `SELECT t."id", t."date", p."startDate", p."endDate" FROM "DailyTask" t JOIN "WeeklyGoal" w ON w."id"=t."weeklyGoalId" JOIN "WeeklyPlan" p ON p."id"=w."weeklyPlanId" WHERE t."status"<>'CANCELLED' AND (t."date"<p."startDate" OR t."date">p."endDate")`,
  tasks_outside_execution_span: `SELECT t."id", t."date", p."id" AS "planId", p."executionStartDate", p."executionEndDate" FROM "DailyTask" t JOIN "MonthlyGoal" g ON g."id"=t."monthlyGoalId" JOIN "MonthlyPlan" p ON p."id"=g."planId" WHERE t."status"<>'CANCELLED' AND (t."date"<p."executionStartDate" OR t."date">p."executionEndDate")`,
  quantitative_weekly_targets_mismatch: `SELECT g."id", g."targetValue", sum(w."targetValue") AS "weeklyTotal" FROM "MonthlyGoal" g JOIN "WeeklyGoal" w ON w."monthlyGoalId"=g."id" WHERE g."status"<>'CANCELLED' AND g."distributionMode"<>'DAILY' AND g."goalType"<>'PERCENTAGE' GROUP BY g."id" HAVING abs(sum(w."targetValue")-g."targetValue")>0.01`,
  duplicate_distributed_tasks: `SELECT "employeeId", "monthlyGoalId", "date", count(*) FROM "DailyTask" WHERE "source"='DISTRIBUTED' AND "status"<>'CANCELLED' GROUP BY "employeeId", "monthlyGoalId", "date" HAVING count(*)>1`,
  invalid_goal_dates: `SELECT "id", "startDate", "dueDate" FROM "MonthlyGoal" WHERE "startDate">"dueDate"`,
  overlapping_execution_plans: `SELECT a."id", b."id" AS "otherPlanId" FROM "MonthlyPlan" a JOIN "MonthlyPlan" b ON a."employeeId"=b."employeeId" AND a."id"<b."id" AND a."executionStartDate"<=b."executionEndDate" AND a."executionEndDate">=b."executionStartDate"`,
  evaluation_duty_weights: `SELECT e."id", e."status", sum(d."weight") AS "total" FROM "PerformanceEvaluation" e JOIN "EvaluationDuty" d ON d."evaluationId"=e."id" GROUP BY e."id" HAVING abs(sum(d."weight")-100)>0.01`,
  evaluation_indicator_weights: `SELECT d."id", e."status", sum(i."weight") AS "total" FROM "EvaluationDuty" d JOIN "PerformanceEvaluation" e ON e."id"=d."evaluationId" LEFT JOIN "EvaluationIndicator" i ON i."dutyId"=d."id" GROUP BY d."id", e."status" HAVING abs(coalesce(sum(i."weight"),0)-100)>0.01`,
  approved_evaluations_later_updated_review: `SELECT "id", "approvedAt", "updatedAt" FROM "PerformanceEvaluation" WHERE "status"='APPROVED' AND "updatedAt">"approvedAt" + interval '2 seconds'`,
  approved_reports_later_updated_review: `SELECT "id", "approvedAt", "updatedAt" FROM "WeeklyReport" WHERE "status"='APPROVED' AND "updatedAt">"approvedAt" + interval '2 seconds'`,
  evaluation_templates: `SELECT t."id", t."name", t."jobTitleId", d."title", d."weight" FROM "EvaluationTemplate" t JOIN "EvaluationTemplateDuty" d ON d."templateId"=t."id" ORDER BY t."id", d."sortOrder"`,
  rating_scales: `SELECT b."label", b."minScore", b."maxScore" FROM "PerformanceRatingBand" b`,
};

async function main() {
  if (process.argv.includes("--apply")) throw new Error("This audit has no write mode");
  const url = process.argv.includes("--test-db") ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error("Database URL missing");
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const result: Record<string, unknown> = {};
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    for (const [name, sql] of Object.entries(checks)) {
      await client.query("SAVEPOINT audit_check");
      try {
        const count = await client.query(`SELECT count(*)::int AS count FROM (${sql}) findings`);
        const sample = await client.query(`SELECT * FROM (${sql}) findings LIMIT 20`);
        result[name] = { count: count.rows[0].count, sample: sample.rows };
        await client.query("RELEASE SAVEPOINT audit_check");
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT audit_check");
        result[name] = { unavailable: e instanceof Error ? e.message : "Query failed" };
      }
    }
    await client.query("ROLLBACK");
    console.log(JSON.stringify({ mode: "READ_ONLY", databaseHost: new URL(url).hostname, findings: result },null,2));
  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Audit failed"); process.exitCode=1; });
