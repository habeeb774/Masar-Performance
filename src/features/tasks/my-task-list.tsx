"use client";

import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { NotionSyncedTag } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { TaskStatusControl } from "@/features/tasks/task-status-control";
import { useServerAction } from "@/hooks/use-server-action";
import { updateAdHocAction, updateTaskAction } from "@/actions/tasks";
import { addDays, formatDateAr, formatDayAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { PRIORITY_LABELS, TASK_SOURCE_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AdHocTaskRow, DailyTaskRow, GoalOption } from "@/server/queries/tasks";
import { TaskRowMenu } from "./task-row-menu";

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
  const pct = task.target > 0 ? (task.achieved / task.target) * 100 : task.progress;
  const router = useRouter();
  const postponeAction = useServerAction(updateTaskAction, { onSuccess: () => router.refresh() });
  const canPostpone = task.source === "MANUAL" && task.status !== "COMPLETED" && task.status !== "CANCELLED";
  const postponeTo = (newDate: string) =>
    postponeAction.run(task.id, {
      title: task.title,
      description: task.description,
      date: newDate,
      deadline: task.deadline,
      target: task.target,
      achieved: task.achieved,
      progress: task.progress,
      status: task.status,
      priority: task.priority,
      monthlyGoalId: task.monthlyGoalId,
      notes: task.notes,
      delayReason: task.delayReason,
      employeeId: task.employeeId,
    });
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center", task.overdue && "border-danger/40 bg-danger-soft/40")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{task.title}</span>
          <StatusBadge tone="neutral" dot={false}>
            {TASK_SOURCE_LABELS[task.source]}
          </StatusBadge>
          {task.notionDriven && <NotionSyncedTag />}
          <EnumBadge map={PRIORITY_LABELS} value={task.priority} />
          {task.overdue && task.status !== "DELAYED" && <StatusBadge tone="danger">متأخرة</StatusBadge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {showDate && <span>{task.date === today ? "اليوم" : formatDayAr(task.date)}</span>}
          {task.deadline && (
            <span className={cn(task.overdue && "font-medium text-danger")}>
              <CalendarClock className="me-1 inline size-3" />
              الموعد: {formatDateAr(task.deadline)}
            </span>
          )}
          {task.goalName && <span>الهدف: {task.goalName}</span>}
        </div>
        {task.target > 0 && (
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar value={pct} size="sm" className="max-w-xs flex-1" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatNumber(task.achieved)} / {formatNumber(task.target)} {task.unit ?? ""}
            </span>
          </div>
        )}
        {(task.notes || task.delayReason) && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {task.notes}
            {task.delayReason && <span className="text-warning"> — السبب: {task.delayReason}</span>}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 sm:justify-end">
        <EnumBadge map={TASK_STATUS_LABELS} value={task.status} />
        <div className="flex items-center">
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
                    pending: postponeAction.pending,
                  }
                : undefined
            }
          />
          <TaskRowMenu task={task} today={today} goals={goals} currentUserId={currentUserId} canManage={canManage} allowEdit={task.source === "MANUAL"} />
        </div>
      </div>
    </div>
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
  const baseDate = task.dueDate ?? task.assignedDate;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] p-3 sm:flex-row sm:items-center",
        task.overdue && "border-danger/50 bg-danger-soft/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone="primary">تكليف مستجد</StatusBadge>
          <span className="text-sm font-medium">{task.title}</span>
          <EnumBadge map={PRIORITY_LABELS} value={task.priority} />
          {task.overdue && task.status !== "DELAYED" && <StatusBadge tone="danger">متأخر</StatusBadge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>كُلّفت: {formatDateAr(task.assignedDate)}</span>
          <span className={cn(task.overdue && "font-medium text-danger")}>
            <CalendarClock className="me-1 inline size-3" />
            التسليم: {task.dueDate ? (task.dueDate === today ? "اليوم" : formatDateAr(task.dueDate)) : "بدون موعد"}
          </span>
          {task.assignedByName && <span>من: {task.assignedByName}</span>}
        </div>
        {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
        <ProgressBar value={task.progress} size="sm" className="mt-2 max-w-xs" showLabel />
      </div>
      <div className="flex items-center justify-between gap-1 sm:justify-end">
        <EnumBadge map={TASK_STATUS_LABELS} value={task.status} />
        <div className="flex items-center">
          <TaskStatusControl
            task={{ id: task.id, kind: "adhoc", title: task.title, status: task.status, progress: task.progress, notes: task.notes, delayReason: task.delayReason }}
            postpone={
              canPostpone
                ? {
                    onTomorrow: () => postponeTo(addDays(baseDate, 1)),
                    onNextWeek: () => postponeTo(addDays(baseDate, 7)),
                    pending: postponeAction.pending,
                  }
                : undefined
            }
          />
          <TaskRowMenu task={task} today={today} currentUserId={currentUserId} canManage={canManage} allowEdit={false} />
        </div>
      </div>
    </div>
  );
}
