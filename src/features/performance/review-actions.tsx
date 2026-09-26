"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calculator, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useServerAction } from "@/hooks/use-server-action";
import { calculateAllReviewsAction, calculateReviewAction } from "@/actions/performance";

type ButtonProps = React.ComponentProps<typeof Button>;

/** Calculate / recalculate one employee's monthly review. */
export function CalculateReviewButton({
  employeeId,
  year,
  month,
  hasReview,
  goToReview = false,
  ...props
}: Omit<ButtonProps, "onClick"> & { employeeId: string; year: number; month: number; hasReview: boolean; goToReview?: boolean }) {
  const router = useRouter();
  const { run, pending } = useServerAction(calculateReviewAction, {
    onSuccess: (data) => {
      if (goToReview && data?.id) router.push(`/performance/reviews/${data.id}`);
      else router.refresh();
    },
  });
  return (
    <Button size="sm" variant="outline" {...props} disabled={pending || props.disabled} onClick={() => run(employeeId, year, month)}>
      {pending ? <Spinner /> : hasReview ? <RefreshCw /> : <Calculator />}
      {hasReview ? "إعادة الحساب" : "حساب"}
    </Button>
  );
}

/** Calculate all reviews for the month and show a done / errors summary. */
export function CalculateAllButton({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const [summary, setSummary] = useState<{ done: number; errors: string[] } | null>(null);
  const { run, pending } = useServerAction(calculateAllReviewsAction, {
    silent: true,
    onSuccess: (data) => {
      setSummary(data ?? { done: 0, errors: [] });
      router.refresh();
    },
  });
  const uniqueErrors = summary ? [...new Set(summary.errors)] : [];
  return (
    <div className="flex flex-col items-end gap-2">
      <Button disabled={pending} onClick={() => run(year, month)}>
        {pending ? <Spinner /> : <Calculator />}
        حساب الكل
      </Button>
      {summary && (
        <Alert className="max-w-md" variant={summary.errors.length && !summary.done ? "destructive" : "default"}>
          {summary.errors.length ? <AlertTriangle /> : <CheckCircle2 className="text-success" />}
          <AlertTitle>
            تم حساب {summary.done} تقييم{summary.errors.length ? ` — تعذر حساب ${summary.errors.length}` : ""}
          </AlertTitle>
          {uniqueErrors.length > 0 && (
            <AlertDescription>
              <ul className="ms-4 list-disc text-xs">
                {uniqueErrors.slice(0, 5).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          )}
          {summary.done === 0 && summary.errors.length === 0 && <AlertDescription>لا يوجد موظفون لديهم خطط لهذا الشهر.</AlertDescription>}
        </Alert>
      )}
    </div>
  );
}
