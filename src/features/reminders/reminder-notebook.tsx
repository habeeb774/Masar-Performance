"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlarmClock, BellRing, CalendarClock, CheckCircle2, ChevronDown, Pencil, Plus, Star, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { cancelReminderAction, convertReminderAction, createReminderAction, rescheduleReminderAction, updateReminderAction } from "@/actions/reminders";
import { AdHocTaskDialog } from "@/features/tasks/adhoc-task-dialog";
import type { ReminderRow, getReminders } from "@/server/queries/reminders";
import type { EmployeeOption } from "@/server/queries/tasks";
import { formatDateAr } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof getReminders>>;
const NONE = "__none__";

function addDays(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add / edit: title, details, date — employee and «مهم» tucked under «المزيد». */
function ReminderForm({
  open,
  onOpenChange,
  today,
  employees,
  canLink,
  reminder,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  today: string;
  employees: EmployeeOption[];
  canLink: boolean;
  reminder?: ReminderRow;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [details, setDetails] = useState(reminder?.details ?? "");
  const [remindOn, setRemindOn] = useState(reminder?.remindOn ?? addDays(today, 1));
  const [employeeId, setEmployeeId] = useState(reminder?.employeeId ?? "");
  const [important, setImportant] = useState(reminder?.priority === "IMPORTANT");
  const [more, setMore] = useState(!!(reminder?.employeeId || reminder?.priority === "IMPORTANT"));
  const done = () => {
    onOpenChange(false);
    router.refresh();
  };
  const create = useServerAction(createReminderAction, { onSuccess: done });
  const update = useServerAction(updateReminderAction, { onSuccess: done });
  const pending = create.pending || update.pending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { title, details, remindOn, priority: important ? ("IMPORTANT" as const) : ("NORMAL" as const), employeeId: employeeId || null };
    void (reminder ? update.run(reminder.id, input) : create.run(input));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reminder ? "تعديل الملاحظة" : "ملاحظة جديدة"}</DialogTitle>
          <DialogDescription>تبقى مجرد تذكير حتى تعتمدها وتحوّلها إلى مهمة.</DialogDescription>
        </DialogHeader>
        <form id="reminder-form" onSubmit={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="rm-title">العنوان</FieldLabel>
            <Input id="rm-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required minLength={2} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="rm-details">التفاصيل</FieldLabel>
            <Textarea id="rm-details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rm-date">ذكرني بتاريخ</FieldLabel>
            <Input id="rm-date" type="date" value={remindOn} onChange={(e) => setRemindOn(e.target.value)} required />
          </Field>
          {more ? (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
              {canLink && employees.length > 0 && (
                <Field>
                  <FieldLabel>الموظف المرتبط (اختياري)</FieldLabel>
                  <Select value={employeeId || NONE} onValueChange={(v) => setEmployeeId(v === NONE ? "" : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>بدون</SelectItem>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field orientation="horizontal">
                <Switch id="rm-important" checked={important} onCheckedChange={setImportant} />
                <FieldLabel htmlFor="rm-important" className="font-normal">
                  مهم
                </FieldLabel>
              </Field>
            </div>
          ) : (
            <button type="button" onClick={() => setMore(true)} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              المزيد (موظف مرتبط، الأولوية)
            </button>
          )}
        </form>
        <DialogFooter>
          <Button type="submit" form="reminder-form" disabled={pending || title.trim().length < 2 || !remindOn}>
            {pending && <Spinner />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «تأجيل» / «ذكرني مرة أخرى»: quick picks or any date. */
function RescheduleDialog({ reminder, today, open, onOpenChange }: { reminder: ReminderRow; today: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [date, setDate] = useState(addDays(today, 1));
  const action = useServerAction(rescheduleReminderAction, {
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  const picks = [
    ["غدًا", addDays(today, 1)],
    ["بعد 3 أيام", addDays(today, 3)],
    ["الأسبوع القادم", addDays(today, 7)],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>ذكرني مرة أخرى</DialogTitle>
          <DialogDescription className="truncate">{reminder.title}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {picks.map(([label, d]) => (
            <Button key={label} type="button" variant={date === d ? "default" : "outline"} size="sm" onClick={() => setDate(d)}>
              {label}
            </Button>
          ))}
        </div>
        <Field>
          <FieldLabel htmlFor={`rs-${reminder.id}`}>أو اختر تاريخًا</FieldLabel>
          <Input id={`rs-${reminder.id}`} type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button onClick={() => void action.run(reminder.id, date)} disabled={action.pending || !date}>
            {action.pending && <Spinner />} حفظ الموعد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderItem({
  r,
  today,
  overdue,
  employees,
  canAssign,
  selfEmployeeId,
}: {
  r: ReminderRow;
  today: string;
  overdue?: boolean;
  employees: EmployeeOption[];
  canAssign: boolean;
  selfEmployeeId: string | null;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [later, setLater] = useState(false);
  const [convert, setConvert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cancel = useServerAction(cancelReminderAction, { onSuccess: () => router.refresh() });
  // self-task from one's own note when the user cannot assign tasks to others
  const selfOnly = !canAssign;
  const canConvert = canAssign || (r.mine && !!selfEmployeeId);
  const taskEmployees = selfOnly ? employees.filter((e) => e.id === selfEmployeeId) : employees;

  return (
    <li className="group rounded-xl border bg-card p-4 transition-colors hover:bg-accent/20">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", overdue ? "bg-warning-soft text-warning" : "bg-primary/10 text-primary")}>
          {overdue ? <AlarmClock className="size-4" /> : <BellRing className="size-4" />}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-semibold break-words">{r.title}</p>
            {r.priority === "IMPORTANT" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                <Star className="size-3.5 fill-current" /> مهم
              </span>
            )}
          </div>
          {r.details && <p className="text-sm whitespace-pre-line text-muted-foreground">{r.details}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-warning")}>
              <CalendarClock className="size-3.5" /> تذكير: {formatDateAr(r.remindOn)}
            </span>
            {r.employeeName && (
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3.5" /> {r.employeeName}
              </span>
            )}
            {!r.mine && <span>من {r.ownerName}</span>}
            <span>لم يتم اعتمادها بعد</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        {canConvert && (
          <Button size="sm" onClick={() => setConvert(true)}>
            <CheckCircle2 /> اعتماد وتحويل إلى مهمة
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setLater(true)}>
          <CalendarClock /> {overdue ? "ذكرني مرة أخرى" : "تأجيل"}
        </Button>
        <div className="ms-auto flex gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="تعديل" onClick={() => setEdit(true)}>
            <Pencil />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="حذف" onClick={() => setConfirmDelete(true)} disabled={cancel.pending}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {edit && <ReminderForm open={edit} onOpenChange={setEdit} today={today} employees={employees} canLink={canAssign} reminder={r} />}
      <RescheduleDialog reminder={r} today={today} open={later} onOpenChange={setLater} />
      {canConvert && convert && (
        <AdHocTaskDialog
          today={today}
          employees={taskEmployees}
          open={convert}
          onOpenChange={setConvert}
          fromNote={{
            selfOnly,
            initial: {
              title: r.title,
              description: r.details ?? "",
              employeeId: selfOnly ? (selfEmployeeId ?? "") : (r.employeeId ?? ""),
              assignedDate: r.remindOn < today ? today : r.remindOn,
              dueDate: r.remindOn < today ? "" : r.remindOn,
              priority: r.priority === "IMPORTANT" ? "HIGH" : "MEDIUM",
              ...(selfOnly ? { includeInEvaluation: false, weight: 0 } : {}),
            },
            submit: (payload) => convertReminderAction(r.id, payload),
          }}
        />
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الملاحظة؟</AlertDialogTitle>
            <AlertDialogDescription>«{r.title}» ستُزال من دفتر التذكيرات.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cancel.run(r.id)}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function Group({ title, items, hint, ...rest }: { title: string; items: ReminderRow[]; hint?: React.ReactNode } & Omit<React.ComponentProps<typeof ReminderItem>, "r">) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {title} <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">{items.length}</span>
      </h2>
      {hint}
      <ul className="space-y-2">
        {items.map((r) => (
          <ReminderItem key={r.id} r={r} {...rest} />
        ))}
      </ul>
    </section>
  );
}

export function ReminderNotebook({ data, employees, canAssign, selfEmployeeId }: { data: Data; employees: EmployeeOption[]; canAssign: boolean; selfEmployeeId: string | null }) {
  const [adding, setAdding] = useState(false);
  const common = { today: data.today, employees, canAssign, selfEmployeeId };
  const empty = data.overdue.length + data.today_.length + data.thisWeek.length + data.later.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button size="lg" onClick={() => setAdding(true)}>
        <Plus /> ملاحظة جديدة
      </Button>
      {adding && <ReminderForm open={adding} onOpenChange={setAdding} today={data.today} employees={employees} canLink={canAssign} />}

      {empty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <BellRing className="size-8 text-muted-foreground" />
            <p className="font-semibold">لا توجد تذكيرات مفتوحة</p>
            <p className="text-sm text-muted-foreground">سجّل فكرة أو مهمة مقترحة، وسنذكّرك بها في موعدها.</p>
          </CardContent>
        </Card>
      )}

      <Group
        title="تذكيرات متأخرة"
        items={data.overdue}
        overdue
        hint={<p className="text-xs text-warning">مرّ موعد هذه التذكيرات. اعتمدها أو اختر موعدًا جديدًا — لا تُحسب ضمن المهام المتأخرة.</p>}
        {...common}
      />
      <Group title="اليوم" items={data.today_} {...common} />
      <Group title="هذا الأسبوع" items={data.thisWeek} {...common} />
      <Group title="لاحقًا" items={data.later} {...common} />

      {data.approved.length > 0 && (
        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
            تم اعتمادها
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y border-t">
            {data.approved.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  <span className="truncate">{r.title}</span>
                </span>
                {r.taskId && (
                  <Link href={r.mine && !canAssign ? "/my-tasks" : "/tasks"} className="text-xs text-primary hover:underline">
                    المهمة: {r.taskTitle}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
