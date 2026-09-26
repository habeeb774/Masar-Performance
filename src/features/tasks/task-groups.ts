import type { AdHocTaskRow, DailyTaskRow } from "@/server/queries/tasks";

/**
 * Buckets tasks into the sections shown on /my-tasks (today view) and the
 * employee dashboard's "مهام اليوم". Reuses the `overdue`/`status` flags the
 * queries already computed via `isOverdue`/`deriveTaskStatus` — no logic is
 * duplicated here, only grouping.
 */
export type TaskGroupKey = "urgent" | "today" | "upcoming" | "blocked" | "doneRecently";

export interface TaskGroup {
  key: TaskGroupKey;
  title: string;
  daily: DailyTaskRow[];
  adHoc: AdHocTaskRow[];
}

function partition<T>(list: T[], pred: (t: T) => boolean): { matched: T[]; remaining: T[] } {
  const matched: T[] = [];
  const remaining: T[] = [];
  for (const item of list) (pred(item) ? matched : remaining).push(item);
  return { matched, remaining };
}

export function groupTasks(dailyIn: DailyTaskRow[], adHocIn: AdHocTaskRow[], today: string): TaskGroup[] {
  let daily = dailyIn;
  let adHoc = adHocIn;

  const urgentDaily = partition(daily, (t) => t.priority === "URGENT" || t.overdue);
  const urgentAdHoc = partition(adHoc, (t) => t.priority === "URGENT" || t.overdue);
  daily = urgentDaily.remaining;
  adHoc = urgentAdHoc.remaining;

  const blockedDaily = partition(daily, (t) => t.status === "BLOCKED");
  const blockedAdHoc = partition(adHoc, (t) => t.status === "BLOCKED");
  daily = blockedDaily.remaining;
  adHoc = blockedAdHoc.remaining;

  const doneDaily = partition(daily, (t) => t.status === "COMPLETED");
  const doneAdHoc = partition(adHoc, (t) => t.status === "COMPLETED");
  daily = doneDaily.remaining;
  adHoc = doneAdHoc.remaining;

  const todayDaily = partition(daily, (t) => t.date === today);
  const todayAdHoc = partition(adHoc, (t) => t.dueDate === today);
  daily = todayDaily.remaining;
  adHoc = todayAdHoc.remaining;

  const groups: TaskGroup[] = [
    { key: "urgent", title: "عاجل ومتأخر", daily: urgentDaily.matched, adHoc: urgentAdHoc.matched },
    { key: "today", title: "اليوم", daily: todayDaily.matched, adHoc: todayAdHoc.matched },
    { key: "upcoming", title: "قادم", daily, adHoc },
    { key: "blocked", title: "بانتظار / متوقفة", daily: blockedDaily.matched, adHoc: blockedAdHoc.matched },
    { key: "doneRecently", title: "أُنجزت مؤخرًا", daily: doneDaily.matched, adHoc: doneAdHoc.matched },
  ];
  return groups.filter((g) => g.daily.length > 0 || g.adHoc.length > 0);
}
