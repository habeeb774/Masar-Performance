"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { EnumBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { AttachmentsPanel } from "@/features/attachments/attachments-panel";
import { useServerAction } from "@/hooks/use-server-action";
import { updateTaskProgressAction } from "@/actions/tasks";
import { formatDateAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import type { DailyTaskRow } from "@/server/queries/tasks";

/**
 * Distraction-free single-task view: no sidebar/header chrome, just the task
 * content and one big completion button. Notes stand in for a checklist —
 * the schema has no per-item checklist field on DailyTask.
 */
export function FocusMode({ task, currentUserId, canManage }: { task: DailyTaskRow; currentUserId: string; canManage: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState(task.notes ?? "");
  const done = task.status === "COMPLETED";
  const progress = task.target > 0 ? (task.achieved / task.target) * 100 : task.progress;

  const { run, pending } = useServerAction(updateTaskProgressAction, {
    onSuccess: () => router.push("/my-tasks"),
  });

  const complete = () =>
    run(task.id, {
      status: "COMPLETED",
      achieved: task.notionDriven ? undefined : Math.max(task.target, task.achieved),
      progress: 100,
      notes,
      delayReason: task.delayReason,
    });

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 py-4">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="إغلاق" asChild>
          <Link href="/my-tasks">
            <X />
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">وضع التركيز</span>
      </div>

      <div className="flex-1 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <EnumBadge map={PRIORITY_LABELS} value={task.priority} />
          <EnumBadge map={TASK_STATUS_LABELS} value={task.status} />
          {task.overdue && <span className="text-xs font-medium text-danger">متأخرة</span>}
        </div>

        <h1 className="text-2xl font-bold leading-snug">{task.title}</h1>

        {task.description && <p className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>}

        <div className="divide-y rounded-xl border px-4">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-muted-foreground">التاريخ</span>
            <span>{formatDateAr(task.date)}</span>
          </div>
          {task.deadline && (
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">الموعد النهائي</span>
              <span>{formatDateAr(task.deadline)}</span>
            </div>
          )}
          {task.goalName && (
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">الهدف المرتبط</span>
              <span>{task.goalName}</span>
            </div>
          )}
          {task.target > 0 && (
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">المنجز / المستهدف</span>
              <span>
                {formatNumber(task.achieved)} / {formatNumber(task.target)} {task.unit ?? ""}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">التقدم</p>
          <ProgressBar value={progress} showLabel size="lg" />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="focus-notes" className="text-xs text-muted-foreground">
            ملاحظات
          </label>
          <textarea
            id="focus-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            disabled={done}
            className="w-full resize-none rounded-xl border bg-background p-3 text-sm shadow-[var(--shadow-inset)] outline-none focus-visible:shadow-[var(--shadow-inset-focus)] disabled:opacity-60"
            placeholder="أضف ملاحظاتك حول تنفيذ المهمة…"
          />
        </div>

        <Separator />
        <AttachmentsPanel entityType="DAILY_TASK" entityId={task.id} currentUserId={currentUserId} canManage={canManage} />
      </div>

      <div className="sticky bottom-4 mt-6 pt-2">
        <Button
          size="lg"
          className="h-14 w-full rounded-2xl text-base font-semibold shadow-[var(--shadow-raised)]"
          disabled={pending || done}
          onClick={complete}
        >
          {pending ? <Spinner /> : <CheckCircle2 />}
          {done ? "المهمة مكتملة" : "إكمال"}
        </Button>
      </div>
    </div>
  );
}
