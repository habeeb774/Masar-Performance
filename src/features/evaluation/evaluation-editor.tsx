"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import {
  addIndicatorAction,
  approveEvaluationAction,
  overrideFinalScoreAction,
  refreshEvaluationAction,
  removeIndicatorAction,
  resetIndicatorAction,
  updateDutyAction,
  updateEvaluationNotesAction,
  updateIndicatorAction,
} from "@/actions/evaluation";
import { useServerAction } from "@/hooks/use-server-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DutyTotalRow, EvaluationHeader, FinalSummary, fmt } from "./evaluation-sheet";
import { SOURCE_LABELS, type DutyRow, type EvaluationData, type IndicatorRow } from "./types";

const th = "border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800";
const td = "border border-zinc-300 px-1.5 py-1 align-top text-sm dark:border-zinc-700";

/** A field that saves on blur (only when the value changed). */
function Cell({ value, onSave, type = "number", className, multiline }: { value: string | number | null; onSave: (v: string) => void; type?: "number" | "text"; className?: string; multiline?: boolean }) {
  const initial = value === null ? "" : String(value);
  const [v, setV] = useState(initial);
  const commit = () => v !== initial && onSave(v);
  if (multiline) return <Textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} rows={2} className={cn("min-h-0 text-xs", className)} />;
  return <Input type={type} step="any" min={type === "number" ? 0 : undefined} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} className={cn("h-8 tabular-nums", type === "number" && "w-20 text-center", className)} />;
}

