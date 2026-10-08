import { AlertTriangle } from "lucide-react";
import { monthLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { fmt } from "./evaluation-sheet";
import type { EvaluationData } from "./types";

/** «الواجب الثالث: التعديل وتطوير واجهة ومظهر المتجر» → «التعديل وتطوير واجهة ومظهر المتجر» */
const shortTitle = (title: string) => (title.includes(":") ? title.slice(title.indexOf(":") + 1).trim().replace(/\.$/, "") : title);

const tone = (score: number) => (score >= 91 ? "text-success" : score >= 70 ? "text-foreground" : score >= 56 ? "text-warning" : "text-danger");

/** What the manager sees first: final score, rating and the four duties — no weights or formulas. */
export function EvaluationSummary({ data }: { data: EvaluationData }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-bold">{data.employeeName}</p>
          <p className="text-sm text-muted-foreground">
            {data.jobTitle ?? "—"} · {monthLabel(data.year, data.month)}
          </p>
        </div>
        <div className="text-end">
          <p className={cn("text-4xl font-bold tabular-nums", tone(data.finalScore))}>
            {fmt(data.finalScore)} <span className="text-lg font-medium text-muted-foreground">/ 100</span>
          </p>
          <p className="text-base font-semibold">{data.ratingLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.duties.map((d) => (
          <div key={d.id} className="rounded-xl border bg-card p-3">
            <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{shortTitle(d.title)}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone(d.score))}>{fmt(d.score)}%</p>
          </div>
        ))}
      </div>

      {data.status === "DRAFT" && data.validation.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          يحتاج التقييم استكمالًا قبل الاعتماد — افتح «عرض التفاصيل» لتصحيحه.
        </p>
      )}
    </div>
  );
}
