"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePlanPeriodAction } from "@/actions/plans";
import { executionEndDate, formatDateAr, isDateKey } from "@/lib/dates";
import { useServerAction } from "@/hooks/use-server-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function PlanPeriodEditor({ planId, start, weeksCount, approved }: { planId: string; start: string; weeksCount: number; approved: boolean }) {
  const [date, setDate] = useState(start);
  const [count, setCount] = useState(weeksCount);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  const action = useServerAction(updatePlanPeriodAction, { onSuccess: () => { setConfirm(false); router.refresh(); } });
  const valid = isDateKey(date) && Number.isInteger(count) && count >= 1 && count <= 52;
  const save = (confirmed: boolean) => action.run(planId, { executionStartDate: date, weeksCount: count, confirmed });
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer">تعديل فترة التنفيذ</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="execution-start">بداية فترة التنفيذ</Label><Input id="execution-start" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="execution-weeks">عدد الأسابيع</Label><Input id="execution-weeks" type="number" min={1} max={52} value={count} onChange={(event) => setCount(Number(event.target.value))} /></div>
        <p className="text-muted-foreground">نهاية التنفيذ: {valid ? formatDateAr(executionEndDate(date, count)) : "—"}</p>
        <Button disabled={!valid || action.pending} onClick={() => approved ? setConfirm(true) : save(false)}>حفظ الفترة</Button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent><DialogHeader><DialogTitle>تأكيد تغيير فترة التنفيذ</DialogTitle><DialogDescription>تغيير فترة الخطة سيؤثر على الأسابيع والمهام اليومية. سيتم الحفاظ على المهام المنفذة والتقارير والملاحظات، وإعادة توزيع المهام غير المنفذة.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>إلغاء</Button><Button disabled={action.pending} onClick={() => save(true)}>تأكيد التغيير</Button></DialogFooter></DialogContent>
      </Dialog>
    </details>
  );
}
