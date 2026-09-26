"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { KeyValue, NotionSyncedTag } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { AttachmentsPanel } from "@/features/attachments/attachments-panel";
import { CommentsThread } from "@/features/comments/comments-thread";
import { formatDateAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { PRIORITY_LABELS, TASK_SOURCE_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import type { AdHocTaskRow, DailyTaskRow } from "@/server/queries/tasks";

/** Side sheet with a task's details, attachments and discussion. */
export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  currentUserId,
  canManage,
}: {
  task: DailyTaskRow | AdHocTaskRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  canManage: boolean;
}) {
  const isAdHoc = task.kind === "adhoc";
  const progress = task.kind === "daily" && task.target > 0 ? (task.achieved / task.target) * 100 : task.progress;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pe-10">
          <div className="flex flex-wrap items-center gap-2">
            {isAdHoc ? <StatusBadge tone="primary">تكليف مستجد</StatusBadge> : <StatusBadge tone="neutral">{TASK_SOURCE_LABELS[task.source]}</StatusBadge>}
            {task.kind === "daily" && task.notionDriven && <NotionSyncedTag />}
            {task.overdue && <StatusBadge tone="danger">متأخرة</StatusBadge>}
          </div>
          <SheetTitle className="text-base leading-snug">{task.title}</SheetTitle>
          <SheetDescription>{task.employeeName}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {task.description && <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{task.description}</p>}
          <div className="divide-y rounded-lg border px-3">
            <KeyValue label="الحالة">
              <EnumBadge map={TASK_STATUS_LABELS} value={task.status} />
            </KeyValue>
            <KeyValue label="الأولوية">
              <EnumBadge map={PRIORITY_LABELS} value={task.priority} />
            </KeyValue>
            {task.kind === "daily" ? (
              <>
                <KeyValue label="التاريخ">{formatDateAr(task.date)}</KeyValue>
                <KeyValue label="الموعد النهائي">{formatDateAr(task.deadline)}</KeyValue>
                {task.goalName && <KeyValue label="الهدف المرتبط">{task.goalName}</KeyValue>}
                {task.target > 0 && (
                  <KeyValue label="المنجز / المستهدف">
                    {formatNumber(task.achieved)} / {formatNumber(task.target)} {task.unit ?? ""}
                  </KeyValue>
                )}
              </>
            ) : (
              <>
                <KeyValue label="تاريخ التكليف">{formatDateAr(task.assignedDate)}</KeyValue>
                <KeyValue label="موعد التسليم">{formatDateAr(task.dueDate)}</KeyValue>
                {task.assignedByName && <KeyValue label="المكلِّف">{task.assignedByName}</KeyValue>}
                <KeyValue label="يدخل في التقييم">{task.includeInEvaluation ? `نعم — الوزن ${formatNumber(task.weight)}%` : "لا"}</KeyValue>
                <KeyValue label="خارج الخطة">{task.isOutOfPlan ? "نعم" : "لا"}</KeyValue>
                {task.compensatesGoalName && <KeyValue label="يعوض الهدف">{task.compensatesGoalName}</KeyValue>}
              </>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">التقدم</p>
            <ProgressBar value={progress} showLabel />
          </div>
          {task.notes && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">ملاحظات</p>
              <p className="text-sm whitespace-pre-wrap">{task.notes}</p>
            </div>
          )}
          {task.delayReason && (
            <div className="space-y-1 rounded-lg border border-warning/30 bg-warning-soft p-3">
              <p className="text-xs font-medium text-warning">سبب التأخير / التعليق</p>
              <p className="text-sm whitespace-pre-wrap">{task.delayReason}</p>
            </div>
          )}
          <Separator />
          {open && (
            <>
              <AttachmentsPanel entityType={isAdHoc ? "AD_HOC_TASK" : "DAILY_TASK"} entityId={task.id} currentUserId={currentUserId} canManage={canManage} />
              <Separator />
              <CommentsThread entityType={isAdHoc ? "AD_HOC_TASK" : "DAILY_TASK"} entityId={task.id} currentUserId={currentUserId} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