function IndicatorEditRow({ ind, reason }: { ind: IndicatorRow; reason: string }) {
  const router = useRouter();
  const done = { silent: true, onSuccess: () => router.refresh() };
  const update = useServerAction(updateIndicatorAction, done);
  const reset = useServerAction(resetIndicatorAction, { onSuccess: () => router.refresh() });
  const remove = useServerAction(removeIndicatorAction, { onSuccess: () => router.refresh() });
  const save = (patch: Parameters<typeof updateIndicatorAction>[1]) => update.run(ind.id, patch, reason || null);
  const n = (v: string) => Number(v || 0);
  return (
    <tr className={ind.weight === 0 ? "bg-zinc-50/60 text-zinc-500 dark:bg-zinc-900/40" : undefined}>
      <td className={cn(td, "min-w-48")}>
        <Cell type="text" value={ind.title} onSave={(v) => save({ title: v })} />
        <span className="mt-1 inline-block rounded bg-zinc-100 px-1.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
          {SOURCE_LABELS[ind.sourceType] ?? ind.sourceType}
          {ind.isOverridden && " · معدّل يدويًا"}
        </span>
      </td>
      <td className={cn(td, "min-w-48")}>
        <Cell multiline value={ind.description} onSave={(v) => save({ description: v })} />
      </td>
      <td className={cn(td, "min-w-40")}>
        <Cell multiline value={ind.notes} onSave={(v) => save({ notes: v })} />
      </td>
      <td className={td}>
        <Cell value={ind.achieved} onSave={(v) => save({ achieved: n(v) })} />
      </td>
      <td className={td}>
        <Cell value={ind.target} onSave={(v) => save({ target: n(v) })} />
      </td>
      <td className={td}>
        <Cell value={ind.weight} onSave={(v) => save({ weight: n(v) })} />
      </td>
      <td className={cn(td, "text-center tabular-nums")}>{fmt(ind.score)}</td>
      <td className={cn(td, "text-center tabular-nums")}>{fmt(ind.weightedScore)}</td>
      <td className={cn(td, "whitespace-nowrap")}>
        {ind.isOverridden && (
          <Button size="icon" variant="ghost" title="العودة للقيمة الآلية" disabled={reset.pending} onClick={() => reset.run(ind.id)}>
            <RotateCcw />
          </Button>
        )}
        <Button size="icon" variant="ghost" title="حذف المؤشر" disabled={remove.pending} onClick={() => confirm(`حذف «${ind.title}»؟`) && remove.run(ind.id, reason || null)}>
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}

function AddIndicator({ duty, goals }: { duty: DutyRow; goals: EvaluationData["unusedGoals"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState("");
  const add = useServerAction(addIndicatorAction, { onSuccess: () => { setOpen(false); setTitle(""); setGoalId(""); router.refresh(); } });
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> إضافة مؤشر
      </Button>
    );
  const goal = goals.find((g) => g.id === goalId);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
      {duty.kind === "GOALS" && goals.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">من أهداف الخطة</Label>
          <select className="h-8 rounded-md border bg-background px-2 text-sm" value={goalId} onChange={(e) => { setGoalId(e.target.value); setTitle(goals.find((g) => g.id === e.target.value)?.name ?? title); }}>
            <option value="">— مؤشر يدوي —</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({fmt(g.achieved)} / {fmt(g.target)})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="min-w-56 flex-1 space-y-1">
        <Label className="text-xs">اسم المؤشر</Label>
        <Input className="h-8" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <Button size="sm" disabled={add.pending || !title.trim()} onClick={() => add.run(duty.id, { title, monthlyGoalId: goalId || null, achieved: goal?.achieved ?? 0, target: goal?.target ?? 1, weight: 0 })}>
        إضافة
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        إلغاء
      </Button>
    </div>
  );
}

function DutyEditor({ duty, reason, goals }: { duty: DutyRow; reason: string; goals: EvaluationData["unusedGoals"] }) {
  const router = useRouter();
  const update = useServerAction(updateDutyAction, { silent: true, onSuccess: () => router.refresh() });
  return (
    <section className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th colSpan={6} className={cn(th, "text-start text-sm")}>
                {duty.title}
              </th>
              <th colSpan={3} className={cn(th, "text-start")}>
                <span className="flex items-center gap-2">
                  وزن الواجب في النتيجة النهائية
                  <Cell value={duty.weight} onSave={(v) => update.run(duty.id, { weight: Number(v || 0) }, reason || null)} />%
                </span>
              </th>
            </tr>
            <tr>
              <th className={cn(th, "text-start")}>مؤشر الأداء</th>
              <th className={cn(th, "text-start")}>المؤشر</th>
              <th className={cn(th, "text-start")}>ملاحظات</th>
              <th className={th}>المحقق</th>
              <th className={th}>من أصل</th>
              <th className={th}>الوزن</th>
              <th className={th}>الدرجة</th>
              <th className={th}>المعدل</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {duty.indicators.map((i) => (
              <IndicatorEditRow key={`${i.id}-${i.achieved}-${i.target}-${i.weight}-${i.title}`} ind={i} reason={reason} />
            ))}
            {duty.indicators.length === 0 && (
              <tr>
                <td colSpan={9} className={cn(td, "py-3 text-center text-xs text-zinc-500")}>
                  {duty.kind === "AD_HOC" ? "لا توجد مهام مستجدة مُعلّمة «تدخل في التقييم» في هذه الفترة — أضفها من المهام أو أضف مؤشرًا هنا." : "لا توجد مؤشرات بعد."}
                </td>
              </tr>
            )}
            <DutyTotalRow duty={duty} />
          </tbody>
        </table>
      </div>
      <AddIndicator duty={duty} goals={goals} />
    </section>
  );
}

export function EvaluationEditor({ data, canApprove }: { data: EvaluationData; canApprove: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(data.overrideScore === null ? "" : String(data.overrideScore));
  const [notes, setNotes] = useState(data.managerNotes ?? "");
  const refresh = useServerAction(refreshEvaluationAction, { onSuccess: () => router.refresh() });
  const approve = useServerAction(approveEvaluationAction, { onSuccess: () => router.refresh() });
  const overrideAction = useServerAction(overrideFinalScoreAction, { onSuccess: () => router.refresh() });
  const notesAction = useServerAction(updateEvaluationNotesAction, { onSuccess: () => router.refresh() });

  return (
    <div className="space-y-6">
      <EvaluationHeader data={data} />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="min-w-64 flex-1 space-y-1">
          <Label htmlFor="edit-reason" className="text-xs">
            سبب التعديل (يُسجل مع كل تعديل يدوي في سجل التدقيق)
          </Label>
          <Input id="edit-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تصحيح بعد مراجعة التقرير الشهري" />
        </div>
        <Button variant="outline" disabled={refresh.pending} onClick={() => refresh.run(data.id)}>
          <RefreshCw /> تحديث القيم الآلية
        </Button>
      </div>

      {data.duties.map((d) => (
        <DutyEditor key={d.id} duty={d} reason={reason} goals={data.unusedGoals} />
      ))}

      <FinalSummary data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="final-override">تعديل النتيجة النهائية يدويًا (اختياري)</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="final-override" type="number" step="any" min={0} max={100} className="w-28" value={override} onChange={(e) => setOverride(e.target.value)} placeholder={fmt(data.computedScore)} />
            <Button variant="outline" disabled={overrideAction.pending || !reason.trim()} onClick={() => overrideAction.run(data.id, override === "" ? null : Number(override), reason)}>
              {override === "" ? "إلغاء التعديل" : "حفظ"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">يتطلب كتابة سبب التعديل أعلاه. {data.overrideReason && `السبب الحالي: ${data.overrideReason}`}</p>
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="manager-notes">ملاحظات المدير</Label>
          <Textarea id="manager-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (data.managerNotes ?? "") && notesAction.run(data.id, notes || null)} />
        </div>
      </div>

      {data.validation.length > 0 ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> لا يمكن اعتماد التقييم قبل تصحيح:
          </p>
          <ul className="list-disc space-y-0.5 ps-5">
            {data.validation.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      ) : (
        canApprove && (
          <Button disabled={approve.pending} onClick={() => approve.run(data.id)}>
            <CheckCircle2 /> اعتماد التقييم
          </Button>
        )
      )}
    </div>
  );
}
