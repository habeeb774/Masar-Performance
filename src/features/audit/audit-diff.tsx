"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDateAr, formatDateTimeAr, isDateKey } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import { REDACTED, SENSITIVE_KEY, type JsonValue } from "./redact";

type Obj = { [k: string]: JsonValue };

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

const isObj = (v: JsonValue | undefined): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isPrimitive = (v: JsonValue | undefined) => v === null || v === undefined || typeof v !== "object";
const same = (a: JsonValue | undefined, b: JsonValue | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function primitiveText(v: JsonValue | undefined, tz: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "number") return formatNumber(v, 2);
  if (typeof v === "string") {
    if (ISO_DATETIME.test(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return formatDateTimeAr(d, tz);
    }
    if (isDateKey(v)) return formatDateAr(v);
    return v === "" ? "(فارغ)" : v;
  }
  return String(v);
}

/** Human readable rendering of any JSON value (nested objects / arrays included). */
export function ValueView({ value, tz, depth = 0 }: { value: JsonValue | undefined; tz: string; depth?: number }) {
  if (value === REDACTED) return <span className="text-xs text-muted-foreground italic">{REDACTED}</span>;
  if (isPrimitive(value)) {
    return <span className={cn("break-words whitespace-pre-wrap", (value === null || value === undefined) && "text-muted-foreground")}>{primitiveText(value, tz)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">قائمة فارغة</span>;
    if (value.every((v) => isPrimitive(v))) {
      return (
        <span className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {primitiveText(v, tz)}
            </span>
          ))}
        </span>
      );
    }
    if (depth > 4) return <code className="text-xs break-all">{JSON.stringify(value)}</code>;
    return (
      <ol className="space-y-1.5">
        {value.map((v, i) => (
          <li key={i} className="border-s-2 ps-2">
            <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
            <ValueView value={v} tz={tz} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }
  const entries = Object.entries(value as Obj);
  if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
  if (depth > 4) return <code className="text-xs break-all">{JSON.stringify(value)}</code>;
  return (
    <dl className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="border-s-2 ps-2">
          <dt className="font-mono text-[11px] text-muted-foreground" dir="ltr">
            {k}
          </dt>
          <dd className="text-xs">{SENSITIVE_KEY.test(k) ? <span className="text-muted-foreground italic">{REDACTED}</span> : <ValueView value={v} tz={tz} depth={depth + 1} />}</dd>
        </div>
      ))}
    </dl>
  );
}

function Side({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "before" | "after" }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md p-2 text-sm",
        tone === "before" && "bg-danger-soft/70",
        tone === "after" && "bg-success-soft/70",
        !tone && "bg-muted/40",
      )}
    >
      <span className="mb-0.5 block text-[10px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function PrimitiveArrayDiff({ before, after, tz }: { before: JsonValue[]; after: JsonValue[]; tz: string }) {
  const b = new Set(before.map((v) => JSON.stringify(v)));
  const a = new Set(after.map((v) => JSON.stringify(v)));
  const removed = before.filter((v) => !a.has(JSON.stringify(v)));
  const added = after.filter((v) => !b.has(JSON.stringify(v)));
  const kept = after.filter((v) => b.has(JSON.stringify(v)));
  const chip = (v: JsonValue, cls: string, i: number) => (
    <span key={i} className={cn("rounded px-1.5 py-0.5 font-mono text-xs", cls)} dir="ltr">
      {primitiveText(v, tz)}
    </span>
  );
  return (
    <div className="space-y-3 text-sm">
      {removed.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-danger">أُزيل ({removed.length})</p>
          <div className="flex flex-wrap gap-1">{removed.map((v, i) => chip(v, "bg-danger-soft text-danger line-through", i))}</div>
        </div>
      )}
      {added.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-success">أُضيف ({added.length})</p>
          <div className="flex flex-wrap gap-1">{added.map((v, i) => chip(v, "bg-success-soft text-success", i))}</div>
        </div>
      )}
      {removed.length === 0 && added.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد اختلاف في العناصر.</p>}
      {kept.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">دون تغيير ({kept.length})</p>
          <div className="flex flex-wrap gap-1">{kept.map((v, i) => chip(v, "bg-muted text-muted-foreground", i))}</div>
        </div>
      )}
    </div>
  );
}

