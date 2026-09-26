"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { saveCompanyAction } from "@/actions/org";
import { companySchema } from "@/lib/validation";
import { AR_DAY_NAMES } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Input_ = z.input<typeof companySchema>;
type Output = z.output<typeof companySchema>;

const TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Riyadh", label: "الرياض (GMT+3)" },
  { value: "Asia/Kuwait", label: "الكويت (GMT+3)" },
  { value: "Asia/Qatar", label: "الدوحة (GMT+3)" },
  { value: "Asia/Bahrain", label: "المنامة (GMT+3)" },
  { value: "Asia/Baghdad", label: "بغداد (GMT+3)" },
  { value: "Asia/Dubai", label: "دبي (GMT+4)" },
  { value: "Asia/Muscat", label: "مسقط (GMT+4)" },
  { value: "Africa/Cairo", label: "القاهرة" },
  { value: "Asia/Amman", label: "عمّان" },
  { value: "Europe/Istanbul", label: "إسطنبول (GMT+3)" },
  { value: "Africa/Casablanca", label: "الدار البيضاء" },
  { value: "Europe/London", label: "لندن" },
  { value: "UTC", label: "التوقيت العالمي UTC" },
];

/** Saudi week order (Saturday first) for the work day checkboxes. */
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function CompanyForm({ initial }: { initial: Output }) {
  const router = useRouter();
  const form = useForm<Input_, unknown, Output>({ resolver: zodResolver(companySchema), defaultValues: initial });
  const { errors } = form.formState;
  const { run, pending } = useServerAction(saveCompanyAction, {
    onSuccess: () => router.refresh(),
  });
  const timezones = TIMEZONES.some((t) => t.value === initial.timezone) ? TIMEZONES : [{ value: initial.timezone, label: initial.timezone }, ...TIMEZONES];

  const onSubmit = form.handleSubmit((values) =>
    run(values).then((r) => {
      if (r.ok) form.reset(values);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الهوية</CardTitle>
            <CardDescription>الاسم الذي يظهر في التقارير والواجهة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">اسم الشركة / المتجر</FieldLabel>
              <Input id="name" {...form.register("name")} aria-invalid={!!errors.name} maxLength={200} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.legalName}>
              <FieldLabel htmlFor="legalName">الاسم القانوني (اختياري)</FieldLabel>
              <Input id="legalName" {...form.register("legalName")} maxLength={200} />
              <FieldError errors={[errors.legalName]} />
            </Field>
            <Field data-invalid={!!errors.timezone}>
              <FieldLabel>المنطقة الزمنية</FieldLabel>
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <Select value={String(field.value ?? "")} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>تحدد «اليوم الحالي» في الخطط والمهام والتذكيرات.</FieldDescription>
              <FieldError errors={[errors.timezone]} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">أسبوع العمل</CardTitle>
            <CardDescription>يُستخدم في تقسيم الشهر إلى أسابيع وتوزيع الأهداف على أيام العمل</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field data-invalid={!!errors.weekStartDay}>
              <FieldLabel>أول يوم في الأسبوع</FieldLabel>
              <Controller
                control={form.control}
                name="weekStartDay"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_ORDER.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {AR_DAY_NAMES[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.weekStartDay]} />
            </Field>
            <Field data-invalid={!!errors.workDays}>
              <FieldLabel>أيام العمل</FieldLabel>
              <Controller
                control={form.control}
                name="workDays"
                render={({ field }) => {
                  const selected = new Set((field.value as number[] | undefined)?.map(Number) ?? []);
                  const toggle = (d: number, on: boolean) => {
                    const next = new Set(selected);
                    if (on) next.add(d);
                    else next.delete(d);
                    field.onChange(DAY_ORDER.filter((x) => next.has(x)));
                  };
                  return (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {DAY_ORDER.map((d) => (
                        <label
                          key={d}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                            selected.has(d) ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50",
                          )}
                        >
                          <Checkbox checked={selected.has(d)} onCheckedChange={(v) => toggle(d, v === true)} />
                          {AR_DAY_NAMES[d]}
                        </label>
                      ))}
                    </div>
                  );
                }}
              />
              <FieldError errors={[errors.workDays]} />
            </Field>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">مواعيد التسليم</CardTitle>
            <CardDescription>تُستخدم في مؤشرات الالتزام والتذكيرات الآلية</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={!!errors.planSubmissionDeadlineDay}>
              <FieldLabel htmlFor="planDeadline">آخر يوم لتسليم خطة الشهر</FieldLabel>
              <Input id="planDeadline" type="number" min={1} max={28} inputMode="numeric" {...form.register("planSubmissionDeadlineDay")} className="max-w-40" />
              <FieldDescription>
                رقم اليوم من الشهر (1–28). يُستخدم في مؤشر «تسليم خطة الشهر في الموعد»: كل يوم تأخير بعد هذا اليوم يُحتسب في درجة الالتزام.
              </FieldDescription>
              <FieldError errors={[errors.planSubmissionDeadlineDay]} />
            </Field>
            <Field data-invalid={!!errors.weeklyReportDueDays}>
              <FieldLabel htmlFor="weeklyDue">مهلة تسليم التقرير الأسبوعي (بالأيام)</FieldLabel>
              <Input id="weeklyDue" type="number" min={0} max={7} inputMode="numeric" {...form.register("weeklyReportDueDays")} className="max-w-40" />
              <FieldDescription>عدد الأيام المسموح بها بعد نهاية الأسبوع لإرسال التقرير الأسبوعي (0 = في آخر يوم من الأسبوع).</FieldDescription>
              <FieldError errors={[errors.weeklyReportDueDays]} />
            </Field>
          </CardContent>
          <CardFooter className="flex-wrap justify-end gap-2 border-t">
            <Button type="button" variant="outline" disabled={pending || !form.formState.isDirty} onClick={() => form.reset(initial)}>
              تراجع
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : <Save />} حفظ الإعدادات
            </Button>
          </CardFooter>
        </Card>
      </div>
    </form>
  );
}
