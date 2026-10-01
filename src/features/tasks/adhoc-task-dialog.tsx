"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { createAdHocAction, updateAdHocAction } from "@/actions/tasks";
import { adHocTaskSchema } from "@/lib/validation";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/labels";
import type { AdHocTaskRow, EmployeeOption } from "@/server/queries/tasks";
import type { ActionResult } from "@/server/action";

type FormIn = z.input<typeof adHocTaskSchema>;
type FormOut = z.output<typeof adHocTaskSchema>;

const NONE = "__none__";

function defaults(today: string, task?: AdHocTaskRow): FormIn {
  return task
    ? {
        employeeId: task.employeeId,
        title: task.title,
        description: task.description ?? "",
        assignedDate: task.assignedDate,
        dueDate: task.dueDate ?? "",
        priority: task.priority,
        includeInEvaluation: task.includeInEvaluation,
        weight: task.weight,
        isOutOfPlan: task.isOutOfPlan,
        compensatesGoalId: task.compensatesGoalId ?? "",
        notes: task.notes ?? "",
      }
    : {
        employeeId: "",
        title: "",
        description: "",
        assignedDate: today,
        dueDate: "",
        priority: "MEDIUM",
        includeInEvaluation: true,
        weight: 0,
        isOutOfPlan: true,
        compensatesGoalId: "",
        notes: "",
      };
}

/**
 * Create / edit an ad-hoc assignment. With `autoOpenParam` the create dialog
 * opens automatically when the URL contains `?new=1` (dashboard shortcut).
 */
