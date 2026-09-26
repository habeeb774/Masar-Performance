"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Check, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { useServerAction } from "@/hooks/use-server-action";
import { changeOwnPasswordAction } from "@/actions/org";
import { changePasswordSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";

type Values = z.input<typeof changePasswordSchema>;

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-1.5", ok ? "text-success" : "text-muted-foreground")}>
      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {children}
    </li>
  );
}

export function ChangePasswordForm() {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const { run, pending } = useServerAction(changeOwnPasswordAction, {
    onSuccess: () => {
      form.reset();
      router.refresh();
    },
  });
  const pwd = form.watch("newPassword") ?? "";
  const confirm = form.watch("confirmPassword") ?? "";

  return (
    <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => run(v))}>
      <Field data-invalid={!!errors.currentPassword}>
        <FieldLabel htmlFor="currentPassword">كلمة المرور الحالية</FieldLabel>
        <Input id="currentPassword" type="password" autoComplete="current-password" dir="ltr" {...form.register("currentPassword")} aria-invalid={!!errors.currentPassword} />
        <FieldError errors={[errors.currentPassword]} />
      </Field>
      <Field data-invalid={!!errors.newPassword}>
        <FieldLabel htmlFor="newPassword">كلمة المرور الجديدة</FieldLabel>
        <Input id="newPassword" type="password" autoComplete="new-password" dir="ltr" maxLength={128} {...form.register("newPassword")} aria-invalid={!!errors.newPassword} />
        <ul className="space-y-0.5 text-xs">
          <Rule ok={pwd.length >= 10}>10 أحرف على الأقل</Rule>
          <Rule ok={/[A-Za-z]/.test(pwd)}>تحتوي على حروف إنجليزية</Rule>
          <Rule ok={/\d/.test(pwd)}>تحتوي على أرقام</Rule>
        </ul>
        <FieldError errors={[errors.newPassword]} />
      </Field>
      <Field data-invalid={!!errors.confirmPassword}>
        <FieldLabel htmlFor="confirmPassword">تأكيد كلمة المرور الجديدة</FieldLabel>
        <Input id="confirmPassword" type="password" autoComplete="new-password" dir="ltr" maxLength={128} {...form.register("confirmPassword")} aria-invalid={!!errors.confirmPassword} />
        {confirm && confirm !== pwd && !errors.confirmPassword && <p className="text-xs text-muted-foreground">كلمتا المرور غير متطابقتين بعد</p>}
        <FieldError errors={[errors.confirmPassword]} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : <KeyRound />} تغيير كلمة المرور
        </Button>
      </div>
    </form>
  );
}