function ObjectDiff({ before, after, tz, depth = 0 }: { before: Obj; after: Obj; tz: string; depth?: number }) {
  const [showAll, setShowAll] = useState(false);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys.filter((k) => !same(before[k], after[k]));
  const unchanged = keys.filter((k) => same(before[k], after[k]));
  const visible = showAll ? keys : changed;

  return (
    <div className="space-y-2">
      {changed.length === 0 && <p className="text-xs text-muted-foreground">لا توجد حقول متغيرة.</p>}
      {visible.map((k) => {
        const isChanged = changed.includes(k);
        const b = before[k];
        const a = after[k];
        const redacted = SENSITIVE_KEY.test(k);
        return (
          <div key={k} className={cn("rounded-lg border p-2", isChanged ? "border-warning/40" : "opacity-70")}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-mono text-xs font-semibold" dir="ltr">
                {k}
              </span>
              {isChanged && (
                <span className="rounded bg-warning-soft px-1.5 text-[10px] font-medium text-warning">
                  {!(k in before) ? "جديد" : !(k in after) ? "محذوف" : "متغير"}
                </span>
              )}
            </div>
            {redacted ? (
              <span className="text-xs text-muted-foreground italic">{REDACTED}</span>
            ) : isChanged && isObj(b) && isObj(a) && depth < 3 ? (
              <ObjectDiff before={b} after={a} tz={tz} depth={depth + 1} />
            ) : isChanged && Array.isArray(b) && Array.isArray(a) && b.every(isPrimitive) && a.every(isPrimitive) ? (
              <PrimitiveArrayDiff before={b} after={a} tz={tz} />
            ) : isChanged ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Side label="قبل" tone="before">
                  <ValueView value={b} tz={tz} />
                </Side>
                <Side label="بعد" tone="after">
                  <ValueView value={a} tz={tz} />
                </Side>
              </div>
            ) : (
              <div className="text-sm">
                <ValueView value={a} tz={tz} />
              </div>
            )}
          </div>
        );
      })}
      {unchanged.length > 0 && (
        <Button variant="ghost" size="xs" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "إخفاء الحقول غير المتغيرة" : `إظهار الحقول غير المتغيرة (${unchanged.length})`}
        </Button>
      )}
    </div>
  );
}

/** Before/after comparison for an audit row. Handles objects, arrays, nested values and one-sided entries. */
export function AuditDiff({ before, after, tz }: { before: JsonValue; after: JsonValue; tz: string }) {
  if (before === null && after === null) return <p className="text-sm text-muted-foreground">لا توجد بيانات تفصيلية لهذا الإجراء.</p>;
  if ((isObj(before) || before === null) && (isObj(after) || after === null)) {
    if (before === null) {
      return (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-success">البيانات المسجلة (إنشاء / بعد)</p>
          <Side label="بعد" tone="after">
            <ValueView value={after} tz={tz} />
          </Side>
        </div>
      );
    }
    if (after === null) {
      return (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-danger">البيانات قبل الإجراء (حذف / قبل)</p>
          <Side label="قبل" tone="before">
            <ValueView value={before} tz={tz} />
          </Side>
        </div>
      );
    }
    return <ObjectDiff before={before as Obj} after={after as Obj} tz={tz} />;
  }
  if (Array.isArray(before) && Array.isArray(after) && before.every(isPrimitive) && after.every(isPrimitive)) {
    return <PrimitiveArrayDiff before={before} after={after} tz={tz} />;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Side label="قبل" tone="before">
        <ValueView value={before} tz={tz} />
      </Side>
      <Side label="بعد" tone="after">
        <ValueView value={after} tz={tz} />
      </Side>
    </div>
  );
}
