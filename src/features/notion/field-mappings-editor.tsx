"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Info, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/page";
import { useServerAction } from "@/hooks/use-server-action";
import { applyPresetAction, refreshSchemaAction, saveFieldMappingsAction } from "@/actions/notion";
import { NOTION_FIELD_ROLE_LABELS, STAGE_KEY_SUGGESTIONS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS } from "./labels";

type Role = keyof typeof NOTION_FIELD_ROLE_LABELS;
const ROLES = Object.keys(NOTION_FIELD_ROLE_LABELS) as Role[];
const NONE = "__none__";

/** Notion property types that make sense for each role (used to sort suggestions). */
const ROLE_TYPES: Record<Role, string[]> = {
  TITLE: ["title", "rich_text", "formula"],
  STATUS: ["status", "select", "multi_select", "checkbox", "formula"],
  DATE: ["date", "created_time", "last_edited_time", "formula"],
  BATCH: ["number", "select", "rich_text", "formula", "rollup"],
  PRODUCT_CODE: ["rich_text", "unique_id", "number", "formula", "title"],
  EMPLOYEE: ["people", "created_by", "last_edited_by", "select", "rich_text"],
  TASK_TYPE: ["select", "multi_select", "status", "rich_text"],
  TEXT: ["rich_text", "title", "url", "formula", "select"],
  NUMBER: ["number", "formula", "rollup"],
};

export interface SchemaProp {
  id: string;
  name: string;
  type: string;
  options: { name: string; color?: string }[];
}

export interface FieldMappingRow {
  id?: string;
  role: Role;
  notionProperty: string;
  notionPropertyType: string;
  stageKey: string;
  label: string;
  ownerEmployeeId: string;
  isActive: boolean;
}

type Row = FieldMappingRow & { key: string };

let seq = 0;
const newKey = () => `new-${++seq}-${Date.now()}`;

