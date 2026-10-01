"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { createTeamPlanAction, teamPlanDraftAction, suggestPlanPeriodAction } from "@/actions/plans";
import { executionEndDate, formatDateAr, isDateKey, monthLabel } from "@/lib/dates";

type Row = { key: number; name: string; target: string; unit: string; sourceId: string | null };
type EmployeeOption = { id: string; fullName: string };

let seq = 0;
const blank = (unit = ""): Row => ({ key: ++seq, name: "", target: "", unit, sourceId: null });
const valid = (r: Row) => r.name.trim().length >= 2 && Number(r.target) > 0 && r.unit.trim().length > 0;

export function TeamPlanDialog({
  employees,
  year,
  month,
  employeeId: fixedEmployee,
  canApprove,
  label = "إعداد الخطة",
  size = "sm",
  variant = "default",
}: {
  employees: EmployeeOption[];
  year: number;
  month: number;
  employeeId?: string;
  canApprove: boolean;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(fixedEmployee ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [count, setCount] = useState(4);
  const periodValid = Number.isInteger(count) && count >= 1 && count <= 52;
  const suggestion = useServerAction(suggestPlanPeriodAction, { onSuccess: (data) => { if (data) setStart(data.start); } });
  const draft = useServerAction(teamPlanDraftAction, { silent: true });
  const save = useServerAction(createTeamPlanAction, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  const loadDraft = (id: string) => {
    setEmployeeId(id);
    setStart("");
    setRows([]);
    draft.run(id, year, month).then((r) => {
      const goals = r.ok ? (r.data?.goals ?? []) : [];
      setFrom(r.ok ? (r.data?.from ?? null) : null);
      setRows(goals.length ? goals.map((g) => ({ key: ++seq, name: g.name, target: String(g.target), unit: g.unit, sourceId: g.sourceId })) : [blank()]);
    });
  };

  const onOpenChange = (v: boolean) => {
    if (save.pending) return;
    setOpen(v);
    if (v && fixedEmployee) loadDraft(fixedEmployee);
    if (!v && !fixedEmployee) setEmployeeId("");
  };

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const filled = rows.filter((r) => r.name.trim() || r.target || r.sourceId);
  const ready = !!employeeId && filled.length > 0 && filled.every(valid) && periodValid;
  const employeeName = employees.find((e) => e.id === employeeId)?.fullName;

  const submit = () =>
    save.run({
      employeeId,
      year,
      month,
      executionStartDate: start || null,
      weeksCount: count,
      goals: filled.map((r) => ({ name: r.name.trim(), target: Number(r.target), unit: r.unit.trim(), sourceId: r.sourceId })),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant}>
          {variant === "default" && <Plus />} {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{employeeName ? `خطة ${employeeName} — ${monthLabel(year, month)}` : `خطة ${monthLabel(year, month)}`}</DialogTitle>
          <DialogDescription>اكتب الأهداف ومستهدف كل منها. يوزّعها النظام على الأسابيع والأيام ويحسب التقدم تلقائيًا.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="team-execution-start">بداية فترة التنفيذ</Label><Input id="team-execution-start" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="team-execution-count">عدد الأسابيع</Label><Input id="team-execution-count" type="number" min={1} max={52} value={count} onChange={(event) => setCount(Number(event.target.value))} /></div>
          </div>
          <Button variant="outline" size="sm" disabled={!employeeId || !periodValid || suggestion.pending} onClick={() => suggestion.run(employeeId, year, month, count)}>اقتراح بداية التنفيذ</Button>
          <p className="text-xs text-muted-foreground">نهاية التنفيذ: {isDateKey(start) && periodValid ? formatDateAr(executionEndDate(start, count)) : "تُحسب تلقائيًا؛ البداية الفارغة تتبع نهاية الخطة السابقة"}</p>
          {!fixedEmployee && (
            <div className="space-y-1.5">
              <Label>الموظف</Label>
              <Select value={employeeId} onValueChange={loadDraft}>
                <SelectTrigger className="w-full" aria-label="الموظف">
                  <SelectValue placeholder="اختر الموظف" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {employeeId &&
            (draft.pending ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {from && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="size-3.5 text-primary" /> أهداف مقترحة: {from}
                  </p>
                )}
                <div className="hidden grid-cols-[1fr_6rem_6rem_2rem] gap-2 px-1 text-xs text-muted-foreground sm:grid">
                  <span>الهدف</span>
                  <span>المستهدف</span>
                  <span>الوحدة</span>
                </div>
                <ul className="space-y-2">
                  {rows.map((r, i) => (
                    <li key={r.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_6rem_6rem_2rem] sm:border-0 sm:p-0">
                      <Input value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} placeholder="مثال: إضافة منتجات جديدة" maxLength={200} aria-label={`اسم الهدف ${i + 1}`} className="col-span-2 sm:col-span-1" />
                      <Input value={r.target} onChange={(e) => patch(r.key, { target: e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.]/g, "") })} inputMode="decimal" dir="ltr" className="text-end tabular-nums" placeholder="160" aria-label={`مستهدف الهدف ${i + 1}`} />
                      <Input value={r.unit} onChange={(e) => patch(r.key, { unit: e.target.value })} placeholder="منتج" maxLength={40} aria-label={`وحدة الهدف ${i + 1}`} />
                      <Button type="button" size="icon-sm" variant="ghost" className="self-center text-muted-foreground" aria-label="حذف الهدف" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}>
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRows((rs) => [...rs, blank(rs[rs.length - 1]?.unit ?? "")])}>
                  <Plus /> إضافة هدف
                </Button>
              </div>
            ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.pending}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={!ready || save.pending || draft.pending}>
            {save.pending ? <Spinner /> : <CheckCircle2 />} {canApprove ? "اعتماد الخطة" : "إرسال للاعتماد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
