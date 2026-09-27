"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { addGoalAction, updateGoalAction } from "@/actions/plans";
import { monthlyGoalSchema } from "@/lib/validation";
import { formatNumber } from "@/lib/num";
import {
  GOAL_SOURCE_LABELS,
  GOAL_SOURCES,
  GOAL_TYPE_LABELS,
  GOAL_TYPES,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
} from "@/lib/labels";
import { NotionFilterRuleBuilder } from "@/features/goals/notion-filter-builder";
import { EMPTY_RULE, normalizeRule, type NotionSourceOption, type TestPeriod } from "@/features/goals/types";
import type { PlanGoalRow } from "./types";

type FormIn = z.input<typeof monthlyGoalSchema>;
type FormOut = z.output<typeof monthlyGoalSchema>;

export function goalFormDefaults(goal: PlanGoalRow | undefined, dates: { start: string; end: string }): FormIn {
  return {
    name: goal?.name ?? "",
    dutyName: goal?.dutyName ?? "",
    description: goal?.description ?? "",
    goalType: goal?.goalType ?? "NUMERIC",
    targetValue: goal?.targetValue ?? 0,
    unit: goal?.unit ?? "عنصر",
    weight: goal?.weight ?? 0,
    priority: goal?.priority ?? "MEDIUM",
    source: goal?.source ?? "MANUAL",
    category: goal?.category ?? "PRODUCTIVITY",
    notionDataSourceId: goal?.notionDataSourceId ?? null,
    notionFilter: goal?.notionFilter ?? null,
    startDate: goal ? (goal.startDate ?? "") : dates.start,
    dueDate: goal ? (goal.dueDate ?? "") : dates.end,
  };
}

