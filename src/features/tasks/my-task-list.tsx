"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TaskPriorityMark, TaskStatusControl, TaskStatusMarker } from "@/features/tasks/task-status-control";
import { useServerAction } from "@/hooks/use-server-action";
import { postponeTaskAction, updateAdHocAction } from "@/actions/tasks";
import { addDays, formatDateAr, formatDayAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import type { PriorityKey, TaskStatusKey } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AdHocTaskRow, DailyTaskRow, GoalOption } from "@/server/queries/tasks";
import { TaskDetailSheet } from "./task-detail-sheet";
import { TaskRowMenu } from "./task-row-menu";

type MetaPart = { text: string; danger?: boolean };

/** Shared row layout: tappable title + one meta line, then the direct actions. */
function TaskRow({
  title,
  status,
  priority,
  overdue,
  meta,
  onOpen,
  actions,
}: {
  title: string;
  status: TaskStatusKey;
  priority: PriorityKey;
  overdue: boolean;
  meta: MetaPart[];
  onOpen: () => void;
  actions: React.ReactNode;
}) {
  const done = status === "COMPLETED";
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border bg-card py-2 ps-3 pe-1.5", overdue && !done && "border-danger/40 bg-danger-soft/40")}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-md py-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`تفاصيل المهمة: ${title}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          <TaskPriorityMark priority={priority} />
          <span className={cn("line-clamp-2 text-sm font-medium", done && "text-muted-foreground line-through")}>{title}</span>
        </span>
        {(meta.length > 0 || status !== "NOT_STARTED" || overdue) && (
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <TaskStatusMarker status={status} overdue={overdue} className="px-1.5 py-0 text-[11px]" />
            {meta.map((m) => (
              <span key={m.text} className={cn("tabular-nums", m.danger && "font-medium text-danger")}>
                {m.text}
              </span>
            ))}
          </span>
        )}
      </button>
      {actions}
    </div>
  );
}

export function DailyTaskItem({
  task,
  today,
  goals,
  currentUserId,
  canManage,
  showDate = true,
}: {
  task: DailyTaskRow;
  today: string;
  goals: GoalOption[];
  currentUserId: string;
  canManage: boolean;
  showDate?: boolean;
}) {
  const router = useRouter();
  const [details, setDetails] = useState(false);
  const postponeAction = useServerAction(postponeTaskAction, { onSuccess: () => router.refresh() });
  const canPostpone = !task.notionDriven && task.status !== "COMPLETED" && task.status !== "CANCELLED";
  const postponeTo = (newDate: string, reason?: string) =>
    postponeAction.run(task.id, {
      date: newDate,
      reason: reason ?? null,
    });
  const meta: MetaPart[] = [];
  if (showDate && task.date !== today) meta.push({ text: formatDayAr(task.date) });
  if (task.target > 0) meta.push({ text: `${formatNumber(task.achieved)} / ${formatNumber(task.target)} ${task.unit ?? ""}`.trim() });
  if (task.overdue && task.status !== "COMPLETED") meta.push({ text: `الموعد ${formatDateAr(task.deadline ?? task.date)}`, danger: true });
  return (
    <>
      <TaskRow
        title={task.title}
        status={task.status}
        priority={task.priority}
        overdue={task.overdue}
        meta={meta}
        onOpen={() => setDetails(true)}
        actions={
          <div className="flex shrink-0 items-center">
            <TaskStatusControl
              task={{
                id: task.id,
                kind: "daily",
                title: task.title,
                status: task.status,
                achieved: task.achieved,
                target: task.target,
                progress: task.progress,
                notes: task.notes,
                delayReason: task.delayReason,
                notionDriven: task.notionDriven,
              }}
              postpone={
                canPostpone
                  ? {
                      onTomorrow: () => postponeTo(addDays(task.date, 1)),
                      onNextWeek: () => postponeTo(addDays(task.date, 7)),
                      onCustomDate: (date, reason) => postponeTo(date, reason),
                      pending: postponeAction.pending,
                    }
                  : undefined
              }
            />
            <TaskRowMenu
              task={task}
              today={today}
              goals={goals}
              currentUserId={currentUserId}
              canManage={canManage}
              allowEdit={task.source === "MANUAL"}
              onOpenDetails={() => setDetails(true)}
            />
          </div>
        }
      />
      <TaskDetailSheet task={task} open={details} onOpenChange={setDetails} currentUserId={currentUserId} canManage={canManage} />
    </>
  );
}

export function AdHocTaskItem({
  task,
  today,
  currentUserId,
  canManage,
}: {
  task: AdHocTaskRow;
  today: string;
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const postponeAction = useServerAction(updateAdHocAction, { onSuccess: () => router.refresh() });
  // updateAdHocAction requires TASKS_ASSIGN server-side — only offer postpone to managers here
  const canPostpone = canManage && task.status !== "COMPLETED" && task.status !== "CANCELLED";
  const postponeTo = (newDate: string) =>
    postponeAction.run(task.id, {
      employeeId: task.employeeId,
      title: task.title,
      description: task.description,
      assignedDate: task.assignedDate,
      dueDate: newDate,
      priority: task.priority,
      includeInEvaluation: task.includeInEvaluation,
      weight: task.weight,
      isOutOfPlan: task.isOutOfPlan,
      compensatesGoalId: task.compensatesGoalId,
      notes: task.notes,
    });
  const [details, setDetails] = useState(false);
  const baseDate = task.dueDate ?? task.assignedDate;
  const meta: MetaPart[] = [];
  if (task.progress > 0 && task.status !== "COMPLETED") meta.push({ text: `${formatNumber(task.progress)}%` });
  if (task.dueDate && task.dueDate !== today && task.status !== "COMPLETED") meta.push({ text: `التسليم ${formatDateAr(task.dueDate)}`, danger: task.overdue });
  return (
    <>
      <TaskRow
        title={task.title}
        status={task.status}
        priority={task.priority}
        overdue={task.overdue}
        meta={meta}
        onOpen={() => setDetails(true)}
        actions={
          <div className="flex shrink-0 items-center">
            <TaskStatusControl
              task={{ id: task.id, kind: "adhoc", title: task.title, status: task.status, progress: task.progress, notes: task.notes, delayReason: task.delayReason }}
              postpone={
                canPostpone
                  ? {
                      onTomorrow: () => postponeTo(addDays(baseDate, 1)),
                      onNextWeek: () => postponeTo(addDays(baseDate, 7)),
                      onCustomDate: (date) => postponeTo(date),
                      pending: postponeAction.pending,
                    }
                  : undefined
              }
            />
            <TaskRowMenu task={task} today={today} currentUserId={currentUserId} canManage={canManage} allowEdit={false} onOpenDetails={() => setDetails(true)} />
          </div>
        }
      />
      <TaskDetailSheet task={task} open={details} onOpenChange={setDetails} currentUserId={currentUserId} canManage={canManage} />
    </>
  );
}
