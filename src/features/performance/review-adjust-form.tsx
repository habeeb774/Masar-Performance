"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useServerAction } from "@/hooks/use-server-action";
import { adjustReviewAction } from "@/actions/performance";
import { reviewAdjustSchema } from "@/lib/validation";
import { finalScore } from "@/lib/kpi/engine";
import { formatNumber } from "@/lib/num";

export function ReviewAdjustForm({
  reviewId,
  autoScore,
  initial,
}: {
  reviewId: string;
  autoScore: number;
  initial: { adjustment: number; reason: string | null; managerNotes: string | null; strengths: string | null; improvements: string | null };
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(reviewAdjustSchema),
    defaultValues: {
      adjustment: initial.adjustment,
      reason: initial.reason ?? "",
      managerNotes: initial.managerNotes ?? "",
      strengths: initial.strengths ?? "",
      improvements: initial.improvements ?? "",
    },
  });
  const { run, pending } = useServerAction(adjustReviewAction, { onSuccess: () => router.refresh() });
  const errors = form.formState.errors;
  const adj = Number(form.watch("adjustment"));
  const preview = finalScore(autoScore, Number.isFinite(adj) ? adj : 0);

  return (
    <form onSubmit={form.handleSubmit((values) => run(reviewId, values))} noValidate>
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.adjustment}>
            <FieldLabel htmlFor="adjustment">التعديل اليدوي (−100 إلى +100)</FieldLabel>
            <Input id="adjustment" type="number" step="0.5" min={-100} max={100} {...form.register("adjustment")} aria-invalid={!!errors.adjustment} />
            <FieldDescription>
              النتيجة النهائية بعد التعديل: <span className="font-semibold text-foreground tabular-nums">{formatNumber(preview, 2)}</span>
            </FieldDescription>
            <FieldError errors={[errors.adjustment]} />
          </Field>
          <Field data-invalid={!!errors.reason}>
            <FieldLabel htmlFor="reason">سبب التعديل {adj !== 0 && <span className="text-destructive">*</span>}</FieldLabel>
            <Input id="reason" maxLength={2000} placeholder="مطلوب عند وجود تعديل" {...form.register("reason")} aria-invalid={!!errors.reason} />
            <FieldError errors={[errors.reason]} />
          </Field>
        </div>
        <Field data-invalid={!!errors.managerNotes}>
          <FieldLabel htmlFor="managerNotes">ملاحظات المدير</FieldLabel>
          <Textarea id="managerNotes" rows={3} maxLength={5000} {...form.register("managerNotes")} />
          <FieldError errors={[errors.managerNotes]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.strengths}>
            <FieldLabel htmlFor="strengths">نقاط القوة</FieldLabel>
            <Textarea id="strengths" rows={3} maxLength={5000} {...form.register("strengths")} />
            <FieldError errors={[errors.strengths]} />
          </Field>
          <Field data-invalid={!!errors.improvements}>
            <FieldLabel htmlFor="improvements">فرص التحسين</FieldLabel>
            <Textarea id="improvements" rows={3} maxLength={5000} {...form.register("improvements")} />
            <FieldError errors={[errors.improvements]} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : <Save />}
            حفظ مراجعة المدير
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
