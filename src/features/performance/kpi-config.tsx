"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Link2, PencilLine, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/shared/action-button";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { deleteKpiAssignmentAction, saveKpiAssignmentAction } from "@/actions/performance";
import { kpiAssignmentSchema } from "@/lib/validation";
import { KPI_CATEGORY_LABELS, KPI_METHOD_LABELS, KPI_SOURCE_LABELS } from "@/lib/labels";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import type { KpiAssignmentRow, KpiTemplateRow } from "@/server/queries/performance";
import { KpiTemplateDialog } from "./kpi-template-dialog";

// ---- templates ---------------------------------------------------------------------

export function KpiTemplatesSection({
  templates,
  stageKeys,
  canManage,
}: {
  templates: KpiTemplateRow[];
  stageKeys: { key: string; label: string }[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<KpiTemplateRow | null>(null);
  const [open, setOpen] = useState(false);
  const openFor = (t: KpiTemplateRow | null) => {
    setEditing(t);
    setOpen(true);
  };
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">قوالب مؤشرات الأداء</CardTitle>
          <CardDescription>تعريف كل مؤشر: مصدر القياس وطريقة تحويله إلى درجة</CardDescription>
        </div>
        {canManage && (
          <Button onClick={() => openFor(null)}>
            <Plus /> مؤشر جديد
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <EmptyState title="لا توجد مؤشرات بعد" description="أضف أول مؤشر أداء لبدء التقييم الآلي." />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-start">الرمز</TableHead>
                  <TableHead className="text-start">المؤشر</TableHead>
                  <TableHead className="text-start">الفئة</TableHead>
                  <TableHead className="text-start">المصدر</TableHead>
                  <TableHead className="text-start">طريقة الاحتساب</TableHead>
                  <TableHead className="text-start">المستهدف</TableHead>
                  <TableHead className="text-start">الدرجة القصوى</TableHead>
                  <TableHead className="text-start">النوع</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  {canManage && <TableHead className="text-end">تعديل</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id} className={cn(!t.isActive && "opacity-60")}>
                    <TableCell className="font-mono text-xs" dir="ltr">
                      {t.code}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      {t.description && <div className="max-w-64 truncate text-xs text-muted-foreground">{t.description}</div>}
                    </TableCell>
                    <TableCell>
                      <EnumBadge map={KPI_CATEGORY_LABELS} value={t.category} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {KPI_SOURCE_LABELS[t.sourceType]}
                      {typeof t.sourceConfig?.stageKey === "string" && t.sourceConfig.stageKey && (
                        <span className="ms-1 font-mono text-muted-foreground" dir="ltr">
                          ({t.sourceConfig.stageKey})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{KPI_METHOD_LABELS[t.calculationMethod]}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(t.defaultTarget, 2)} <span className="text-xs text-muted-foreground">{t.unit}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatNumber(t.maxScore, 2)}</TableCell>
                    <TableCell>{t.isAutomatic ? <StatusBadge tone="info">آلي</StatusBadge> : <StatusBadge tone="neutral">يدوي</StatusBadge>}</TableCell>
                    <TableCell>{t.isActive ? <StatusBadge tone="success">مفعل</StatusBadge> : <StatusBadge tone="blocked">معطل</StatusBadge>}</TableCell>
                    {canManage && (
                      <TableCell className="text-end">
                        <Button size="icon-sm" variant="ghost" aria-label="تعديل" onClick={() => openFor(t)}>
                          <PencilLine />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {canManage && <KpiTemplateDialog open={open} onOpenChange={setOpen} template={editing} stageKeys={stageKeys} />}
    </Card>
  );
}

// ---- assignments -------------------------------------------------------------------

function AssignmentDialog({
  open,
  onOpenChange,
  jobTitleId,
  jobTitleName,
  assignment,
  templates,
  takenTemplateIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobTitleId: string | null;
  jobTitleName: string;
  assignment: KpiAssignmentRow | null;
  templates: KpiTemplateRow[];
  takenTemplateIds: string[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState("");
  const [weight, setWeight] = useState("");
  const [target, setTarget] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // reset the form each time the dialog opens (or targets another assignment) — adjusted during render
  const [loadedFor, setLoadedFor] = useState<{ open: boolean; assignment: KpiAssignmentRow | null } | null>(null);
  if (open && (loadedFor?.open !== open || loadedFor.assignment !== assignment)) {
    setLoadedFor({ open, assignment });
    setTemplateId(assignment?.templateId ?? "");
    setWeight(assignment ? String(assignment.weight) : "");
    setTarget(assignment?.target === null || assignment?.target === undefined ? "" : String(assignment.target));
    setIsActive(assignment?.isActive ?? true);
    setError(null);
  } else if (!open && loadedFor?.open) {
    setLoadedFor({ open, assignment });
  }
  const { run, pending } = useServerAction(saveKpiAssignmentAction, {
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  const available = templates.filter((t) => t.isActive && (!takenTemplateIds.includes(t.id) || t.id === assignment?.templateId));
  const selected = templates.find((t) => t.id === templateId);

  const submit = () => {
    const payload = { templateId, jobTitleId, weight, target: target.trim() === "" ? null : target, isActive };
    const parsed = kpiAssignmentSchema.safeParse(payload);
    if (!parsed.success) {
      setError(templateId ? parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" : "اختر المؤشر");
      return;
    }
    run(assignment?.id ?? null, payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{assignment ? "تعديل ربط المؤشر" : "ربط مؤشر"}</DialogTitle>
          <DialogDescription>الوظيفة: {jobTitleName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>المؤشر</Label>
            <Select value={templateId || undefined} onValueChange={(v) => {
              setTemplateId(v);
              const t = templates.find((x) => x.id === v);
              if (t && !weight) setWeight(String(t.defaultWeight));
            }} disabled={!!assignment}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="اختر مؤشرًا…" />
              </SelectTrigger>
              <SelectContent>
                {available.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {available.length === 0 && <p className="text-xs text-muted-foreground">كل المؤشرات المفعلة مرتبطة بهذه الوظيفة.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="as-weight">الوزن %</Label>
              <Input id="as-weight" type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="as-target">مستهدف مخصص (اختياري)</Label>
              <Input id="as-target" type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} placeholder={selected ? `الافتراضي ${formatNumber(selected.defaultTarget, 2)}` : undefined} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} /> مفعل
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Spinner /> : <Save />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Effective KPI set for a job title: specific rows override generic rows of the same template. */
function effective(assignments: KpiAssignmentRow[], jobTitleId: string | null) {
  const active = assignments.filter((a) => a.isActive && a.templateActive);
  const generic = active.filter((a) => a.jobTitleId === null);
  if (jobTitleId === null) return generic;
  const specific = active.filter((a) => a.jobTitleId === jobTitleId);
  const specificIds = new Set(specific.map((a) => a.templateId));
  return [...generic.filter((a) => !specificIds.has(a.templateId)), ...specific];
}

export function KpiAssignmentsSection({
  assignments,
  templates,
  jobTitles,
  canManage,
}: {
  assignments: KpiAssignmentRow[];
  templates: KpiTemplateRow[];
  jobTitles: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<{ jobTitleId: string | null; name: string; assignment: KpiAssignmentRow | null } | null>(null);
  const groups: { id: string | null; name: string }[] = [{ id: null, name: "جميع الوظائف" }, ...jobTitles];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4 text-muted-foreground" /> ربط المؤشرات بالوظائف
        </CardTitle>
        <CardDescription>مؤشرات «جميع الوظائف» تنطبق على الجميع، والربط الخاص بوظيفة يستبدل الربط العام لنفس المؤشر. يجب أن يكون مجموع الأوزان الفعلية 100.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-2">
        {groups.map((g) => {
          const rows = assignments.filter((a) => a.jobTitleId === g.id);
          const eff = effective(assignments, g.id);
          const total = eff.reduce((a, r) => a + r.weight, 0);
          const ok = Math.abs(total - 100) < 0.01;
          return (
            <div key={g.id ?? "all"} className="rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{g.name}</span>
                  <StatusBadge tone={ok ? "success" : "warning"}>
                    {ok ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />} الوزن الفعلي {formatNumber(total, 2)}%
                  </StatusBadge>
                </div>
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => setDialog({ jobTitleId: g.id, name: g.name, assignment: null })}>
                    <Plus /> ربط مؤشر
                  </Button>
                )}
              </div>
              {g.id !== null && !ok && (
                <p className="border-b bg-warning-soft px-3 py-1.5 text-xs text-warning">
                  مجموع الأوزان الفعلية (العامة + الخاصة) {formatNumber(total, 2)} بدلًا من 100 — ستُطبَّع النتيجة على مجموع الأوزان.
                </p>
              )}
              {rows.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">{g.id === null ? "لا توجد مؤشرات عامة" : `لا توجد مؤشرات خاصة — تُطبق المؤشرات العامة (${eff.length})`}</p>
              ) : (
                <ul className="divide-y">
                  {rows.map((a) => {
                    const overrides = g.id !== null && assignments.some((x) => x.jobTitleId === null && x.templateId === a.templateId);
                    return (
                      <li key={a.id} className={cn("flex items-center gap-2 px-3 py-2 text-sm", (!a.isActive || !a.templateActive) && "opacity-60")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{a.templateName}</span>
                            <EnumBadge map={KPI_CATEGORY_LABELS} value={a.category} />
                            {overrides && <StatusBadge tone="info">يستبدل العام</StatusBadge>}
                            {!a.isActive && <StatusBadge tone="blocked">معطل</StatusBadge>}
                            {!a.templateActive && <StatusBadge tone="blocked">المؤشر معطل</StatusBadge>}
                          </div>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            الوزن {formatNumber(a.weight, 2)}% · المستهدف {a.target === null ? "الافتراضي" : formatNumber(a.target, 2)}
                          </p>
                        </div>
                        {canManage && (
                          <>
                            <Button size="icon-sm" variant="ghost" aria-label="تعديل" onClick={() => setDialog({ jobTitleId: g.id, name: g.name, assignment: a })}>
                              <PencilLine />
                            </Button>
                            <ActionButton
                              size="icon-sm"
                              variant="ghost"
                              aria-label="إلغاء الربط"
                              action={deleteKpiAssignmentAction.bind(null, a.id)}
                              confirm={{ title: `إلغاء ربط «${a.templateName}» من ${g.name}؟`, confirmLabel: "إلغاء الربط", destructive: true }}
                            >
                              <Trash2 className="text-destructive" />
                            </ActionButton>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
      {canManage && dialog && (
        <AssignmentDialog
          open
          onOpenChange={(v) => !v && setDialog(null)}
          jobTitleId={dialog.jobTitleId}
          jobTitleName={dialog.name}
          assignment={dialog.assignment}
          templates={templates}
          takenTemplateIds={assignments.filter((a) => a.jobTitleId === dialog.jobTitleId).map((a) => a.templateId)}
        />
      )}
    </Card>
  );
}