function GoalFormBody({
  planId,
  goal,
  sources,
  testPeriod,
  employeeId,
  dates,
  onDone,
}: {
  planId: string;
  goal?: PlanGoalRow;
  sources: NotionSourceOption[];
  testPeriod: TestPeriod;
  employeeId: string | null;
  dates: { start: string; end: string };
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(monthlyGoalSchema), defaultValues: goalFormDefaults(goal, dates) });
  const { register, control, handleSubmit, watch, setValue, formState } = form;
  const errors = formState.errors;
  const add = useServerAction(addGoalAction, { onSuccess: () => (router.refresh(), onDone()) });
  const update = useServerAction(updateGoalAction, { onSuccess: () => (router.refresh(), onDone()) });
  const pending = add.pending || update.pending;
  const [advanced, setAdvanced] = useState(false);

  const source = watch("source");
  const dataSourceId = watch("notionDataSourceId");
  const target = Number(watch("targetValue")) || 0;
  const selectedSource = sources.find((s) => s.id === dataSourceId);

  const submit = handleSubmit(
    (values) => {
      const payload = source === "NOTION" ? values : { ...values, notionDataSourceId: null, notionFilter: null };
      if (goal) update.run(goal.id, payload);
      else add.run(planId, payload);
    },
    (errs) => {
      if (errs.weight || errs.goalType || errs.category || errs.priority || errs.source || errs.startDate || errs.dueDate || errs.notionDataSourceId || errs.notionFilter) setAdvanced(true);
    },
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" data-invalid={!!errors.name}>
          <FieldLabel htmlFor="goal-name">اسم الهدف</FieldLabel>
          <Input id="goal-name" {...register("name")} aria-invalid={!!errors.name} />
          <FieldError errors={[errors.name]} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <Field data-invalid={!!errors.targetValue}>
            <FieldLabel htmlFor="goal-target">المستهدف</FieldLabel>
            <Input id="goal-target" type="number" min={0} step="any" inputMode="decimal" {...register("targetValue")} />
            <FieldError errors={[errors.targetValue]} />
          </Field>
          <Field data-invalid={!!errors.unit}>
            <FieldLabel htmlFor="goal-unit">الوحدة</FieldLabel>
            <Input id="goal-unit" {...register("unit")} />
            <FieldError errors={[errors.unit]} />
          </Field>
        </div>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="goal-desc">الوصف (اختياري)</FieldLabel>
          <Textarea id="goal-desc" rows={2} {...register("description")} />
        </Field>
      </div>

      <details className="group rounded-xl border" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold">
          <span className="flex min-w-0 flex-col gap-0.5">
            إعدادات متقدمة
            <span className="truncate text-xs font-normal text-muted-foreground">
              الوزن {formatNumber(Number(watch("weight")) || 0, 2)}% · {GOAL_SOURCE_LABELS[source]}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="goal-duty">الواجب</FieldLabel>
              <Input id="goal-duty" maxLength={120} placeholder="مثال: إضافة وتعديل المنتجات في المتجر" {...register("dutyName")} />
              <p className="text-xs text-muted-foreground">يجمع الأهداف في الخطة والتقييم وملف الموارد البشرية. فارغ = حسب التصنيف.</p>
            </Field>
            <Field data-invalid={!!errors.weight}>
              <FieldLabel htmlFor="goal-weight">الوزن %</FieldLabel>
              <Input id="goal-weight" type="number" min={0} max={100} step="any" inputMode="decimal" {...register("weight")} />
              <FieldError errors={[errors.weight]} />
            </Field>
            <Field>
              <FieldLabel>نوع القياس</FieldLabel>
              <Controller
                control={control}
                name="goalType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {GOAL_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field>
              <FieldLabel>التصنيف</FieldLabel>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KPI_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {KPI_CATEGORY_LABELS[c].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field>
              <FieldLabel>الأولوية</FieldLabel>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORITY_LABELS[p].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field>
              <FieldLabel>مصدر الإنجاز</FieldLabel>
              <Controller
                control={control}
                name="source"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      if (v === "NOTION") {
                        if (watch("goalType") === "NUMERIC") setValue("goalType", "NOTION_SYNCED");
                        if (!watch("notionFilter")) setValue("notionFilter", { ...EMPTY_RULE });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOAL_SOURCES.filter((s) => s !== "SYSTEM" || goal?.source === "SYSTEM").map((s) => (
                        <SelectItem key={s} value={s}>
                          {GOAL_SOURCE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={!!errors.startDate}>
              <FieldLabel htmlFor="goal-start">تاريخ البداية</FieldLabel>
              <Input id="goal-start" type="date" {...register("startDate")} />
              <FieldError errors={[errors.startDate]} />
            </Field>
            <Field data-invalid={!!errors.dueDate}>
              <FieldLabel htmlFor="goal-due">تاريخ التسليم</FieldLabel>
              <Input id="goal-due" type="date" {...register("dueDate")} />
              <FieldError errors={[errors.dueDate]} />
            </Field>
          </div>

          {source === "NOTION" && (
            <div className="space-y-3">
              <Field data-invalid={!!errors.notionDataSourceId}>
                <FieldLabel>قاعدة بيانات Notion</FieldLabel>
                <Controller
                  control={control}
                  name="notionDataSourceId"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setValue("notionFilter", { ...EMPTY_RULE });
                      }}
                    >
                      <SelectTrigger className="w-full" aria-invalid={!!errors.notionDataSourceId}>
                        <SelectValue placeholder="اختر القاعدة" />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.length === 0 && (
                          <SelectItem value="__none" disabled>
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
                <FieldError errors={[errors.notionDataSourceId]} />
              </Field>
              <Controller
                control={control}
                name="notionFilter"
                render={({ field }) => (
                  <NotionFilterRuleBuilder
                    value={normalizeRule(field.value)}
                    onChange={field.onChange}
                    source={selectedSource}
                    testPeriod={testPeriod}
                    employeeId={employeeId}
                    target={target}
                    error={errors.notionFilter ? (errors.notionFilter.message ?? "راجع قاعدة الفلترة") : undefined}
                  />
                )}
              />
            </div>
          )}
        </div>
      </details>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          إلغاء
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} {goal ? "حفظ التعديلات" : "إضافة الهدف"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Add / edit a monthly goal (validated with `monthlyGoalSchema`). */
export function GoalForm({
  open,
  onOpenChange,
  planId,
  goal,
  sources,
  testPeriod,
  employeeId,
  dates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  goal?: PlanGoalRow;
  sources: NotionSourceOption[];
  testPeriod: TestPeriod;
  employeeId: string | null;
  /** default start / due dates for new goals (plan month range) */
  dates: { start: string; end: string };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{goal ? "تعديل الهدف" : "إضافة هدف شهري"}</DialogTitle>
          <DialogDescription>{goal ? goal.name : "اكتب اسم الهدف ومستهدفه — باقي الإعدادات تُضبط تلقائيًا."}</DialogDescription>
        </DialogHeader>
        {open && (
          <GoalFormBody planId={planId} goal={goal} sources={sources} testPeriod={testPeriod} employeeId={employeeId} dates={dates} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
