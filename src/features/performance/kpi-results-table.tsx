"use client";

import { dutyOf, groupByDuty } from "@/lib/duties";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, PencilLine, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { useServerAction } from "@/hooks/use-server-action";
import { overrideKpiAction } from "@/actions/performance";
import { KPI_CATEGORY_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { formatNumber, formatPct } from "@/lib/num";
import { cn } from "@/lib/utils";
import type { KpiResultRow } from "@/server/queries/performance";

const DETAIL_LABELS: Record<string, string> = {
  goals: "الأهداف",
  completed: "مكتمل",
  needsRevision: "يحتاج تحسين",
  pendingApproval: "بانتظار الاعتماد",
  worked: "إجمالي ما تم العمل عليه",
  reworkCount: "مرات إعادة العمل",
  deadline: "الموعد النهائي",
  submitted: "تم التسليم",
  daysLate: "أيام التأخير",
  prepared: "الخطط المعدة",
  weeks: "عدد الأسابيع",
  due: "المستحق",
  tasks: "المهام",
  note: "ملاحظة",
  onTime: "في الموعد",
  total: "الإجمالي",
  avgDaysLate: "متوسط أيام التأخير",
  name: "الاسم",
  progress: "التقدم",
  weight: "الوزن",
  title: "العنوان",
  status: "الحالة",
};

function formatValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "number") return key === "progress" ? formatPct(v, 1) : formatNumber(v, 2);
  if (typeof v === "string") {
    if (key === "status") return (TASK_STATUS_LABELS as Record<string, { label: string }>)[v]?.label ?? v;
    return v;
  }
  return JSON.stringify(v);
}

