"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { saveGoalTemplateAction } from "@/actions/org";
import { goalTemplateSchema } from "@/lib/validation";
import {
  GOAL_SOURCE_LABELS,
  GOAL_TYPE_LABELS,
  GOAL_TYPES,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
} from "@/lib/labels";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import { NotionFilterRuleBuilder } from "./notion-filter-builder";
import { EMPTY_RULE, newTemplateItem, normalizeRule, type NotionSourceOption, type TestPeriod } from "./types";
import { ADHOC_DUTY_TITLE } from "@/lib/duties";

type FormIn = z.input<typeof goalTemplateSchema>;
type FormOut = z.output<typeof goalTemplateSchema>;
type ItemIn = FormIn["items"][number];

const NONE = "__none";


function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  label: (v: T) => string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {label(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ItemEditor({
  index,
  count,
  control,
  register,
  errors,
  sources,
  testPeriod,
  onMove,
  onRemove,
  watchItem,
  setItemValue,
}: {
  index: number;
  count: number;
  control: Control<FormIn, unknown, FormOut>;
  register: UseFormRegister<FormIn>;
  errors: FieldErrors<FormIn>;
  sources: NotionSourceOption[];
  testPeriod: TestPeriod;
  onMove: (to: number) => void;
  onRemove: () => void;
  watchItem: ItemIn;
  setItemValue: <K extends keyof ItemIn>(key: K, value: ItemIn[K]) => void;
}) {
  const [open, setOpen] = useState(!watchItem.name);
  const err = errors.items?.[index];
  const hasError = !!err;
  const source = watchItem.source;
  const selectedSource = sources.find((s) => s.id === watchItem.notionDataSourceId);
  return (
    <div className={cn("rounded-xl border bg-card", hasError && "border-destructive/50")}>
      <div className="flex flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold tabular-nums">{index + 1}</span>
        <Input {...register(`items.${index}.name`)} placeholder="اسم الهدف" className="min-w-0 flex-1 basis-40" aria-invalid={!!err?.name} aria-label="اسم الهدف" />
        <Input
          {...register(`items.${index}.dutyName`)}
          list={DUTY_LIST_ID}
          placeholder="الواجب (اختياري)"
          className="min-w-0 basis-40 sm:w-56 sm:flex-none"
          maxLength={120}
          aria-label="اسم الواجب"
        />
        <div className="flex items-center gap-1">
          <Input
            {...register(`items.${index}.weight`)}
            type="number"
            min={0}
            max={100}
            step="any"
            className="w-20"
            aria-label="الوزن"
            aria-invalid={!!err?.weight}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        {source === "NOTION" && <StatusBadge tone="neutral">Notion</StatusBadge>}
        <div className="ms-auto flex items-center">
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="تحريك لأعلى">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="تحريك لأسفل">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" onClick={onRemove} aria-label="حذف البند">
            <Trash2 />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen((o) => !o)} aria-label="التفاصيل" aria-expanded={open}>
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>
      {hasError && !open && <p className="px-3 pb-2 text-xs text-destructive">يوجد خطأ في هذا البند — افتح التفاصيل للمراجعة.</p>}
      {open && (
        <div className="space-y-4 border-t p-3">
          {err?.name && <p className="text-xs text-destructive">{err.name.message}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field className="sm:col-span-2 lg:col-span-4">
              <FieldLabel>الوصف</FieldLabel>
              <Textarea rows={2} {...register(`items.${index}.description`)} />
            </Field>
            <Field>
              <FieldLabel>نوع الهدف</FieldLabel>
              <Controller control={control} name={`items.${index}.goalType`} render={({ field }) => <SimpleSelect value={field.value} onChange={field.onChange} options={GOAL_TYPES} label={(v) => GOAL_TYPE_LABELS[v]} />} />
            </Field>
            <Field data-invalid={!!err?.targetValue}>
              <FieldLabel>المستهدف</FieldLabel>
              <Input type="number" min={0} step="any" {...register(`items.${index}.targetValue`)} />
              <FieldError errors={[err?.targetValue]} />
            </Field>
            <Field data-invalid={!!err?.unit}>
              <FieldLabel>الوحدة</FieldLabel>
              <Input {...register(`items.${index}.unit`)} />
              <FieldError errors={[err?.unit]} />
            </Field>
            <Field>
              <FieldLabel>الأولوية</FieldLabel>
              <Controller control={control} name={`items.${index}.priority`} render={({ field }) => <SimpleSelect value={field.value} onChange={field.onChange} options={PRIORITIES} label={(v) => PRIORITY_LABELS[v].label} />} />
            </Field>
            <Field>
              <FieldLabel>التصنيف (KPI)</FieldLabel>
              <Controller control={control} name={`items.${index}.category`} render={({ field }) => <SimpleSelect value={field.value} onChange={field.onChange} options={KPI_CATEGORIES} label={(v) => KPI_CATEGORY_LABELS[v].label} />} />
            </Field>
            <Field>
              <FieldLabel>مصدر الإنجاز</FieldLabel>
              <Controller
                control={control}
                name={`items.${index}.source`}
                render={({ field }) => (
                  <SimpleSelect
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      if (v === "NOTION") {
                        if (watchItem.goalType === "NUMERIC") setItemValue("goalType", "NOTION_SYNCED");
                        if (!watchItem.notionFilter) setItemValue("notionFilter", { ...EMPTY_RULE });
                      }
                    }}
                    options={["MANUAL", "NOTION"] as const}
                    label={(v) => GOAL_SOURCE_LABELS[v]}
                  />
                )}
              />
            </Field>
            {source === "NOTION" && (
              <Field className="sm:col-span-2" data-invalid={!!err?.notionDataSourceId}>
                <FieldLabel>قاعدة بيانات Notion</FieldLabel>
                <Controller
                  control={control}
                  name={`items.${index}.notionDataSourceId`}
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setItemValue("notionFilter", { ...EMPTY_RULE });
                      }}
                    >
                      <SelectTrigger className="w-full" aria-invalid={!!err?.notionDataSourceId}>
                        <SelectValue placeholder="اختر القاعدة" />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.length === 0 && (
                          <SelectItem value={NONE} disabled>
                            لا توجد قواعد Notion مضافة
                          </SelectItem>
                        )}
                        {sources.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                            {!s.isActive && " (غير نشطة)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[err?.notionDataSourceId]} />
              </Field>
            )}
          </div>
          {source === "NOTION" && (
            <Controller
              control={control}
              name={`items.${index}.notionFilter`}
              render={({ field }) => (
                <NotionFilterRuleBuilder
                  value={normalizeRule(field.value)}
                  onChange={field.onChange}
                  source={selectedSource}
                  testPeriod={testPeriod}
                  target={Number(watchItem.targetValue) || 0}
                  error={err?.notionFilter ? (err.notionFilter.message ?? "راجع قاعدة الفلترة") : undefined}
                />
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}

const DUTY_LIST_ID = "template-duties";

/** Full editor for a goal template and its items. */
export function TemplateEditor({
  id,
  initial,
  jobTitles,
  sources,
  testPeriod,
}: {
  id: string | null;
  initial: FormIn;
  jobTitles: { id: string; name: string }[];
  sources: NotionSourceOption[];
  testPeriod: TestPeriod;
}) {
  const router = useRouter();
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(goalTemplateSchema), defaultValues: initial });
  const { control, register, handleSubmit, watch, setValue, formState } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const totalWeight = Math.round(items.reduce((a, it) => a + (Number(it.weight) || 0), 0) * 100) / 100;
  const weightOk = Math.abs(totalWeight - 100) < 0.01;
  const { run, pending } = useServerAction(saveGoalTemplateAction, {
    onSuccess: () => {
      router.push("/goals");
      router.refresh();
    },
  });

  const submit = handleSubmit((values) => run(id, values));

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">بيانات القالب</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!formState.errors.name}>
            <FieldLabel htmlFor="tpl-name">اسم القالب</FieldLabel>
            <Input id="tpl-name" {...register("name")} aria-invalid={!!formState.errors.name} />
            <FieldError errors={[formState.errors.name]} />
          </Field>
          <Field>
            <FieldLabel>المسمى الوظيفي</FieldLabel>
            <Controller
              control={control}
              name="jobTitleId"
              render={({ field }) => (
                <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>بدون مسمى (قالب عام)</SelectItem>
                    {jobTitles.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="tpl-desc">الوصف</FieldLabel>
            <Textarea id="tpl-desc" rows={2} {...register("description")} />
          </Field>
          <Field orientation="horizontal" className="sm:col-span-2">
            <Controller control={control} name="isActive" render={({ field }) => <Switch id="tpl-active" checked={!!field.value} onCheckedChange={field.onChange} />} />
            <FieldLabel htmlFor="tpl-active">قالب نشط — يُقترح تلقائيًا عند إنشاء خطط هذا المسمى</FieldLabel>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">بنود الأهداف ({fields.length})</CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge tone={weightOk ? "success" : "warning"}>
              {weightOk ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
              مجموع الأوزان {formatNumber(totalWeight, 2)}%
            </StatusBadge>
            <Button type="button" size="sm" variant="outline" onClick={() => append(newTemplateItem())} disabled={fields.length >= 50}>
              <Plus /> إضافة بند
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <datalist id={DUTY_LIST_ID}>
            {[...new Set([...(items ?? []).map((it) => it?.dutyName?.trim()).filter(Boolean), ADHOC_DUTY_TITLE])].map((d) => (
              <option key={d} value={d!} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">«الواجب» يجمع الأهداف في الخطة والتقييم وملف الموارد البشرية. إن تُرك فارغًا تُجمع حسب التصنيف.</p>
          {!weightOk && fields.length > 0 && (
            <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">مجموع الأوزان يجب أن يساوي 100% ليكون الإنجاز الموزون دقيقًا (الفرق {formatNumber(Math.round((totalWeight - 100) * 100) / 100, 2)}).</p>
          )}
          {fields.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد بنود بعد — أضف أول هدف للقالب.</div>
          ) : (
            fields.map((f, i) => (
              <ItemEditor
                key={f.id}
                index={i}
                count={fields.length}
                control={control}
                register={register}
                errors={formState.errors}
                sources={sources}
                testPeriod={testPeriod}
                onMove={(to) => move(i, to)}
                onRemove={() => remove(i)}
                watchItem={items[i] ?? newTemplateItem()}
                setItemValue={(key, value) =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  setValue(`items.${i}.${key}` as any, value as any, { shouldDirty: true })
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-3 py-3 backdrop-blur md:-mx-6 md:px-6">
        {Object.keys(formState.errors).length > 0 && <p className="me-auto text-xs text-destructive">راجع الحقول المظللة قبل الحفظ.</p>}
        <Button type="button" variant="outline" asChild>
          <Link href="/goals">إلغاء</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : <Save />} حفظ القالب
        </Button>
      </div>
    </form>
  );
}
