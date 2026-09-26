"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, MessageSquarePlus, MessageSquareText, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { updateAdHocProgressAction, updateTaskProgressAction } from "@/actions/tasks";
import { TASK_STATUS_LABELS, TASK_STATUSES, type PriorityKey, type TaskStatusKey, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface TaskControlData {
  id: string;
  kind: "daily" | "adhoc";
  title: string;
  status: TaskStatusKey;
  achieved?: number;
  target?: number;
  progress: number;
  notes: string | null;
  delayReason: string | null;
  /** numbers come from Notion — only notes / delay reason are editable */
  notionDriven?: boolean;
}

const STATUS_MARKERS: Partial<Record<TaskStatusKey, { label: string; tone: Tone }>> = {
  IN_PROGRESS: { label: "قيد العمل", tone: "info" },
  COMPLETED: { label: "تم", tone: "success" },
  PARTIAL: { label: "جزئي", tone: "warning" },
  DELAYED: { label: "متأخر", tone: "danger" },
  BLOCKED: { label: "معلق", tone: "blocked" },
  CANCELLED: { label: "ملغاة", tone: "blocked" },
};

/** Status word shown only when it differs from the default «لم تبدأ». */
export function TaskStatusMarker({ status, overdue, className }: { status: TaskStatusKey; overdue?: boolean; className?: string }) {
  const marker = overdue && status !== "COMPLETED" && status !== "CANCELLED" ? STATUS_MARKERS.DELAYED : STATUS_MARKERS[status];
  if (!marker) return null;
  return (
    <StatusBadge tone={marker.tone} className={className}>
      {marker.label}
    </StatusBadge>
  );
}

/** Priority mark shown only for high / urgent tasks. */
export function TaskPriorityMark({ priority }: { priority: PriorityKey }) {
  if (priority === "URGENT") {
    return (
      <StatusBadge tone="danger" dot={false} className="px-1.5 py-0 text-[11px]">
        عاجل
      </StatusBadge>
    );
  }
  if (priority === "HIGH") {
    return (
      <span className="inline-flex size-2 shrink-0 rounded-full bg-warning" title="أولوية عالية">
        <span className="sr-only">أولوية عالية</span>
      </span>
    );
  }
  return null;
}

export interface PostponeHandlers {
  onTomorrow: () => void;
  onNextWeek: () => void;
  pending?: boolean;
}

export function TaskStatusControl({
  task,
  compact = false,
  postpone,
}: {
  task: TaskControlData;
  compact?: boolean;
  /** omit to hide the postpone menu entirely (e.g. Notion-synced / distributed tasks) */
  postpone?: PostponeHandlers;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<TaskStatusKey>(task.status);
  const [achieved, setAchieved] = useState(String(task.achieved ?? 0));
  const [progress, setProgress] = useState(String(task.progress));
  const [notes, setNotes] = useState(task.notes ?? "");
  const [delayReason, setDelayReason] = useState(task.delayReason ?? "");
  const action = task.kind === "daily" ? updateTaskProgressAction : updateAdHocProgressAction;
  const { run, pending } = useServerAction(action, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  const save = () =>
    run(task.id, {
      status,
      achieved: task.kind === "daily" && !task.notionDriven ? Number(achieved) || 0 : undefined,
      progress: Number(progress) || 0,
      notes,
      delayReason,
    });

  const done = task.status === "COMPLETED";
  const NoteIcon = task.notes ? MessageSquareText : MessageSquarePlus;
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
      {task.kind === "daily" && !done && !compact && (
        <Button size="icon-sm" variant="ghost" asChild aria-label="بدء العمل — وضع التركيز" title="بدء">
          <Link href={`/focus/${task.id}`}>
            <Play />
          </Link>
        </Button>
      )}
      {!task.notionDriven && !done && !compact && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-success hover:bg-success-soft hover:text-success"
          aria-label="تعليم كمكتملة"
          title="إكمال"
          disabled={pending}
          onClick={() =>
            run(task.id, {
              status: "COMPLETED",
              achieved: task.kind === "daily" ? Math.max(task.target ?? 0, task.achieved ?? 0) : undefined,
              progress: 100,
              notes: task.notes,
              delayReason: task.delayReason,
            })
          }
        >
          {pending ? <Spinner /> : <CheckCircle2 />}
        </Button>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        className={cn(task.notes && "text-primary")}
        aria-label={task.notes ? "الملاحظة وتحديث التقدم" : "إضافة ملاحظة أو تحديث التقدم"}
        title={task.notes ? "الملاحظة وتحديث التقدم" : "إضافة ملاحظة"}
        onClick={() => setOpen(true)}
      >
        <NoteIcon />
      </Button>
      {postpone && !done && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="تأجيل المهمة" title="تأجيل" disabled={postpone.pending}>
              <CalendarClock />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={postpone.onTomorrow}>إلى الغد</DropdownMenuItem>
            <DropdownMenuItem onSelect={postpone.onNextWeek}>إلى الأسبوع القادم</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{task.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {task.notionDriven && (
              <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
                الإنجاز يُحسب تلقائيًا من Notion. يمكنك إضافة ملاحظة أو سبب تأخير فقط، أو تعليم المهمة كمعلقة.
              </p>
            )}
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatusKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.filter((s) => !task.notionDriven || ["BLOCKED", "CANCELLED", task.status].includes(s)).map((s) => (
                    <SelectItem key={s} value={s}>
                      {TASK_STATUS_LABELS[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!task.notionDriven && (
              <div className="grid grid-cols-2 gap-3">
                {task.kind === "daily" && (task.target ?? 0) > 0 && (
                  <div className="space-y-2">
                    <Label>المنجز (من {task.target})</Label>
                    <Input type="number" min={0} value={achieved} onChange={(e) => setAchieved(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>نسبة التقدم %</Label>
                  <Input type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={`task-note-${task.id}`}>ملاحظة</Label>
              <Textarea id={`task-note-${task.id}`} rows={2} placeholder="اكتب ملاحظة قصيرة…" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </div>
            {(status === "DELAYED" || status === "PARTIAL" || status === "BLOCKED" || task.delayReason) && (
              <div className="space-y-2">
                <Label>سبب التأخير / التعليق</Label>
                <Textarea rows={2} value={delayReason} onChange={(e) => setDelayReason(e.target.value)} maxLength={1000} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Spinner />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
