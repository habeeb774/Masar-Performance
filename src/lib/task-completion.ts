import type { TaskStatusKey } from "./goal-status";

/** One completion policy for manual, generated, imported and ad-hoc task writers. */
export function taskCompletion(input: {
  status: TaskStatusKey; target: number; achieved: number; progress: number;
  completedAt?: Date | null; now?: Date;
}) {
  let { status, achieved, progress } = input;
  const numeric = input.target > 0;
  if (status !== "BLOCKED" && status !== "CANCELLED") {
    // Explicit completion is a declaration that all target work was performed.
    if (status === "COMPLETED") {
      if (numeric) achieved = Math.max(achieved, input.target);
      progress = 100;
    } else {
      progress = numeric ? Math.min(100, Math.floor(achieved / input.target * 100)) : progress;
      if ((numeric && achieved >= input.target) || (!numeric && progress >= 100)) status = "COMPLETED";
      else if (progress > 0 && status === "NOT_STARTED") status = "IN_PROGRESS";
    }
  }
  return { status, achieved, progress, completedAt: status === "COMPLETED" ? input.completedAt ?? input.now ?? new Date() : null };
}
