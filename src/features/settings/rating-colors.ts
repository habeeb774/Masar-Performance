/** Colors available for rating bands (stored as the key in PerformanceRatingBand.color). */
export const RATING_COLORS = ["emerald", "green", "blue", "sky", "amber", "orange", "red", "slate"] as const;
export type RatingColor = (typeof RATING_COLORS)[number];

export const RATING_COLOR_LABELS: Record<RatingColor, string> = {
  emerald: "زمردي",
  green: "أخضر",
  blue: "أزرق",
  sky: "سماوي",
  amber: "كهرماني",
  orange: "برتقالي",
  red: "أحمر",
  slate: "رمادي",
};

/** Literal class strings so Tailwind generates them. */
export const RATING_COLOR_CLASSES: Record<RatingColor, { solid: string; soft: string }> = {
  emerald: { solid: "bg-emerald-500", soft: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300" },
  green: { solid: "bg-green-500", soft: "bg-green-500/15 text-green-700 ring-green-500/30 dark:text-green-300" },
  blue: { solid: "bg-blue-500", soft: "bg-blue-500/15 text-blue-700 ring-blue-500/30 dark:text-blue-300" },
  sky: { solid: "bg-sky-500", soft: "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300" },
  amber: { solid: "bg-amber-500", soft: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300" },
  orange: { solid: "bg-orange-500", soft: "bg-orange-500/15 text-orange-700 ring-orange-500/30 dark:text-orange-300" },
  red: { solid: "bg-red-500", soft: "bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-300" },
  slate: { solid: "bg-slate-500", soft: "bg-slate-500/15 text-slate-700 ring-slate-500/30 dark:text-slate-300" },
};

export function ratingColorClasses(color: string | null | undefined) {
  return RATING_COLOR_CLASSES[(color ?? "slate") as RatingColor] ?? RATING_COLOR_CLASSES.slate;
}
