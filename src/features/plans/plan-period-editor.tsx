"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { previewPlanPeriodAction, updatePlanPeriodAction } from "@/actions/plans";
import { executionEndDate, formatDateAr, isDateKey } from "@/lib/dates";
import { useServerAction } from "@/hooks/use-server-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { PeriodChangeReport } from "@/server/services/plan-execution";

function Weeks({ title, weeks }: { title: string; weeks: string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <ul className="space-y-0.5 text-xs tabular-nums">
        {weeks.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function PlanPeriodEditor({ planId, start, weeksCount, approved }: { planId: string; start: string; weeksCount: number; approved: boolean }) {
  const [date, setDate] = useState(start);
  const [count, setCount] = useState(weeksCount);
  const [preview, setPreview] = useState<PeriodChangeReport | null>(null);
  const router = useRouter();
  const action = useServerAction(updatePlanPeriodAction, { onSuccess: () => { setPreview(null); router.refresh(); } });
  const previewAction = useServerAction(previewPlanPeriodAction, { silent: true, onSuccess: (r) => r && setPreview(r) });
  const valid = isDateKey(date) && Number.isInteger(count) && count >= 1 && count <= 52;
  const save = (confirmed: boolean) => action.run(planId, { executionStartDate: date, weeksCount: count, confirmed });
  const blocked = !!preview && preview.conflicts.length > 0;
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer">تعديل فترة التنفيذ</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="execution-start">بداية فترة التنفيذ</Label><Input id="execution-start" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="execution-weeks">عدد الأسابيع</Label><Input id="execution-weeks" type="number" min={1} max={52} value={count} onChange={(event) => setCount(Number(event.target.value))} /></div>
        <div className="space-y-1"><Label>نهاية التنفيذ</Label><Input readOnly tabIndex={-1} value={valid ? formatDateAr(executionEndDate(date, count)) : "—"} className="bg-muted" /></div>
        <Button disabled={!valid || action.pending || previewAction.pending} onClick={() => (approved ? previewAction.run(planId, { executionStartDate: date, weeksCount: count }) : save(false))}>
          حفظ الفترة
        </Button>
      </div>
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تأكيد تغيير فترة التنفيذ</DialogTitle>
            <DialogDescription className="flex items-start gap-2 text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              تغيير فترة التنفيذ سيعيد بناء الأسابيع والمهام غير المكتملة
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                <Weeks title={`الأسابيع الحالية (${formatDateAr(preview.before.start)} – ${formatDateAr(preview.before.end)})`} weeks={preview.before.weeks} />
                <Weeks title={`الأسابيع الجديدة (${formatDateAr(preview.after.start)} – ${formatDateAr(preview.after.end)})`} weeks={preview.after.weeks} />
              </div>
              <ul className="space-y-1 text-xs">
                <li>مهام ستتحرك: {preview.dailyTasks.moved} · جديدة: {preview.dailyTasks.created} · تُلغى: {preview.dailyTasks.cancelled}</li>
                <li>مهام مكتملة محمية: {preview.protectedCompletedTasks}</li>
                <li>تقارير أسبوعية متأثرة: {preview.reportsAffected} (تبقى ملاحظاتها وتعليقات المدير)</li>
                <li>أسابيع: {preview.weeklyPlansMoved} تتغير تواريخها · {preview.weeklyPlansCreated} جديدة · {preview.weeklyPlansRemoved} تُزال</li>
              </ul>
              {blocked && (
                <div className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-xs">
                  <p className="mb-1 font-semibold">لا يمكن التطبيق قبل حل التعارضات:</p>
                  <ul className="list-disc space-y-0.5 ps-4">
                    {preview.conflicts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>إلغاء</Button>
            <Button disabled={action.pending || blocked} onClick={() => save(true)}>تأكيد التغيير</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </details>
  );
}
