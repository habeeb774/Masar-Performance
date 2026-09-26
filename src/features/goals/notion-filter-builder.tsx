"use client";

import { useId, useState } from "react";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { testFilterRuleAction } from "@/actions/notion";
import { CONDITION_OP_LABELS, DATE_BASIS_LABELS, type FilterCondition, type NotionFilterRule } from "@/lib/notion/filter-rule";
import { SYSTEM_STATUSES } from "@/lib/notion/status";
import type { ProgressBreakdown } from "@/lib/notion/progress";
import { NOTION_STATUS_LABELS } from "@/lib/labels";
import { toneClasses } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { EMPTY_RULE, type NotionSourceOption, type TestPeriod } from "./types";
import { NotionBreakdownGrid } from "@/features/plans/notion-breakdown";

const FIELD_LABELS: Record<FilterCondition["field"], string> = {
  batch: "الدفعة",
  productCode: "كود المنتج",
  taskType: "نوع المهمة",
  property: "خاصية Notion",
};
const OPS = Object.keys(CONDITION_OP_LABELS) as FilterCondition["op"][];
const NO_VALUE_OPS: FilterCondition["op"][] = ["is_empty", "not_empty"];
const LIST_OPS: FilterCondition["op"][] = ["in", "not_in"];

function Chip({ active, onClick, children, tone = "primary" }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: keyof typeof toneClasses }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
        active ? toneClasses[tone] : "bg-background text-muted-foreground ring-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function valueToText(c: FilterCondition): string {
  if (c.value === undefined) return "";
  return Array.isArray(c.value) ? c.value.join("، ") : String(c.value);
}

