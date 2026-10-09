import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/user-error";
import type { AuthUser } from "@/server/auth/session";
import { fromDateKey, todayKey } from "@/lib/dates";
import { interpret, nextAchieved, type IntentKind } from "@/lib/intent";
import { num } from "@/lib/num";
import { getCompany } from "./company";
import { updateTaskProgress } from "./tasks";

/**
 * «ماذا أنجزت؟» — understand a sentence («أضفت 5 منتجات جديدة») against the employee's open
 * work, then record it through the normal task update (auto-completion, recompute, evaluation).
 */

/** The employee's open work for today and anything overdue — what a sentence can refer to. */
async function openTasks(employeeId: string, today: string) {
  const rows = await db.dailyTask.findMany({
    where: { employeeId, date: { lte: fromDateKey(today) }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: { id: true, title: true, achieved: true, target: true, source: true, monthlyGoal: { select: { unit: true, source: true } } },
    orderBy: { date: "desc" },
    take: 60,
  });
  // one line per title (most recent first); Notion-driven tasks update themselves
  const seen = new Set<string>();
  return rows
    .filter((t) => !(t.monthlyGoal?.source === "NOTION" && t.source !== "MANUAL"))
    .filter((t) => (seen.has(t.title) ? false : (seen.add(t.title), true)))
    .map((t) => ({ id: t.id, title: t.title, achieved: num(t.achieved), target: num(t.target), unit: t.monthlyGoal?.unit ?? "" }));
}

export interface QuickUpdatePreview {
  kind: IntentKind;
  amount: number | null;
  /** best match first; more than one = the employee picks */
  options: { taskId: string; title: string; unit: string; from: number; to: number; target: number }[];
  /** what can be picked when nothing matched */
  openTitles: { taskId: string; title: string }[];
}

export async function previewQuickUpdate(user: AuthUser, text: string, today?: string): Promise<QuickUpdatePreview> {
  if (!user.employeeId) throw new UserError("حسابك غير مرتبط بملف موظف");
  const day = today ?? todayKey((await getCompany()).timezone);
  const tasks = await openTasks(user.employeeId, day);
  const r = interpret(text, tasks);
  const top = r.matches[0]?.score ?? 0;
  // close calls are offered as choices; a clear winner is offered alone
  const picked = r.matches.filter((m) => m.score >= top - 0.15).slice(0, 3);
  return {
    kind: r.kind,
    amount: r.amount,
    options: picked.map(({ candidate: t }) => ({ taskId: t.id, title: t.title, unit: t.unit, from: t.achieved, to: nextAchieved(r.kind, r.amount, t.achieved, t.target), target: t.target })),
    openTitles: picked.length ? [] : tasks.slice(0, 8).map((t) => ({ taskId: t.id, title: t.title })),
  };
}

export async function applyQuickUpdate(user: AuthUser, taskId: string, kind: IntentKind, amount: number | null) {
  const task = await db.dailyTask.findUnique({ where: { id: taskId } });
  if (!task || task.employeeId !== user.employeeId) throw new UserError("المهمة غير موجودة");
  if (kind !== "complete" && amount === null) throw new UserError("اكتب العدد الذي أنجزته");
  return updateTaskProgress(user, taskId, {
    status: kind === "complete" ? "COMPLETED" : task.status === "NOT_STARTED" ? "IN_PROGRESS" : task.status,
    achieved: nextAchieved(kind, amount, num(task.achieved), num(task.target)),
    // keep what the employee already wrote on the task
    notes: task.notes,
    delayReason: task.delayReason,
  });
}