export function FieldMappingsEditor({
  dataSourceId,
  initial,
  schema,
  employees,
}: {
  dataSourceId: string;
  initial: FieldMappingRow[];
  schema: SchemaProp[];
  employees: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => initial.map((r) => ({ ...r, key: r.id ?? newKey() })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const refresh = { onSuccess: () => router.refresh() };
  const save = useServerAction(saveFieldMappingsAction, refresh);
  const preset = useServerAction(applyPresetAction, refresh);
  const schemaRefresh = useServerAction(refreshSchemaAction, refresh);

  const update = (key: string, patch: Partial<Row>) => {
    setDirty(true);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const pickProperty = (row: Row, name: string) => {
    const prop = schema.find((p) => p.name === name);
    const patch: Partial<Row> = { notionProperty: name, notionPropertyType: prop?.type ?? row.notionPropertyType };
    if (!row.label.trim() || row.label === row.notionProperty) patch.label = name;
    if (row.role === "STATUS" && !row.stageKey) {
      const hit = STAGE_KEY_SUGGESTIONS.find((s) => s.label === name && !rows.some((r) => r.stageKey === s.key));
      if (hit) patch.stageKey = hit.key;
    }
    update(row.key, patch);
  };

  const addRow = () => {
    setDirty(true);
    setRows((rs) => [...rs, { key: newKey(), role: "STATUS", notionProperty: "", notionPropertyType: "", stageKey: "", label: "", ownerEmployeeId: "", isActive: true }]);
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    rows.forEach((r, i) => {
      if (!r.notionProperty) errs[`mappings.${i}.notionProperty`] = "اختر خاصية";
      if (!r.label.trim()) errs[`mappings.${i}.label`] = "التسمية مطلوبة";
      if (r.role === "STATUS" && !r.stageKey.trim()) errs[`mappings.${i}.stageKey`] = "مفتاح المرحلة مطلوب";
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save
      .run({
        dataSourceId,
        mappings: rows.map((r) => ({
          id: r.id,
          role: r.role,
          notionProperty: r.notionProperty,
          notionPropertyType: r.notionPropertyType || "unknown",
          stageKey: r.role === "STATUS" ? r.stageKey.trim() : null,
          label: r.label.trim(),
          ownerEmployeeId: r.ownerEmployeeId || null,
          isActive: r.isActive,
        })),
      })
      .then((r) => {
        if (r.ok) setDirty(false);
        else setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v[0]])));
      });
  };

  const busy = save.pending || preset.pending || schemaRefresh.pending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="flex max-w-2xl items-start gap-2 rounded-lg bg-info-soft/60 px-3 py-2 text-xs leading-relaxed text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          حدد دور كل خاصية من Notion. حقول «حالة مرحلة عمل» تحتاج مفتاحًا إنجليزيًا ثابتًا (مثل images أو seo) تُبنى عليه الأهداف. عند الحفظ يُعاد اشتقاق حالات جميع العناصر المحفوظة وإعادة احتساب الإنجاز دون الاتصال بـ Notion.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => schemaRefresh.run(dataSourceId)}>
            {schemaRefresh.pending ? <Spinner /> : <FileSearch />} تحديث خصائص القاعدة
          </Button>
          <Button variant="outline" size="sm" disabled={busy || schema.length === 0} onClick={() => preset.run(dataSourceId)}>
            {preset.pending ? <Spinner /> : <Wand2 />} تطبيق الربط المقترح
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="لا يوجد ربط حقول بعد"
          description={schema.length ? "طبّق الربط المقترح لقاعدة المنتجات أو أضف الحقول يدويًا." : "حدّث خصائص القاعدة من Notion أولًا ثم طبّق الربط المقترح."}
          action={
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus /> إضافة حقل
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => {
            const prop = schema.find((p) => p.name === row.notionProperty);
            const missing = !!row.notionProperty && schema.length > 0 && !prop;
            const preferred = ROLE_TYPES[row.role];
            const sortedSchema = [...schema].sort((a, b) => Number(preferred.includes(b.type)) - Number(preferred.includes(a.type)));
            const err = (f: string) => errors[`mappings.${i}.${f}`];
            return (
              <div key={row.key} className={cn("rounded-xl border bg-card p-3", !row.isActive && "opacity-60", missing && "border-warning/50")}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className="text-xs text-muted-foreground">الدور</Label>
                    <Select value={row.role} onValueChange={(v) => update(row.key, { role: v as Role })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {NOTION_FIELD_ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 lg:col-span-3">
                    <Label className="text-xs text-muted-foreground">خاصية Notion</Label>
                    {schema.length > 0 ? (
                      <Select value={row.notionProperty || undefined} onValueChange={(v) => pickProperty(row, v)}>
                        <SelectTrigger className="w-full" aria-invalid={!!err("notionProperty") || missing}>
                          <SelectValue placeholder="اختر خاصية" />
                        </SelectTrigger>
                        <SelectContent>
                          {missing && (
                            <SelectItem value={row.notionProperty}>
                              {row.notionProperty} (غير موجودة في القاعدة)
                            </SelectItem>
                          )}
                          {sortedSchema.map((p) => (
                            <SelectItem key={p.id} value={p.name}>
                              <span className="truncate">{p.name}</span>
                              <span className="ms-auto text-[11px] text-muted-foreground">{PROPERTY_TYPE_LABELS[p.type] ?? p.type}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={row.notionProperty} onChange={(e) => update(row.key, { notionProperty: e.target.value })} placeholder="اسم الخاصية كما في Notion" aria-invalid={!!err("notionProperty")} />
                    )}
                    <p className={cn("text-[11px]", missing ? "text-warning" : err("notionProperty") ? "text-destructive" : "text-muted-foreground")}>
                      {err("notionProperty") ??
                        (missing ? "لم تعد موجودة في Notion — اخترها من جديد" : row.notionPropertyType ? `النوع: ${PROPERTY_TYPE_LABELS[row.notionPropertyType] ?? row.notionPropertyType}` : " ")}
                    </p>
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className="text-xs text-muted-foreground">مفتاح المرحلة</Label>
                    <Input
                      dir="ltr"
                      list={`stage-keys-${dataSourceId}`}
                      value={row.role === "STATUS" ? row.stageKey : ""}
                      disabled={row.role !== "STATUS"}
                      onChange={(e) => update(row.key, { stageKey: e.target.value.replace(/\s+/g, "") })}
                      placeholder={row.role === "STATUS" ? "images" : "—"}
                      className="font-mono text-xs"
                      aria-invalid={!!err("stageKey")}
                    />
                    {err("stageKey") && <p className="text-[11px] text-destructive">{err("stageKey")}</p>}
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className="text-xs text-muted-foreground">التسمية بالعربية</Label>
                    <Input value={row.label} onChange={(e) => update(row.key, { label: e.target.value })} maxLength={120} aria-invalid={!!err("label")} />
                    {err("label") && <p className="text-[11px] text-destructive">{err("label")}</p>}
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className="text-xs text-muted-foreground">مسؤول المرحلة</Label>
                    <Select value={row.ownerEmployeeId || NONE} onValueChange={(v) => update(row.key, { ownerEmployeeId: v === NONE ? "" : v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>بدون</SelectItem>
                        {employees.map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            {e.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end justify-between gap-2 lg:col-span-1 lg:flex-col lg:items-end lg:justify-end">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch size="sm" checked={row.isActive} onCheckedChange={(v) => update(row.key, { isActive: v })} aria-label="نشط" />
                      نشط
                    </label>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label="حذف الحقل"
                      onClick={() => {
                        setDirty(true);
                        setRows((rs) => rs.filter((r) => r.key !== row.key));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <datalist id={`stage-keys-${dataSourceId}`}>
        {STAGE_KEY_SUGGESTIONS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </datalist>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" size="sm" onClick={addRow} disabled={busy}>
          <Plus /> إضافة حقل
        </Button>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-warning">تغييرات غير محفوظة</span>}
          <Button onClick={submit} disabled={busy}>
            {save.pending ? <Spinner /> : <Save />} حفظ ربط الحقول
          </Button>
        </div>
      </div>
    </div>
  );
}
