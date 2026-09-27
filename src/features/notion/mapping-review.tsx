"use client";

import { useState } from "react";
import { ArrowLeftRight, CheckCircle2, ChevronDown, CircleHelp, EyeOff, Sparkles, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/shared/status-badge";
import { STAGE_TYPES, stageKeyFor, type Confidence, type FieldSuggestion } from "@/lib/notion/auto-map";
import type { FieldRole } from "@/lib/notion/item-mapper";
import { SYSTEM_STATUS_LABELS, SYSTEM_STATUSES, type SystemStatus } from "@/lib/notion/status";
import { cn } from "@/lib/utils";

export type ReviewField = FieldSuggestion & { ownerEmployeeId: string | null };
export type Bucket = "decide" | "suggested" | "auto" | "ignored";
type Option = { value: string; label: string };

const NONE = "__none__";
const SINGLE_ROLES: FieldRole[] = ["TITLE", "PRODUCT_CODE", "DATE", "BATCH", "EMPLOYEE", "TASK_TYPE", "NOTES"];
const PICKABLE_STATUSES = SYSTEM_STATUSES.filter((s) => s !== "UNMAPPED");

export const ROLE_LABELS: Partial<Record<FieldRole, string>> = {
  TITLE: "اسم العنصر",
  PRODUCT_CODE: "كود المنتج",
  DATE: "التاريخ",
  BATCH: "الدفعة",
  EMPLOYEE: "الموظف المسؤول",
  TASK_TYPE: "نوع المهمة",
  STATUS: "مرحلة عمل",
  NOTES: "ملاحظة المراجع",
};

function rolesFor(type: string): FieldRole[] {
  const roles: FieldRole[] = [];
  if (type === "title" || type === "rich_text" || type === "formula") roles.push("TITLE");
  if (["rich_text", "title", "number", "unique_id", "formula", "select"].includes(type)) roles.push("PRODUCT_CODE", "BATCH");
  if (["date", "created_time", "last_edited_time", "formula"].includes(type)) roles.push("DATE");
  if (["people", "rich_text", "select", "created_by"].includes(type)) roles.push("EMPLOYEE");
  if (type === "select" || type === "multi_select") roles.push("TASK_TYPE");
  if (type === "rich_text" || type === "formula") roles.push("NOTES");
  if (STAGE_TYPES.has(type)) roles.push("STATUS");
  return roles;
}

export function needsDecision(f: ReviewField) {
  return (f.confidence === "unknown" && f.role === null) || (f.role === "STATUS" && f.statuses.some((s) => !s.status));
}

/** Snapshot taken once after analysis so rows don't jump between sections while the user edits them. */
export function initialBucket(f: ReviewField): Bucket {
  if (needsDecision(f)) return "decide";
  if (f.role === null) return "ignored";
  if (f.confidence === "suggested" || f.statuses.some((s) => s.confidence !== "auto")) return "suggested";
  return "auto";
}

function ConfidenceIcon({ confidence, resolved }: { confidence: Confidence; resolved: boolean }) {
  if (confidence === "auto" || resolved) return <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="تم الربط" />;
  if (confidence === "suggested") return <Sparkles className="size-4 shrink-0 text-warning" aria-label="اقتراح" />;
  return <CircleHelp className="size-4 shrink-0 text-danger" aria-label="يحتاج قرارك" />;
}

function FieldRow({
  field,
  index,
  fields,
  onChange,
  employees,
  advanced,
}: {
  field: ReviewField;
  index: number;
  fields: ReviewField[];
  onChange: (next: ReviewField[]) => void;
  employees: Option[];
  advanced: boolean;
}) {
  const [open, setOpen] = useState(needsDecision(field));
  const roles = rolesFor(field.propertyType);
  const unresolved = needsDecision(field);

  const setRole = (value: string) => {
    const role = value === NONE ? null : (value as FieldRole);
    const next = fields.map((f, i) => {
      if (i === index) {
        const stageKey =
          role === "STATUS" ? (f.stageKey ?? stageKeyFor(f.label, fields.map((x) => x.stageKey).filter((k): k is string => !!k))) : null;
        return { ...f, role, stageKey, confidence: "suggested" as Confidence };
      }
      // a single-use meaning moves from the field that had it
      if (role && SINGLE_ROLES.includes(role) && f.role === role) return { ...f, role: null, confidence: "suggested" as Confidence };
      return f;
    });
    if (role === "STATUS") setOpen(true);
    onChange(next);
  };

  const patch = (p: Partial<ReviewField>) => onChange(fields.map((f, i) => (i === index ? { ...f, ...p } : f)));
  const setStatus = (value: string, status: string) =>
    patch({ statuses: field.statuses.map((s) => (s.value === value ? { ...s, status: status as SystemStatus, confidence: "suggested" } : s)) });

  const mappedCount = field.statuses.filter((s) => s.status).length;

  return (
    <li className={cn("rounded-xl border bg-card transition-colors", unresolved && "border-danger/40 bg-danger-soft/20")}>
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <ConfidenceIcon confidence={field.confidence} resolved={!unresolved && field.confidence !== "unknown"} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{field.property}</p>
            {advanced && (
              <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                {field.propertyType}
                {field.stageKey ? ` · ${field.stageKey}` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden />
          {/* an undecided field shows the placeholder so that choosing «لا يُستخدم» is a real change */}
          <Select value={field.role ?? (field.confidence === "unknown" ? "" : NONE)} onValueChange={setRole}>
            <SelectTrigger size="sm" className={cn("w-full sm:w-44", unresolved && field.role === null && "border-danger/60")} aria-label={`معنى الحقل ${field.property}`}>
              <SelectValue placeholder="اختر المعنى" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
              <SelectItem value={NONE}>لا يُستخدم</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {field.role === "STATUS" && (
        <Collapsible open={open} onOpenChange={setOpen} className="border-t">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <span>
              {field.statuses.length === 0 ? "لا توجد قيم بعد — ستُربط تلقائيًا عند ظهورها" : `ربط القيم: ${mappedCount} من ${field.statuses.length}`}
            </span>
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 px-3 pb-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`stage-label-${index}`} className="text-xs">
                  اسم المرحلة
                </Label>
                <Input id={`stage-label-${index}`} value={field.label} maxLength={200} onChange={(e) => patch({ label: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">المسؤول عن المرحلة (اختياري)</Label>
                <Select value={field.ownerEmployeeId ?? NONE} onValueChange={(v) => patch({ ownerEmployeeId: v === NONE ? null : v })}>
                  <SelectTrigger size="sm" className="w-full">
                    <UserRound className="size-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>بدون تحديد</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {field.statuses.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {field.statuses.map((s) => (
                  <li key={s.value} className="flex flex-col gap-2 px-2.5 py-2 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <ConfidenceIcon confidence={s.confidence} resolved={!!s.status && s.confidence !== "unknown"} />
                      <span className="truncate text-sm">{s.value}</span>
                      {s.count ? <span className="text-[11px] text-muted-foreground tabular-nums">({s.count})</span> : null}
                    </div>
                    <Select value={s.status ?? ""} onValueChange={(v) => setStatus(s.value, v)}>
                      <SelectTrigger size="sm" className={cn("w-full sm:w-48", !s.status && "border-danger/60")} aria-label={`حالة القيمة ${s.value}`}>
                        <SelectValue placeholder="اختر الحالة" />
                      </SelectTrigger>
                      <SelectContent>
                        {PICKABLE_STATUSES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {SYSTEM_STATUS_LABELS[st]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </li>
  );
}

const SECTIONS: { bucket: Bucket; title: string; hint: string; tone: "danger" | "warning" | "success" | "neutral" }[] = [
  { bucket: "decide", title: "تحتاج قرارك", hint: "لم نتمكن من تحديد معناها بثقة", tone: "danger" },
  { bucket: "suggested", title: "اقتراحات للمراجعة", hint: "راجعها سريعًا وغيّر ما لا يناسب", tone: "warning" },
  { bucket: "auto", title: "تم الربط تلقائيًا", hint: "لا يلزم أي إجراء", tone: "success" },
  { bucket: "ignored", title: "حقول لن تُستخدم", hint: "لا تؤثر على الأهداف أو التقارير", tone: "neutral" },
];

export function MappingReview({
  fields,
  buckets,
  onChange,
  employees,
  advanced,
}: {
  fields: ReviewField[];
  buckets: Bucket[];
  onChange: (next: ReviewField[]) => void;
  employees: Option[];
  advanced: boolean;
}) {
  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => {
        const rows = fields.map((f, i) => ({ f, i })).filter(({ i }) => buckets[i] === section.bucket);
        if (rows.length === 0) return null;
        const list = (
          <ul className="space-y-2">
            {rows.map(({ f, i }) => (
              <FieldRow key={f.property} field={f} index={i} fields={fields} onChange={onChange} employees={employees} advanced={advanced} />
            ))}
          </ul>
        );
        const header = (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={section.tone}>
              {section.title} · {rows.length}
            </StatusBadge>
            <span className="text-xs text-muted-foreground">{section.hint}</span>
          </div>
        );
        if (section.bucket === "ignored") {
          return (
            <Collapsible key={section.bucket} className="space-y-2">
              <CollapsibleTrigger className="group flex items-center gap-2">
                {header}
                <EyeOff className="size-3.5 text-muted-foreground" />
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>{list}</CollapsibleContent>
            </Collapsible>
          );
        }
        return (
          <section key={section.bucket} className="space-y-2">
            {header}
            {list}
          </section>
        );
      })}
    </div>
  );
}

export function AdvancedToggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={checked} onCheckedChange={onCheckedChange} size="sm" />
      إظهار التفاصيل التقنية
    </label>
  );
}
