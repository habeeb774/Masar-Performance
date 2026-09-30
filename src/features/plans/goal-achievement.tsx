"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, PenLine, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { overrideGoalAction, resolveOverrideAction, setManualAchievementAction } from "@/actions/manual";
import { useServerAction } from "@/hooks/use-server-action";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import type { PlanGoalRow } from "./types";

/** What the current viewer may do with goal achievement on this plan. */
export interface ManualAccess {
  /** plan is approved / in progress */
  running: boolean;
  /** goal owner or plans.manage */
  canUpdate: boolean;
  /** plans.manage */
  canManage: boolean;
  /** may keep / revert manual overrides */
  canResolve: boolean;
  /** Notion sources whose automatic update is not working */
  unhealthySources: string[];
}

const qty = (v: number) => formatNumber(v, v % 1 ? 2 : 0);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const editable = (goal: PlanGoalRow, access: ManualAccess) => access.running && goal.status !== "CANCELLED";
export const canUpdateManually = (goal: PlanGoalRow, access: ManualAccess) => editable(goal, access) && !goal.auto && access.canUpdate;
export const canOverride = (goal: PlanGoalRow, access: ManualAccess) =>
  editable(goal, access) &&
  goal.auto &&
  (access.canManage || (access.canUpdate && !!goal.notionDataSourceId && access.unhealthySources.includes(goal.notionDataSourceId)));

/** «تحديث الإنجاز» — set the achieved total, add to it, or toggle a yes / no goal. */
export function ManualAchievementDialog({ goal, open, onOpenChange }: { goal: PlanGoalRow; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [value, setValue] = useState(String(goal.achievedValue));
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(localToday);
  const [more, setMore] = useState(false);
  const { run, pending } = useServerAction(setManualAchievementAction, {
    onSuccess: () => {
      onOpenChange(false);
      setDelta("");
      setNote("");
      router.refresh();
    },
  });
  const extra = { date: date || null, note: note.trim() || null };
  const needsAchievementDate = goal.distributionMode === "DISTRIBUTED";
  const boolean = goal.goalType === "BOOLEAN";
  const done = goal.achievedValue >= 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setValue(String(goal.achievedValue));
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>تحديث الإنجاز</DialogTitle>
          <DialogDescription className="line-clamp-2">{goal.name}</DialogDescription>
        </DialogHeader>

        {boolean ? (
          <Button
            type="button"
            variant={done ? "outline" : "default"}
            disabled={pending}
            onClick={() => run(goal.id, { value: done ? 0 : 1, ...extra })}
            className="w-full"
          >
            {pending ? <Spinner /> : done ? <Circle /> : <CheckCircle2 />}
            {done ? "إلغاء «تم الإنجاز»" : "تم الإنجاز"}
          </Button>
        ) : (
          <div className="space-y-3">
            <form
              className="flex items-center gap-2 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                run(goal.id, { value: Number(value), ...extra });
              }}
            >
              <span className="shrink-0 text-muted-foreground">المحقق:</span>
              <Input type="number" min={0} step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="w-24 tabular-nums" disabled={pending} autoFocus required />
              <span className="min-w-0 truncate text-muted-foreground">
                من {qty(goal.targetValue)} {goal.unit}
              </span>
              <Button type="submit" size="sm" className="ms-auto" disabled={pending || value === "" || (needsAchievementDate && !date)}>
                {pending ? <Spinner /> : "حفظ"}
              </Button>
            </form>
            <form
              className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                if (Number(delta)) run(goal.id, { delta: Number(delta), ...extra });
              }}
            >
              <Plus className="size-4 shrink-0 text-muted-foreground" />
              <Input type="number" step="any" inputMode="decimal" placeholder="العدد" value={delta} onChange={(e) => setDelta(e.target.value)} className="w-24 bg-background tabular-nums" disabled={pending} />
              <Button type="submit" size="sm" variant="outline" className="ms-auto" disabled={pending || !Number(delta) || (needsAchievementDate && !date)}>
                إضافة إنجاز
              </Button>
            </form>
          </div>
        )}

        {needsAchievementDate && (
          <div className="rounded-lg border border-warning/30 bg-warning-soft/20 p-2.5">
            <label className="space-y-1 text-xs">
              <span className="font-medium">تاريخ الإنجاز</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} required />
              <span className="block text-muted-foreground">يُستخدم التاريخ لإسناد الإنجاز إلى الأسبوع الصحيح.</span>
            </label>
          </div>
        )}

        {more ? (
          <div className={needsAchievementDate ? "grid gap-2" : "grid gap-2 sm:grid-cols-[1fr_auto]"}>
            <Textarea placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} disabled={pending} />
            {!needsAchievementDate && (
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>التاريخ</span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
              </label>
            )}
          </div>
        ) : (
          <button type="button" className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setMore(true)}>
            {needsAchievementDate ? "إضافة ملاحظة" : "إضافة ملاحظة أو تاريخ"}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** «تعديل يدوي» for a goal updated automatically — value plus a required reason. */
