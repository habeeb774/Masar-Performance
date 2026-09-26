"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Check, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { useServerAction } from "@/hooks/use-server-action";
import { setupSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { completeSetupAction } from "./actions";

type Values = z.input<typeof setupSchema>;

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-1.5", ok ? "text-success" : "text-muted-foreground")}>
      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {children}
    </li>
  );
}

export function SetupForm() {
  const form = useForm<Values>({
    resolver: zodResolver(setupSchema),
    defaultValues: { companyName: "", fullName: "", email: "", password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const { run, pending } = useServerAction(completeSetupAction, { silent: true });
  const pwd = form.watch("password") ?? "";
  const confirm = form.watch("confirmPassword") ?? "";

  return (
    <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => run(v))}>
      <Field data-invalid={!!errors.companyName}>
        <FieldLabel htmlFor="companyName">اسم الشركة</FieldLabel>
        <Input id="companyName" autoFocus maxLength={200} {...form.register("companyName")} aria-invalid={!!errors.companyName} />
        <FieldError errors={[errors.companyName]} />
      </Field>
      <Field data-invalid={!!errors.fullName}>
        <FieldLabel htmlFor="fullName">اسمك الكامل</FieldLabel>
        <Input id="fullName" maxLength={200} {...form.register("fullName")} aria-invalid={!!errors.fullName} />
        <FieldError errors={[errors.fullName]} />
      </Field>
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor="email">بريدك الإلكتروني</FieldLabel>
        <Input id="email" type="email" dir="ltr" className="text-start" autoComplete="username" {...form.register("email")} aria-invalid={!!errors.email} />
        <FieldError errors={[errors.email]} />
      </Field>
      <Field data-invalid={!!errors.password}>
        <FieldLabel htmlFor="password">كلمة المرور</FieldLabel>
        <Input id="password" type="password" autoComplete="new-password" dir="ltr" maxLength={128} {...form.register("password")} aria-invalid={!!errors.password} />
        <ul className="space-y-0.5 text-xs">
          <Rule ok={pwd.length >= 10}>10 أحرف على الأقل</Rule>
          <Rule ok={/[A-Za-z]/.test(pwd)}>تحتوي على حروف إنجليزية</Rule>
          <Rule ok={/\d/.test(pwd)}>تحتوي على أرقام</Rule>
        </ul>
        <FieldError errors={[errors.password]} />
      </Field>
      <Field data-invalid={!!errors.confirmPassword}>
        <FieldLabel htmlFor="confirmPassword">تأكيد كلمة المرور</FieldLabel>
        <Input id="confirmPassword" type="password" autoComplete="new-password" dir="ltr" maxLength={128} {...form.register("confirmPassword")} aria-invalid={!!errors.confirmPassword} />
        {confirm && confirm !== pwd && !errors.confirmPassword && <p className="text-xs text-muted-foreground">كلمتا المرور غير متطابقتين بعد</p>}
        <FieldError errors={[errors.confirmPassword]} />
      </Field>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Spinner /> : <Rocket />} إنشاء الحساب والبدء
      </Button>
    </form>
  );
}
