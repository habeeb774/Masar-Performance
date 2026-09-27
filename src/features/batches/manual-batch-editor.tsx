"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionButton } from "@/components/shared/action-button";
import { useServerAction } from "@/hooks/use-server-action";
import { deleteManualBatchAction, saveManualBatchAction } from "@/actions/manual";
import type { BatchSummary } from "@/lib/notion/batches";
import { cn } from "@/lib/utils";

export interface BatchWeekOption {
  start: string;
  label: string;
}

const toCount = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

/** «إضافة دفعة»: batch number, product count and the week it belongs to. */
export function AddManualBatchButton({
  employeeId,
  weeks,
  defaultWeek,
  nextNumber,
  className,
}: {
  employeeId: string;
  weeks: BatchWeekOption[];
  defaultWeek?: string;
  nextNumber: number;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(String(nextNumber));
  const [total, setTotal] = useState("");
  const [week, setWeek] = useState(defaultWeek ?? weeks[0]?.start ?? "");
  const { run, pending } = useServerAction(saveManualBatchAction, {
    onSuccess: () => {
      setOpen(false);
      setTotal("");
      router.refresh();
    },
  });

  const reset = (o: boolean) => {
    if (o) {
      setNumber(String(nextNumber));
      setWeek(defaultWeek ?? weeks[0]?.start ?? "");
    }
    setOpen(o);
  };
  const valid = toCount(number) >= 1 && toCount(total) >= 1 && !!week;

  return (
    <>
      <Button size="sm" variant="outline" className={className} onClick={() => reset(true)}>
        <Plus /> إضافة دفعة
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة دفعة</DialogTitle>
            <DialogDescription>سجّل دفعة المنتجات وحدّث أرقامها أولًا بأول.</DialogDescription>
          </DialogHeader>
          <form
            id="manual-batch-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid || pending) return;
              run({ employeeId, number: toCount(number), total: toCount(total), weekStart: week, imagesApproved: 0, added: 0, needsImprovement: 0, waiting: 0 });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="mb-number">رقم الدفعة</Label>
                <Input id="mb-number" type="number" inputMode="numeric" min={1} value={number} onChange={(e) => setNumber(e.target.value)} className="tabular-nums" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mb-total">عدد المنتجات</Label>
                <Input id="mb-total" type="number" inputMode="numeric" min={1} value={total} onChange={(e) => setTotal(e.target.value)} autoFocus className="tabular-nums" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>الأسبوع</Label>
              <Select value={week} onValueChange={setWeek}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الأسبوع" />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((w) => (
                    <SelectItem key={w.start} value={w.start}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="manual-batch-form" disabled={!valid || pending}>
              {pending && <Spinner />}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const FIELDS = [
  { key: "imagesApproved", label: "الصور المعتمدة" },
  { key: "added", label: "تمت الإضافة للمتجر" },
  { key: "needsImprovement", label: "تحتاج تحسين" },
  { key: "waiting", label: "بانتظار الاعتماد" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

/** Inline update of a hand-entered batch: four counts, «حفظ» and a quiet delete. */
export function ManualBatchInlineEditor({
  batch,
  employeeId,
  className,
}: {
  batch: BatchSummary & { manualId: string };
  employeeId: string;
  className?: string;
}) {
  const router = useRouter();
  const initial: Record<FieldKey, string> = {
    imagesApproved: String(batch.images.approved),
    added: String(batch.store.added),
    needsImprovement: String(batch.images.needsImprovement),
    waiting: String(batch.images.waiting),
  };
  const [values, setValues] = useState(initial);
  const dirty = FIELDS.some((f) => values[f.key] !== initial[f.key]);
  const { run, pending } = useServerAction(saveManualBatchAction, { onSuccess: () => router.refresh() });

  return (
    <form
      className={cn("space-y-3 border-t pt-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        run(
          {
            employeeId,
            number: batch.number ?? 1,
            total: batch.total,
            weekStart: batch.anchorDate,
            imagesApproved: toCount(values.imagesApproved),
            added: toCount(values.added),
            needsImprovement: toCount(values.needsImprovement),
            waiting: toCount(values.waiting),
          },
          batch.manualId,
        );
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="grid min-w-0 gap-1">
            <span className="truncate text-xs text-muted-foreground">{f.label}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={batch.total}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="h-9 tabular-nums"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <ActionButton
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          action={() => deleteManualBatchAction(batch.manualId)}
          confirm={{ title: `حذف ${batch.label}؟`, description: "ستُحذف الدفعة وأرقامها نهائيًا.", confirmLabel: "حذف", destructive: true }}
        >
          <Trash2 /> حذف
        </ActionButton>
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending && <Spinner />}
          حفظ
        </Button>
      </div>
    </form>
  );
}