export function OverrideDialog({ goal, open, onOpenChange }: { goal: PlanGoalRow; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [value, setValue] = useState(String(goal.overrideValue ?? goal.achievedValue));
  const [reason, setReason] = useState("");
  const { run, pending } = useServerAction(overrideGoalAction, {
    onSuccess: () => {
      onOpenChange(false);
      setReason("");
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>تعديل يدوي</DialogTitle>
          <DialogDescription className="line-clamp-2">{goal.name}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(goal.id, { value: Number(value), reason: reason.trim() });
          }}
        >
          <div className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-muted-foreground">المحقق:</span>
            <Input type="number" min={0} step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="w-24 tabular-nums" disabled={pending} autoFocus required />
            <span className="min-w-0 truncate text-muted-foreground">
              من {qty(goal.targetValue)} {goal.unit}
            </span>
          </div>
          <Textarea placeholder="سبب التعديل" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} disabled={pending} required />
          <Button type="submit" className="w-full" disabled={pending || value === "" || !reason.trim()}>
            {pending && <Spinner />} حفظ التعديل
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Calm note shown when a goal carries a manual override, with keep / revert for admins. */
export function OverrideNote({ goal, canResolve, className }: { goal: PlanGoalRow; canResolve: boolean; className?: string }) {
  const router = useRouter();
  const { run, pending } = useServerAction(resolveOverrideAction, { onSuccess: () => router.refresh() });
  if (goal.overrideValue === null) return null;
  return (
    <div className={cn("space-y-1.5 rounded-lg bg-muted/40 px-3 py-2 text-xs", className)}>
      <p className="text-foreground/80">
        يوجد تعديل يدوي · Notion: <span className="tabular-nums">{goal.sourceValue === null ? "—" : qty(goal.sourceValue)}</span> · المعتمد:{" "}
        <span className="font-semibold tabular-nums">{qty(goal.overrideValue)}</span>
      </p>
      {goal.overrideReason && <p className="text-muted-foreground">{goal.overrideReason}</p>}
      {canResolve && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {!goal.overrideKept && (
            <Button size="xs" variant="outline" disabled={pending} onClick={() => run(goal.id, "keep")}>
              إبقاء التعديل اليدوي
            </Button>
          )}
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(goal.id, "notion")}>
            الرجوع لقيمة Notion
          </Button>
        </div>
      )}
    </div>
  );
}

/** Row-level controls: «تحديث الإنجاز» for manual goals, and the override note. */
export function GoalAchievementControls({ goal, access, showOverride = true }: { goal: PlanGoalRow; access: ManualAccess; showOverride?: boolean }) {
  const [open, setOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const update = canUpdateManually(goal, access);
  const override = showOverride && canOverride(goal, access);
  if (!update && !override && goal.overrideValue === null) return null;
  return (
    <div className="space-y-1.5">
      {(update || override) && (
        <div className="flex flex-wrap gap-1.5">
          {update && (
            <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
              <TrendingUp /> تحديث الإنجاز
            </Button>
          )}
          {override && (
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setOverrideOpen(true)}>
              <PenLine /> تعديل يدوي
            </Button>
          )}
        </div>
      )}
      <OverrideNote goal={goal} canResolve={access.canResolve} />
      {update && <ManualAchievementDialog goal={goal} open={open} onOpenChange={setOpen} />}
      {override && <OverrideDialog goal={goal} open={overrideOpen} onOpenChange={setOverrideOpen} />}
    </div>
  );
}

/** Soft notice when automatic updates are not working; offers a manual update for the first affected goal. */
export function SyncFailureNotice({ goal, href }: { goal?: PlanGoalRow; href?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Alert className="border-warning/30 bg-warning-soft/30">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>تعذر التحديث التلقائي من Notion. يمكنك متابعة العمل يدويًا.</span>
        <Button size="sm" variant="outline" onClick={() => (goal ? setOpen(true) : href && router.push(href))}>
          تحديث يدوي
        </Button>
      </AlertDescription>
      {goal && <OverrideDialog goal={goal} open={open} onOpenChange={setOpen} />}
    </Alert>
  );
}
