import { num, round2 } from "./num";

type GoalLike = { weight: unknown; progressPct: unknown; status: string; breakdown?: unknown };

/** The one weighted-progress formula — week page, dashboards and reports all use it. */
export function weightedProgress(goals: GoalLike[]) {
  const active = goals.filter((g) => g.status !== "CANCELLED");
  if (active.length === 0) return 0;
  const w = active.reduce((a, g) => a + num(g.weight), 0);
  return round2(
    w > 0
      ? active.reduce((a, g) => a + Math.min(num(g.progressPct), 100) * num(g.weight), 0) / w
      : active.reduce((a, g) => a + Math.min(num(g.progressPct), 100), 0) / active.length,
  );
}
