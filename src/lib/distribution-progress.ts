import { num, pct } from "./num";

export type DistributionProgressTask = { achieved: unknown; target?: unknown; status: string; source?: string };

export function manualAchieved(goalType: string, dailyTasks: DistributionProgressTask[], adjust: number) {
  const tasks = dailyTasks.filter((task) => task.status !== "CANCELLED");
  const fromTasks =
    goalType === "BOOLEAN"
      ? tasks.some((task) => task.status === "COMPLETED")
        ? 1
        : 0
      : tasks.reduce((sum, task) => {
          const achieved = num(task.achieved);
          const target = num(task.target);
          // In Masar, COMPLETED means the task target was fulfilled. Older rows may
          // have status=COMPLETED but achieved=0 because the status dialog did not
          // fill the numeric value; count them as their target instead of 0.
          return sum + (task.status === "COMPLETED" && target > achieved ? target : achieved);
        }, 0);
  const total = fromTasks + adjust;
  return Math.max(goalType === "BOOLEAN" ? Math.min(total, 1) : total, 0);
}

/** Progress semantics are selected by distribution mode, never by measurement type. */
export function distributionProgress(
  distributionMode: "DISTRIBUTED" | "ONE_TIME" | "DAILY",
  goalType: string,
  target: number,
  dailyTasks: DistributionProgressTask[],
  adjust = 0,
) {
  const tasks = dailyTasks.filter((task) => task.status !== "CANCELLED");
  if (distributionMode === "ONE_TIME") {
    const completed = tasks.some((task) => task.status === "COMPLETED");
    return { achieved: completed ? target : 0, progress: completed ? 100 : 0 };
  }
  if (distributionMode === "DAILY") {
    const expected = tasks.filter((task) => !task.source || task.source === "DISTRIBUTED").length;
    const completed = tasks.filter((task) => (!task.source || task.source === "DISTRIBUTED") && task.status === "COMPLETED").length;
    return { achieved: completed, progress: expected > 0 ? (completed / expected) * 100 : 0 };
  }
  const achieved = manualAchieved(goalType, tasks, adjust);
  return { achieved, progress: pct(achieved, target) };
}