function textToValue(op: FilterCondition["op"], text: string): FilterCondition["value"] {
  if (NO_VALUE_OPS.includes(op)) return undefined;
  if (LIST_OPS.includes(op)) {
    return text
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (op === "gte" || op === "lte") {
    const n = Number(text);
    return text.trim() !== "" && Number.isFinite(n) ? n : text;
  }
  return text;
}

function ConditionRow({
  condition,
  source,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  source: NotionSourceOption;
  onChange: (c: FilterCondition) => void;
  onRemove: () => void;
}) {
  const listId = useId();
  const [text, setText] = useState(valueToText(condition));
  const prop = condition.field === "property" ? source.properties.find((p) => p.name === condition.property) : undefined;
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/20 p-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_9rem_minmax(0,1fr)_auto] sm:items-center">
      <Select value={condition.field} onValueChange={(v) => onChange({ ...condition, field: v as FilterCondition["field"], property: v === "property" ? condition.property : undefined })}>
        <SelectTrigger className="w-full" aria-label="الحقل">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(FIELD_LABELS) as FilterCondition["field"][]).map((f) => (
            <SelectItem key={f} value={f}>
              {FIELD_LABELS[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {condition.field === "property" ? (
        <Select value={condition.property || undefined} onValueChange={(v) => onChange({ ...condition, property: v })}>
          <SelectTrigger className="w-full" aria-label="الخاصية">
            <SelectValue placeholder="اختر الخاصية" />
          </SelectTrigger>
          <SelectContent>
            {source.properties.length === 0 && (
              <SelectItem value="__none" disabled>
                لا توجد خصائص محفوظة — حدّث مخطط القاعدة
              </SelectItem>
            )}
            {source.properties.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                {p.name} <span className="text-muted-foreground">({p.type})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="hidden text-xs text-muted-foreground sm:block">حقل مربوط من إعداد الحقول</span>
      )}
      <Select
        value={condition.op}
        onValueChange={(v) => {
          const op = v as FilterCondition["op"];
          onChange({ ...condition, op, value: textToValue(op, text) });
        }}
      >
        <SelectTrigger className="w-full" aria-label="الشرط">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPS.map((op) => (
            <SelectItem key={op} value={op}>
              {CONDITION_OP_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {NO_VALUE_OPS.includes(condition.op) ? (
        <span className="text-xs text-muted-foreground">بدون قيمة</span>
      ) : (
        <>
          <Input
            value={text}
            list={prop?.options.length ? listId : undefined}
            placeholder={LIST_OPS.includes(condition.op) ? "قيم مفصولة بفاصلة" : "القيمة"}
            onChange={(e) => {
              setText(e.target.value);
              onChange({ ...condition, value: textToValue(condition.op, e.target.value) });
            }}
            aria-label="القيمة"
          />
          {prop && prop.options.length > 0 && (
            <datalist id={listId}>
              {prop.options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
        </>
      )}
      <Button type="button" variant="ghost" size="icon-sm" className="justify-self-end text-destructive" onClick={onRemove} aria-label="حذف الشرط">
        <Trash2 />
      </Button>
    </div>
  );
}

/**
 * Builder for a `NotionFilterRule`: which workflow stage counts, which statuses
 * mean "completed", extra item conditions, the date basis and a live test.
 */
export function NotionFilterRuleBuilder({
  value,
  onChange,
  source,
  testPeriod,
  employeeId = null,
  target = 0,
  error,
}: {
  value: NotionFilterRule | null | undefined;
  onChange: (rule: NotionFilterRule) => void;
  source: NotionSourceOption | undefined;
  testPeriod: TestPeriod;
  employeeId?: string | null;
  target?: number;
  error?: string;
}) {
  const rule: NotionFilterRule = value ?? EMPTY_RULE;
  const [result, setResult] = useState<ProgressBreakdown | null>(null);
  const [condKeys, setCondKeys] = useState<number[]>(() => rule.conditions.map((_, i) => i));
  const [nextKey, setNextKey] = useState(rule.conditions.length);
  const { run, pending } = useServerAction(testFilterRuleAction, { silent: true, onSuccess: (d) => setResult(d ?? null) });

  if (!source) {
    return <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">اختر قاعدة بيانات Notion أولًا لتحديد قاعدة الاحتساب.</p>;
  }
  const set = (patch: Partial<NotionFilterRule>) => {
    setResult(null);
    onChange({ ...rule, ...patch });
  };
  const stage = source.stages.find((s) => s.stageKey === rule.stageKey);
  const toggle = <T extends string>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>مرحلة العمل (حقل الحالة)</Label>
          <Select value={rule.stageKey || undefined} onValueChange={(v) => set({ stageKey: v, completedRawValues: [] })}>
            <SelectTrigger className="w-full" aria-invalid={!!error && !rule.stageKey}>
              <SelectValue placeholder="اختر المرحلة" />
            </SelectTrigger>
            <SelectContent>
              {source.stages.length === 0 && (
                <SelectItem value="__none" disabled>
                  لا توجد حقول حالة مربوطة
                </SelectItem>
              )}
              {source.stages.map((s) => (
                <SelectItem key={s.stageKey} value={s.stageKey}>
                  {s.label} <span className="text-muted-foreground">({s.stageKey})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {source.stages.length === 0 && <p className="text-xs text-warning">اربط حقول الحالة لهذه القاعدة من إعدادات Notion أولًا.</p>}
        </div>
        <div className="space-y-1.5">
          <Label>أساس التاريخ</Label>
          <Select value={rule.dateBasis} onValueChange={(v) => set({ dateBasis: v as NotionFilterRule["dateBasis"] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DATE_BASIS_LABELS) as NotionFilterRule["dateBasis"][]).map((k) => (
                <SelectItem key={k} value={k}>
                  {DATE_BASIS_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>الحالات التي تُحتسب مكتملة</Label>
        <div className="flex flex-wrap gap-1.5">
          {SYSTEM_STATUSES.map((s) => (
            <Chip key={s} active={rule.completedStatuses.includes(s)} tone={NOTION_STATUS_LABELS[s].tone} onClick={() => set({ completedStatuses: toggle(rule.completedStatuses, s) })}>
              {NOTION_STATUS_LABELS[s].label}
            </Chip>
          ))}
        </div>
      </div>

      {stage && stage.rawValues.length > 0 && (
        <div className="space-y-1.5">
          <Label>قيم Notion محددة (اختياري)</Label>
          <p className="text-xs text-muted-foreground">عند اختيار قيم هنا تُحتسب هذه القيم فقط كمكتملة بدلًا من الحالات أعلاه.</p>
          <div className="flex flex-wrap gap-1.5">
            {stage.rawValues.map((v) => (
              <Chip key={v} active={rule.completedRawValues.includes(v)} onClick={() => set({ completedRawValues: toggle(rule.completedRawValues, v) })}>
                {v}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>شروط إضافية على العناصر</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCondKeys((k) => [...k, nextKey]);
              setNextKey((n) => n + 1);
              set({ conditions: [...rule.conditions, { field: "batch", op: "eq", value: "" }] });
            }}
          >
            <Plus /> إضافة شرط
          </Button>
        </div>
        {rule.conditions.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد شروط — تُحتسب كل عناصر القاعدة في هذه المرحلة.</p>
        ) : (
          rule.conditions.map((c, i) => (
            <ConditionRow
              key={condKeys[i] ?? i}
              condition={c}
              source={source}
              onChange={(next) => set({ conditions: rule.conditions.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => {
                setCondKeys((k) => k.filter((_, j) => j !== i));
                set({ conditions: rule.conditions.filter((_, j) => j !== i) });
              }}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2.5">
        <div>
          <Label htmlFor="match-employee">احتساب عناصر الموظف فقط</Label>
          <p className="text-xs text-muted-foreground">يُطابق الموظف المسند في Notion مع صاحب الهدف.</p>
        </div>
        <Switch id="match-employee" checked={rule.matchEmployee} onCheckedChange={(v) => set({ matchEmployee: v })} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">اختبار على بيانات {testPeriod.label} المتزامنة</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending || !rule.stageKey}
            onClick={() => run({ dataSourceId: source.id, rule, start: testPeriod.start, end: testPeriod.end, employeeId, target })}
          >
            {pending ? <Spinner /> : <FlaskConical />} اختبار القاعدة
          </Button>
        </div>
        {result && <NotionBreakdownGrid breakdown={result} />}
      </div>
    </div>
  );
}
