import type { Tone } from "@/lib/labels";

export type TeamStanding = "LATE" | "ATTENTION" | "ON_TRACK" | "EXCELLENT" | "NO_PLAN";

/** The only labels a manager sees for an employee's month. */
export const STANDING: Record<TeamStanding, { label: string; tone: Tone }> = {
  LATE: { label: "متأخر", tone: "danger" },
  ATTENTION: { label: "يحتاج انتباه", tone: "warning" },
  NO_PLAN: { label: "بدون خطة", tone: "neutral" },
  ON_TRACK: { label: "على المسار", tone: "info" },
  EXCELLENT: { label: "ممتاز", tone: "success" },
};

export const STANDING_ORDER: Record<TeamStanding, number> = { LATE: 0, ATTENTION: 1, NO_PLAN: 2, ON_TRACK: 3, EXCELLENT: 4 };

/** One plain-language status per employee: late work or falling well behind the month's pace (0–100). */
export function teamStanding(r: { planId: string | null; monthly: number; delayed: number }, pace: number): TeamStanding {
  if (!r.planId) return "NO_PLAN";
  const behind = pace - r.monthly;
  if (r.monthly >= 95) return "EXCELLENT";
  if (r.delayed > 0 && behind > 15) return "LATE";
  if (r.delayed > 0 || behind > 10) return "ATTENTION";
  return "ON_TRACK";
}
