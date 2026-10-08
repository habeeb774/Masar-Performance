import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/page";
import { monthLabel } from "@/lib/dates";
import { ApproveEvaluationButton } from "@/features/evaluation/evaluation-buttons";
import { fmt } from "@/features/evaluation/evaluation-sheet";

type Row = { id: string; employee: string; year: number; month: number; finalScore: number; ratingLabel: string | null; ready: boolean };

/** «تقييم حبيب — سبتمبر · 96 ممتاز [اعتماد] [فتح]» — approve right here, no extra page. */
export function EvaluationsQueue({ rows, canApprove }: { rows: Row[]; canApprove: boolean }) {
  if (rows.length === 0) return <EmptyState icon={CheckCircle2} title="لا توجد تقييمات بانتظار الاعتماد" />;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">
              تقييم {r.employee} — {monthLabel(r.year, r.month)}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{fmt(r.finalScore)}</span> / 100 · {r.ratingLabel ?? "—"}
              {!r.ready && " · يحتاج استكمالًا قبل الاعتماد"}
            </p>
          </div>
          <div className="flex gap-2">
            {canApprove && r.ready && <ApproveEvaluationButton evaluationId={r.id} label="اعتماد" />}
            <Button variant={r.ready && canApprove ? "ghost" : "outline"} asChild>
              <Link href={`/performance/evaluations/${r.id}`}>فتح</Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
