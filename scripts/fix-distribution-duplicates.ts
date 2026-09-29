/**
 * One-off maintenance utility for legacy ONE_TIME goals.
 *
 * It is intentionally not wired to package scripts or migrations. Run it only
 * after reviewing the target database and taking a backup:
 *   npx tsx scripts/fix-distribution-duplicates.ts
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString, max: 4 });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const goals = await db.monthlyGoal.findMany({
    where: { distributionMode: "ONE_TIME" },
    include: {
      dailyTasks: {
        where: { source: "DISTRIBUTED", status: { not: "CANCELLED" } },
        orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
      },
      weeklyGoals: true,
    },
  });

  let removed = 0;
  for (const goal of goals) {
    if (goal.dailyTasks.length === 0) continue;
    const completed = goal.dailyTasks.filter((task) => task.status === "COMPLETED");
    const keep = (completed.length > 0 ? completed : goal.dailyTasks)[0];
    const duplicateIds = goal.dailyTasks.filter((task) => task.id !== keep.id).map((task) => task.id);
    const isComplete = keep.status === "COMPLETED";

    await db.$transaction([
      ...(duplicateIds.length > 0 ? [db.dailyTask.deleteMany({ where: { id: { in: duplicateIds } } })] : []),
      ...goal.weeklyGoals.map((weeklyGoal) =>
        db.weeklyGoal.update({
          where: { id: weeklyGoal.id },
          data: {
            achievedValue: weeklyGoal.id === keep.weeklyGoalId && isComplete ? weeklyGoal.targetValue : 0,
            progressPct: weeklyGoal.id === keep.weeklyGoalId && isComplete ? 100 : 0,
            lastComputedAt: new Date(),
          },
        }),
      ),
      db.monthlyGoal.update({
        where: { id: goal.id },
        data: {
          achievedValue: isComplete ? goal.targetValue : 0,
          progressPct: isComplete ? 100 : 0,
          status: isComplete ? "COMPLETED" : "NOT_STARTED",
          lastComputedAt: new Date(),
        },
      }),
    ]);
    removed += duplicateIds.length;
    console.log(`${goal.id}: kept ${keep.id}, removed ${duplicateIds.length}`);
  }

  console.log(`Done. ONE_TIME goals checked: ${goals.length}; duplicate tasks removed: ${removed}.`);
  console.log("MonthlyPlan progress is derived live from its recalculated MonthlyGoals; it has no stored progress columns.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    await pool.end();
  });
