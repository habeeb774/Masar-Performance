import { diffDays, type DateKey } from "./dates";

export type GoalStatusKey = "NOT_STARTED" | "IN_PROGRESS" | "AT_RISK" | "COMPLETED" | "PARTIAL" | "CANCELLED";
export type TaskStatusKey = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PARTIAL" | "DELAYED" | "BLOCKED" | "CANCELLED";

/**
 * Derive a goal status from progress and elapsed time.
 * AT_RISK when actual progress trails the time-proportional expectation by 30%+.
 */
export function deriveGoalStatus(input: {
  current: GoalStatusKey;
  progressPct: number;
  start: DateKey;
  end: DateKey;
  today: DateKey;
}): GoalStatusKey {
  const { current, progressPct, start, end, today } = input;
  if (current === "CANCELLED") return current;
  if (progressPct >= 100) return "COMPLETED";
  if (today > end) return "PARTIAL";
  if (today < start) return progressPct > 0 ? "IN_PROGRESS" : "NOT_STARTED";
  const total = Math.max(diffDays(end, start) + 1, 1);
  const elapsed = Math.min(Math.max(diffDays(today, start) + 1, 0), total);
  const expected = (elapsed / total) * 100;
  if (elapsed / total >= 0.25 && progressPct < expected * 0.7) return "AT_RISK";
  return progressPct > 0 ? "IN_PROGRESS" : "NOT_STARTED";
}

/** Auto status for a task measured against a numeric target. */
export function deriveTaskStatus(input: {
  current: TaskStatusKey;
  achieved: number;
  target: number;
  date: DateKey;
  today: DateKey;
}): TaskStatusKey {
  const { current, achieved, target, date, today } = input;
  if (current === "BLOCKED" || current === "CANCELLED") return current;
  if (target > 0 && achieved >= target) return "COMPLETED";
  if (date < today) return achieved > 0 ? "PARTIAL" : "DELAYED";
  return achieved > 0 ? "IN_PROGRESS" : current === "COMPLETED" ? "IN_PROGRESS" : current === "DELAYED" ? "NOT_STARTED" : current;
}

/** Whether a manually tracked task is overdue. */
export function isOverdue(status: TaskStatusKey, deadline: DateKey | null, today: DateKey): boolean {
  if (!deadline) return false;
  if (status === "COMPLETED" || status === "CANCELLED") return false;
  return deadline < today;
}
