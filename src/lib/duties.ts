/**
 * «الواجب» a goal belongs to: its template duty name, or — for goals without
 * one (older plans, uncategorized templates) — a title derived from its KPI
 * category. Screens, reports and the HR Excel export all group through here.
 */

export const CATEGORY_DUTY_TITLES = {
  COMMITMENT: "الالتزام بسلوكيات وآليات العمل.",
  PRODUCTIVITY: "الإنتاجية",
  QUALITY: "جودة العمل",
  DEVELOPMENT: "التطوير المهني",
} as const;

export type DutyCategory = keyof typeof CATEGORY_DUTY_TITLES;

export const ADHOC_DUTY_TITLE = "مهام مستجدة كُلّف بها خلال الشهر";

export function categoryDuty(category: string | null | undefined): string {
  return CATEGORY_DUTY_TITLES[(category ?? "PRODUCTIVITY") as DutyCategory] ?? CATEGORY_DUTY_TITLES.PRODUCTIVITY;
}

export function dutyOf(goal: { dutyName?: string | null; category?: string | null }): string {
  return goal.dutyName?.trim() || categoryDuty(goal.category);
}

/** Group items by duty, keeping the order in which duties first appear. */
export function groupByDuty<T>(items: T[], duty: (item: T) => string): { duty: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = duty(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].map(([d, list]) => ({ duty: d, items: list }));
}