/** Friendly renderer for the `details` JSON stored on each KPI result. */
export function KpiDetails({ details }: { details: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) return <p className="text-xs text-muted-foreground">لا توجد تفاصيل إضافية لهذا المؤشر.</p>;
  const scalars = Object.entries(details).filter(([, v]) => !Array.isArray(v) && (typeof v !== "object" || v === null));
  const lists = Object.entries(details).filter(([, v]) => Array.isArray(v)) as [string, unknown[]][];
  return (
    <div className="space-y-3">
      {scalars.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {scalars.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 border-b border-dashed py-1 text-xs">
              <dt className="text-muted-foreground">{DETAIL_LABELS[k] ?? k}</dt>
              <dd className="font-medium tabular-nums">{formatValue(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {lists.map(([k, list]) =>
        k === "goals" ? (
          <GoalsByDuty key={k} goals={list as GoalSnap[]} />
        ) : (
          <div key={k}>
            <p className="mb-1 text-xs font-semibold">
              {DETAIL_LABELS[k] ?? k} ({list.length})
            </p>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا يوجد</p>
            ) : (
              <ul className="divide-y rounded-md border bg-background text-xs">
                {list.map((item, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2.5 py-1.5">
                    {item && typeof item === "object" ? (
                      Object.entries(item as Record<string, unknown>).map(([ik, iv]) => (
                        <span key={ik}>
                          <span className="text-muted-foreground">{DETAIL_LABELS[ik] ?? ik}: </span>
                          <span className="font-medium">{formatValue(ik, iv)}</span>
                        </span>
                      ))
                    ) : (
                      <span>{formatValue(k, item)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ),
      )}
    </div>
  );
}

type GoalSnap = { name: string; progress?: number; weight?: number; dutyName?: string | null; category?: string | null };

function GoalsByDuty({ goals }: { goals: GoalSnap[] }) {
  const groups = groupByDuty(
    goals.filter((g) => g && typeof g.name === "string"),
    dutyOf,
  );
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">الأهداف ({goals.length})</p>
      {groups.map((group) => (
        <div key={group.duty}>
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{group.duty}</p>
          <ul className="divide-y rounded-md border bg-background text-xs">
            {group.items.map((g, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2.5 py-1.5">
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatValue("progress", g.progress)} · الوزن {formatValue("weight", g.weight)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function OverrideDialog({ result, open, onOpenChange }: { result: KpiResultRow; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [score, setScore] = useState(String(result.score));
  const [reason, setReason] = useState(result.overrideReason ?? "");
  const [restore, setRestore] = useState(false);
  const { run, pending } = useServerAction(overrideKpiAction, {
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  const n = Number(score);
  const scoreError =
    !restore && (score.trim() === "" || !Number.isFinite(n) || n < 0 || n > result.maxScore) ? `أدخل درجة بين 0 و ${result.maxScore}` : null;
  const reasonError = reason.trim().length < 5 ? "سبب التعديل مطلوب (5 أحرف على الأقل)" : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">تعديل نتيجة: {result.name}</DialogTitle>
          <DialogDescription>
            الدرجة الحالية {formatNumber(result.score, 2)} من {formatNumber(result.maxScore)} — يسجل التعديل في سجل التدقيق.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {result.isOverridden && (
            <label className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={restore} onChange={(e) => setRestore(e.target.checked)} />
              <RotateCcw className="size-4 text-muted-foreground" /> استعادة القيمة الآلية
            </label>
          )}
          {!restore && (
            <div className="space-y-2">
              <Label htmlFor="kpi-score">الدرجة (0 – {formatNumber(result.maxScore)})</Label>
              <Input
                id="kpi-score"
                type="number"
                min={0}
                max={result.maxScore}
                step="0.5"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                aria-invalid={!!scoreError}
              />
              {scoreError && <p className="text-xs text-destructive">{scoreError}</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="kpi-reason">سبب التعديل</Label>
            <Textarea
              id="kpi-reason"
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تم احتساب منتجات أعيدت بسبب خطأ من المورد"
            />
            {reason.length > 0 && reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            إلغاء
          </Button>
          <Button
            disabled={pending || !!scoreError || !!reasonError}
            onClick={() => run(result.id, { score: restore ? null : n, reason: reason.trim() })}
          >
            {pending && <Spinner />}
            {restore ? "استعادة وإعادة الحساب" : "حفظ التعديل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function KpiResultsTable({ results, canEdit }: { results: KpiResultRow[]; canEdit: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<KpiResultRow | null>(null);
  if (results.length === 0) return <EmptyState title="لا توجد نتائج مؤشرات" description="اضغط «إعادة الحساب» لحساب المؤشرات من بيانات الشهر." />;
  const totalWeight = results.reduce((a, r) => a + r.weight, 0);
  const totalWeighted = results.reduce((a, r) => a + r.weightedScore, 0);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="text-start">المؤشر</TableHead>
              <TableHead className="text-start">الفئة</TableHead>
              <TableHead className="text-start">المستهدف</TableHead>
              <TableHead className="text-start">المحقق</TableHead>
              <TableHead className="min-w-36 text-start">نسبة التحقق</TableHead>
              <TableHead className="text-start">الدرجة</TableHead>
              <TableHead className="text-start">الوزن</TableHead>
              <TableHead className="text-start">الدرجة الموزونة</TableHead>
              <TableHead className="text-start">النوع</TableHead>
              {canEdit && <TableHead className="text-end">إجراء</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => {
              const open = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <TableRow className={cn(open && "bg-muted/30")}>
                    <TableCell>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="عرض التفاصيل"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : r.id)}
                      >
                        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                    </TableCell>
                    <TableCell>
                      <EnumBadge map={KPI_CATEGORY_LABELS} value={r.category} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(r.target, 2)} <span className="text-xs text-muted-foreground">{r.unit}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(r.achieved, 2)} <span className="text-xs text-muted-foreground">{r.unit}</span>
                    </TableCell>
                    <TableCell>
                      <ProgressBar value={r.achievementRate} showLabel size="sm" />
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums whitespace-nowrap">
                      {formatNumber(r.score, 2)} / {formatNumber(r.maxScore)}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatNumber(r.weight, 2)}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatNumber(r.weightedScore, 2)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        {r.isAutomatic ? <StatusBadge tone="info">آلي</StatusBadge> : <StatusBadge tone="neutral">يدوي</StatusBadge>}
                        {r.isOverridden && (
                          <StatusBadge tone="warning" className="max-w-48 truncate">
                            معدّل
                          </StatusBadge>
                        )}
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-end">
                        <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                          <PencilLine /> تعديل النتيجة
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={canEdit ? 11 : 10} className="whitespace-normal">
                        {r.isOverridden && r.overrideReason && (
                          <p className="mb-3 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">سبب التعديل: {r.overrideReason}</p>
                        )}
                        <KpiDetails details={r.details} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell />
              <TableCell colSpan={6}>الإجمالي</TableCell>
              <TableCell className="tabular-nums">{formatNumber(totalWeight, 2)}</TableCell>
              <TableCell className="tabular-nums">{formatNumber(totalWeighted, 2)}</TableCell>
              <TableCell colSpan={canEdit ? 2 : 1} className="text-xs font-normal text-muted-foreground">
                {Math.abs(totalWeight - 100) > 0.01 && "تم تطبيع النتيجة على مجموع الأوزان"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {editing && <OverrideDialog key={editing.id} result={editing} open onOpenChange={(v) => !v && setEditing(null)} />}
    </>
  );
}
