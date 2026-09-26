"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { createTaskAction } from "@/actions/tasks";
import { dailyTaskSchema } from "@/lib/validation";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/labels";
import type { GoalOption } from "@/server/queries/tasks";
import { cn } from "@/lib/utils";

type FormIn = z.input<typeof dailyTaskSchema>;
type FormOut = z.output<typeof dailyTaskSchema>;

const NONE = "__none__";

function defaults(today: string): FormIn {
  return {
    title: "",
    description: "",
    date: today,
    deadline: "",
    target: 0,
    achieved: 0,
    progress: 0,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    monthlyGoalId: "",
    notes: "",
    delayReason: "",
    employeeId: "",
  };
}

/**
 * Compact, always-visible "quick add" for a daily task: only title + date are
 * required. A toggle progressively reveals priority / goal / notes. Keeps
 * itself open and focused after a successful submit for rapid re-entry.
 */
export function QuickAddTask({
  today,
  goals,
  className,
  autoFocus = true,
}: {
  today: string;
  goals: GoalOption[];
  className?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(dailyTaskSchema), defaultValues: defaults(today) });
  const { run, pending } = useServerAction(createTaskAction, {
    successMessage: "تمت إضافة المهمة",
    onSuccess: () => {
      form.reset(defaults(today));
      router.refresh();
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = { ...values, employeeId: null };
    return run(payload).then((r) => {
      if (!r.ok && r.fieldErrors) {
        for (const [k, msgs] of Object.entries(r.fieldErrors)) form.setError(k as keyof FormIn, { message: msgs[0] });
      }
    });
  });

  const err = form.formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className={cn("rounded-xl border bg-card p-3 shadow-[var(--shadow-raised)]", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Field data-invalid={!!err.title} className="flex-1">
          <Input
            {...form.register("title")}
            placeholder="أضف مهمة سريعة… (العنوان)"
            aria-label="عنوان المهمة"
            aria-invalid={!!err.title}
            autoFocus={autoFocus}
            maxLength={200}
          />
          <FieldError errors={[err.title]} />
        </Field>
        <Field data-invalid={!!err.date} className="sm:w-44">
          <Input type="date" {...form.register("date")} aria-label="تاريخ الاستحقاق" aria-invalid={!!err.date} />
          <FieldError errors={[err.date]} />
        </Field>
        <Button type="submit" disabled={pending} className="sm:w-28">
          {pending ? <Spinner /> : <Plus />} إضافة
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        إضافة تفاصيل إضافية {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>

      {expanded && (
        <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
          <Field>
            <FieldLabel>الأولوية</FieldLabel>
            <Controller
              control={form.control}
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
            <FieldLabel>ربط بهدف شهري</FieldLabel>
            <Controller
              control={form.control}
              name="monthlyGoalId"
              render={({ field }) => (
                <Select value={field.value ? String(field.value) : NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>بدون ربط</SelectItem>
                    {goals.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field className="sm:col-span-1">
            <FieldLabel>ملاحظات</FieldLabel>
            <Textarea rows={1} maxLength={2000} {...form.register("notes")} />
          </Field>
        </div>
      )}
    </form>
  );
}
