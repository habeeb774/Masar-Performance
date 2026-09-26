"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { createTaskAction, updateTaskAction } from "@/actions/tasks";
import { dailyTaskSchema } from "@/lib/validation";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/labels";
import type { DailyTaskRow, GoalOption } from "@/server/queries/tasks";

type FormIn = z.input<typeof dailyTaskSchema>;
type FormOut = z.output<typeof dailyTaskSchema>;

const NONE = "__none__";

function defaults(today: string, task?: DailyTaskRow): FormIn {
  return task
    ? {
        title: task.title,
        description: task.description ?? "",
        date: task.date,
        deadline: task.deadline ?? "",
        target: task.target,
        achieved: task.achieved,
        progress: task.progress,
        status: task.status,
        priority: task.priority,
        monthlyGoalId: task.monthlyGoalId ?? "",
        notes: task.notes ?? "",
        delayReason: task.delayReason ?? "",
        employeeId: task.employeeId,
      }
    : {
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
 * Create / edit a MANUAL daily task. Controlled (`open`/`onOpenChange`) when
 * editing from a row; otherwise renders its own trigger button.
 */
export function ManualTaskDialog({
  today,
  goals,
  task,
  open: openProp,
  onOpenChange,
  trigger,
}: {
  today: string;
  goals: GoalOption[];
  task?: DailyTaskRow;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setInnerOpen(o);
  };

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(dailyTaskSchema), defaultValues: defaults(today, task) });
  const create = useServerAction(createTaskAction, { onSuccess: () => done() });
  const update = useServerAction(updateTaskAction, { onSuccess: () => done() });
  const pending = create.pending || update.pending;

  useEffect(() => {
    if (open) form.reset(defaults(today, task));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function done() {
    setOpen(false);
    router.refresh();
  }

  const onSubmit = form.handleSubmit((values) => {
    const payload = { ...values, employeeId: task?.employeeId ?? null };
    return (task ? update.run(task.id, payload) : create.run(payload)).then((r) => {
      if (!r.ok && r.fieldErrors) {
        for (const [k, msgs] of Object.entries(r.fieldErrors)) form.setError(k as keyof FormIn, { message: msgs[0] });
      }
    });
  });

  const err = form.formState.errors;
  // show goals of the current month; keep the linked goal visible when editing an older task
  const goalOptions = task?.monthlyGoalId && !goals.some((g) => g.id === task.monthlyGoalId) && task.goalName
    ? [{ id: task.monthlyGoalId, name: task.goalName, unit: task.unit ?? "" }, ...goals]
    : goals;

  return (
    <>
      {openProp === undefined && (
        <span onClick={() => setOpen(true)} className="contents">
          {trigger ?? <Button>+ مهمة يدوية</Button>}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{task ? "تعديل المهمة" : "مهمة يدوية جديدة"}</DialogTitle>
            <DialogDescription>المهام اليدوية تظهر في تقريرك الأسبوعي، ويمكن ربطها بأحد أهداف الشهر.</DialogDescription>
          </DialogHeader>
          <form id="manual-task-form" onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field data-invalid={!!err.title}>
              <FieldLabel htmlFor="mt-title">عنوان المهمة</FieldLabel>
              <Input id="mt-title" {...form.register("title")} aria-invalid={!!err.title} autoFocus maxLength={200} />
              <FieldError errors={[err.title]} />
            </Field>
            <Field data-invalid={!!err.description}>
              <FieldLabel htmlFor="mt-desc">الوصف</FieldLabel>
              <Textarea id="mt-desc" rows={2} maxLength={2000} {...form.register("description")} />
              <FieldError errors={[err.description]} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!err.date}>
                <FieldLabel htmlFor="mt-date">التاريخ</FieldLabel>
                <Input id="mt-date" type="date" {...form.register("date")} aria-invalid={!!err.date} />
                <FieldError errors={[err.date]} />
              </Field>
              <Field data-invalid={!!err.deadline}>
                <FieldLabel htmlFor="mt-deadline">الموعد النهائي (اختياري)</FieldLabel>
                <Input id="mt-deadline" type="date" {...form.register("deadline")} />
                <FieldError errors={[err.deadline]} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!err.priority}>
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
              <Field data-invalid={!!err.target}>
                <FieldLabel htmlFor="mt-target">المستهدف (عدد)</FieldLabel>
                <Input id="mt-target" type="number" min={0} step="any" {...form.register("target")} />
                <FieldError errors={[err.target]} />
              </Field>
            </div>
            <Field data-invalid={!!err.monthlyGoalId}>
              <FieldLabel>ربط بهدف شهري (اختياري)</FieldLabel>
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
                      {goalOptions.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {goalOptions.length === 0 && <p className="text-xs text-muted-foreground">لا توجد أهداف لهذا الشهر بعد.</p>}
              <FieldError errors={[err.monthlyGoalId]} />
            </Field>
            <Field data-invalid={!!err.notes}>
              <FieldLabel htmlFor="mt-notes">ملاحظات</FieldLabel>
              <Textarea id="mt-notes" rows={2} maxLength={2000} {...form.register("notes")} />
              <FieldError errors={[err.notes]} />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button type="submit" form="manual-task-form" disabled={pending}>
              {pending && <Spinner />} {task ? "حفظ التعديلات" : "إضافة المهمة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
