"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Check, Copy, KeyRound, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { saveEmployeeAction } from "@/actions/org";
import { employeeSchema } from "@/lib/validation";
import type { EmployeeFormOptions, EmployeeRow } from "@/server/queries/performance";
import { EMPLOYEE_STATUS_OPTIONS } from "./constants";

type Values = z.input<typeof employeeSchema>;

const NONE = "__none";

/** Shows a one-time password with a copy button. */
export function PasswordReveal({ password, title, onClose }: { password: string | null; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={!!password} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>انسخ كلمة المرور الآن وأرسلها للموظف بطريقة آمنة — لن تظهر مرة أخرى.</DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertTitle>كلمة المرور</AlertTitle>
          <AlertDescription>
            <div className="mt-1 flex items-center gap-2">
              <code dir="ltr" className="flex-1 rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm select-all">
                {password}
              </code>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="نسخ"
                onClick={() => {
                  if (!password) return;
                  navigator.clipboard?.writeText(password).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button onClick={onClose}>تم</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toValues(e: EmployeeRow | null): Values {
  return {
    fullName: e?.fullName ?? "",
    email: e?.email ?? "",
    employeeNo: e?.employeeNo ?? "",
    phone: e?.phone ?? "",
    roleId: e?.roleId ?? "",
    departmentId: e?.departmentId ?? "",
    jobTitleId: e?.jobTitleId ?? "",
    managerId: e?.managerId ?? "",
    hireDate: e?.hireDate ?? "",
    status: e?.status ?? "ACTIVE",
    notionUserId: e?.notionUserId ?? "",
    notionAlias: e?.notionAlias ?? "",
    password: "",
  };
}

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  options,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: EmployeeRow | null;
  options: EmployeeFormOptions;
}) {
  const router = useRouter();
  const [generated, setGenerated] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(employeeSchema), defaultValues: toValues(employee) });
  const { run, pending } = useServerAction(saveEmployeeAction, {
    onSuccess: (data) => {
      onOpenChange(false);
      if (data?.generatedPassword) setGenerated(data.generatedPassword);
      router.refresh();
    },
  });
  useEffect(() => {
    if (open) form.reset(toValues(employee));
    // reset only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const errors = form.formState.errors;
  const managers = options.employees.filter((o) => o.value !== employee?.id);

  const selectField = (name: "roleId" | "departmentId" | "jobTitleId" | "managerId", label: string, items: { value: string; label: string }[], allowNone: boolean) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Select value={(field.value as string) || (allowNone ? NONE : undefined)} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
            <SelectTrigger id={name} className="w-full" aria-invalid={fieldState.invalid}>
              <SelectValue placeholder="اختر…" />
            </SelectTrigger>
            <SelectContent>
              {allowNone && <SelectItem value={NONE}>— بدون —</SelectItem>}
              {items.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{employee ? `تعديل بيانات ${employee.fullName}` : "إضافة موظف جديد"}</DialogTitle>
            <DialogDescription>يُنشأ حساب دخول للموظف بالبريد الإلكتروني والدور المحدد.</DialogDescription>
          </DialogHeader>
          <form id="employee-form" onSubmit={form.handleSubmit((values) => run(employee?.id ?? null, values))} noValidate>
            <FieldGroup className="gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.fullName}>
                  <FieldLabel htmlFor="fullName">الاسم الكامل</FieldLabel>
                  <Input id="fullName" autoFocus {...form.register("fullName")} aria-invalid={!!errors.fullName} />
                  <FieldError errors={[errors.fullName]} />
                </Field>
                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="email">البريد الإلكتروني</FieldLabel>
                  <Input id="email" type="email" dir="ltr" {...form.register("email")} aria-invalid={!!errors.email} />
                  <FieldError errors={[errors.email]} />
                </Field>
                <Field data-invalid={!!errors.employeeNo}>
                  <FieldLabel htmlFor="employeeNo">الرقم الوظيفي</FieldLabel>
                  <Input id="employeeNo" dir="ltr" {...form.register("employeeNo")} />
                  <FieldError errors={[errors.employeeNo]} />
                </Field>
                <Field data-invalid={!!errors.phone}>
                  <FieldLabel htmlFor="phone">الجوال</FieldLabel>
                  <Input id="phone" dir="ltr" inputMode="tel" {...form.register("phone")} />
                  <FieldError errors={[errors.phone]} />
                </Field>
                {selectField("roleId", "الدور والصلاحيات", options.roles, false)}
                {selectField("departmentId", "الإدارة / القسم", options.departments, true)}
                {selectField("jobTitleId", "المسمى الوظيفي", options.jobTitles, true)}
                {selectField("managerId", "المدير المباشر", managers, true)}
                <Field data-invalid={!!errors.hireDate}>
                  <FieldLabel htmlFor="hireDate">تاريخ التعيين</FieldLabel>
                  <Input id="hireDate" type="date" {...form.register("hireDate")} />
                  <FieldError errors={[errors.hireDate]} />
                </Field>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="status">الحالة</FieldLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EMPLOYEE_STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.value === "TERMINATED" && <FieldDescription>سيتم إيقاف حساب الدخول وإنهاء الجلسات المفتوحة.</FieldDescription>}
                    </Field>
                  )}
                />
              </div>

              <FieldSet className="rounded-lg border p-3">
                <FieldLegend variant="label">هوية الموظف في Notion</FieldLegend>
                <FieldDescription>تُستخدم لنسب عناصر Notion المتزامنة (المنتجات، المحتوى…) لهذا الموظف تلقائيًا عند حساب الإنجاز والجودة.</FieldDescription>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors.notionUserId}>
                    <FieldLabel htmlFor="notionUserId">معرّف مستخدم Notion</FieldLabel>
                    <Input id="notionUserId" dir="ltr" placeholder="مثال: 1a2b3c4d-…" {...form.register("notionUserId")} />
                    <FieldDescription>لمطابقة حقول الأشخاص (People / Created by).</FieldDescription>
                    <FieldError errors={[errors.notionUserId]} />
                  </Field>
                  <Field data-invalid={!!errors.notionAlias}>
                    <FieldLabel htmlFor="notionAlias">الاسم المستعار في Notion</FieldLabel>
                    <Input id="notionAlias" {...form.register("notionAlias")} />
                    <FieldDescription>لمطابقة الحقول النصية أو الاختيارية التي تحمل اسم الموظف.</FieldDescription>
                    <FieldError errors={[errors.notionAlias]} />
                  </Field>
                </div>
              </FieldSet>

              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">{employee ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور (اختياري)"}</FieldLabel>
                <Input id="password" type="password" dir="ltr" autoComplete="new-password" {...form.register("password")} aria-invalid={!!errors.password} />
                <FieldDescription>
                  {employee ? "اتركها فارغة للإبقاء على كلمة المرور الحالية." : "إذا تركتها فارغة سيتم توليد كلمة مرور قوية وعرضها مرة واحدة."} 10 أحرف على الأقل وتحتوي أحرفًا وأرقامًا.
                </FieldDescription>
                <FieldError errors={[errors.password]} />
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button type="submit" form="employee-form" disabled={pending}>
              {pending ? <Spinner /> : <Save />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PasswordReveal password={generated} title="تم إنشاء حساب الموظف" onClose={() => setGenerated(null)} />
    </>
  );
}