export function AdHocTaskDialog({
  today,
  employees,
  task,
  open: openProp,
  onOpenChange,
  autoOpenParam = false,
  fromNote,
}: {
  today: string;
  employees: EmployeeOption[];
  task?: AdHocTaskRow;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  autoOpenParam?: boolean;
  /** «اعتماد وتحويل إلى مهمة»: prefilled from a reminder note; the task is created only on confirm */
  fromNote?: {
    initial: Partial<FormIn>;
    submit: (payload: FormOut) => Promise<ActionResult<unknown>>;
    /** a self-task from one's own note: employee fixed, not part of the evaluation */
    selfOnly?: boolean;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [innerOpen, setInnerOpen] = useState(() => autoOpenParam && params.get("new") === "1");
  const open = openProp ?? innerOpen;

  const clearNewParam = () => {
    if (!autoOpenParam || params.get("new") !== "1") return;
    const next = new URLSearchParams(params.toString());
    next.delete("new");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setInnerOpen(o);
    if (!o) clearNewParam();
  };

  // re-open when `?new=1` appears while already on the page (e.g. dashboard shortcut) — adjusted during render
  const wantsNew = autoOpenParam && params.get("new") === "1" && openProp === undefined;
  const [seenNew, setSeenNew] = useState(wantsNew);
  if (wantsNew !== seenNew) {
    setSeenNew(wantsNew);
    if (wantsNew) setInnerOpen(true);
  }

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(adHocTaskSchema), defaultValues: defaults(today, task) });
  const create = useServerAction(createAdHocAction, { onSuccess: () => done() });
  const update = useServerAction(updateAdHocAction, { onSuccess: () => done() });
  const fromNotePending = useServerActionShim();
  const pending = create.pending || update.pending || fromNotePending.pending;

  useEffect(() => {
    if (open) form.reset({ ...defaults(today, task), ...(fromNote?.initial ?? {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function done() {
    setOpen(false);
    router.refresh();
  }

  const employeeId = useWatch({ control: form.control, name: "employeeId" });
  const compensates = useWatch({ control: form.control, name: "compensatesGoalId" });
  const [wantsCompensation, setWantsCompensation] = useState(!!task?.compensatesGoalId);
  // reset the compensation switch each time the dialog opens — adjusted during render
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setWantsCompensation(!!task?.compensatesGoalId);
  }

  const employeeGoals = employees.find((e) => e.id === employeeId)?.goals ?? [];
  const goalOptions =
    task?.compensatesGoalId && task.compensatesGoalName && !employeeGoals.some((g) => g.id === task.compensatesGoalId) && employeeId === task.employeeId
      ? [{ id: task.compensatesGoalId, name: task.compensatesGoalName, unit: "" }, ...employeeGoals]
      : employeeGoals;

  const onSubmit = form.handleSubmit((values) => {
    const payload = { ...values, compensatesGoalId: wantsCompensation ? values.compensatesGoalId : null };
    const run = fromNote ? fromNotePending.wrap(() => fromNote.submit(payload), done) : task ? update.run(task.id, payload) : create.run(payload);
    return run.then((r) => {
      if (!r.ok && r.fieldErrors) {
        for (const [k, msgs] of Object.entries(r.fieldErrors)) form.setError(k as keyof FormIn, { message: msgs[0] });
      }
    });
  });

  const err = form.formState.errors;

  return (
    <>
      {openProp === undefined && !fromNote && (
        <Button size="lg" onClick={() => setOpen(true)}>
          <Plus /> تكليف جديد
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{fromNote ? "اعتماد وتحويل إلى مهمة" : task ? "تعديل التكليف" : "تكليف مستجد"}</DialogTitle>
            <DialogDescription>
              {fromNote ? "راجع التفاصيل ثم أكّد. لن تُنشأ المهمة إلا بعد التأكيد." : "مهمة خارج التوزيع الأصلي تُرسل للموظف مع إشعار، ويمكن احتسابها في تقييم الشهر."}
            </DialogDescription>
          </DialogHeader>
          <form id="adhoc-form" onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field data-invalid={!!err.employeeId}>
              <FieldLabel>الموظف</FieldLabel>
              <Controller
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue("compensatesGoalId", "");
                    }}
                    disabled={!!task || !!fromNote?.selfOnly}
                  >
                    <SelectTrigger className="w-full" aria-invalid={!!err.employeeId}>
                      <SelectValue placeholder="اختر الموظف" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[err.employeeId?.message ? { message: "اختر الموظف" } : undefined]} />
            </Field>
            <Field data-invalid={!!err.title}>
              <FieldLabel htmlFor="ah-title">عنوان التكليف</FieldLabel>
              <Input id="ah-title" maxLength={200} {...form.register("title")} aria-invalid={!!err.title} />
              <FieldError errors={[err.title]} />
            </Field>
            <Field data-invalid={!!err.description}>
              <FieldLabel htmlFor="ah-desc">الوصف والتفاصيل</FieldLabel>
              <Textarea id="ah-desc" rows={3} maxLength={2000} {...form.register("description")} />
              <FieldError errors={[err.description]} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={!!err.assignedDate}>
                <FieldLabel htmlFor="ah-assigned">تاريخ التكليف</FieldLabel>
                <Input id="ah-assigned" type="date" {...form.register("assignedDate")} />
                <FieldError errors={[err.assignedDate]} />
              </Field>
              <Field data-invalid={!!err.dueDate}>
                <FieldLabel htmlFor="ah-due">موعد التسليم</FieldLabel>
                <Input id="ah-due" type="date" {...form.register("dueDate")} />
                <FieldError errors={[err.dueDate]} />
              </Field>
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
            </div>

            {!fromNote?.selfOnly && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <Controller
                control={form.control}
                name="includeInEvaluation"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch id="ah-eval" checked={!!field.value} onCheckedChange={field.onChange} />
                    <FieldLabel htmlFor="ah-eval" className="font-normal">
                      يدخل في تقييم الشهر؟
                    </FieldLabel>
                  </Field>
                )}
              />
              <Field data-invalid={!!err.weight} className="sm:max-w-48">
                <FieldLabel htmlFor="ah-weight">الوزن داخل «المهام المستجدة» %</FieldLabel>
                <Input id="ah-weight" type="number" min={0} max={100} step="any" {...form.register("weight")} />
                <p className="text-xs text-muted-foreground">تظهر في الواجب الرابع للتقييم الرسمي؛ مجموع أوزان مهام الشهر = 100%.</p>
                <FieldError errors={[err.weight]} />
              </Field>
              <Controller
                control={form.control}
                name="isOutOfPlan"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch id="ah-oop" checked={!!field.value} onCheckedChange={field.onChange} />
                    <FieldLabel htmlFor="ah-oop" className="font-normal">
                      خارج الخطة الأصلية؟
                    </FieldLabel>
                  </Field>
                )}
              />
              <Field orientation="horizontal">
                <Switch id="ah-comp" checked={wantsCompensation} onCheckedChange={setWantsCompensation} />
                <FieldLabel htmlFor="ah-comp" className="font-normal">
                  يعوض هدفًا آخر؟
                </FieldLabel>
              </Field>
              {wantsCompensation && (
                <Field data-invalid={!!err.compensatesGoalId}>
                  <FieldLabel>الهدف المعوَّض</FieldLabel>
                  <Select value={compensates ? String(compensates) : NONE} onValueChange={(v) => form.setValue("compensatesGoalId", v === NONE ? "" : v)} disabled={!employeeId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{employeeId ? "اختر هدفًا" : "اختر الموظف أولًا"}</SelectItem>
                      {goalOptions.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {employeeId && goalOptions.length === 0 && <FieldDescription>لا توجد أهداف لهذا الموظف في الشهر الحالي.</FieldDescription>}
                  <FieldError errors={[err.compensatesGoalId]} />
                </Field>
              )}
            </div>
            )}

            <Field data-invalid={!!err.notes}>
              <FieldLabel htmlFor="ah-notes">ملاحظات</FieldLabel>
              <Textarea id="ah-notes" rows={2} maxLength={2000} {...form.register("notes")} />
              <FieldError errors={[err.notes]} />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button type="submit" form="adhoc-form" disabled={pending}>
              {pending && <Spinner />} {fromNote ? "تأكيد وإنشاء المهمة" : task ? "حفظ التعديلات" : "إرسال التكليف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pending state + toasts for the note-conversion submit, mirroring useServerAction. */
function useServerActionShim() {
  const [pending, setPending] = useState(false);
  const wrap = async (fn: () => Promise<ActionResult<unknown>>, onSuccess: () => void) => {
    setPending(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "تم الحفظ بنجاح");
        onSuccess();
      } else toast.error(r.error);
      return r;
    } catch {
      toast.error("تعذر الاتصال بالخادم");
      return { ok: false, error: "تعذر الاتصال بالخادم" } as ActionResult<unknown>;
    } finally {
      setPending(false);
    }
  };
  return { pending, wrap };
}
