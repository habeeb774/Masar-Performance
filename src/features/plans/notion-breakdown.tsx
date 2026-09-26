import { cn } from "@/lib/utils";
import { formatNumber, formatPct } from "@/lib/num";
import type { ProgressBreakdown } from "@/lib/notion/progress";
import type { Tone } from "@/lib/labels";
import { toneClasses } from "@/components/shared/status-badge";

function Cell({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={cn("rounded-lg px-2.5 py-2 ring-1 ring-inset", toneClasses[tone])}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Productivity counters of a Notion-driven goal (read-only). */
export function NotionBreakdownGrid({ breakdown, className }: { breakdown: ProgressBreakdown; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7", className)}>
      <Cell label="تم العمل عليه" value={formatNumber(breakdown.worked)} tone="info" />
      <Cell label="مكتمل" value={formatNumber(breakdown.completed)} tone="success" />
      <Cell label="بانتظار الاعتماد" value={formatNumber(breakdown.pendingApproval)} tone="pending" />
      <Cell label="يحتاج تحسين" value={formatNumber(breakdown.needsRevision)} tone={breakdown.needsRevision ? "danger" : "neutral"} />
      <Cell label="معلق" value={formatNumber(breakdown.blocked)} tone={breakdown.blocked ? "blocked" : "neutral"} />
      <Cell label="المتبقي" value={formatNumber(breakdown.remaining)} tone={breakdown.remaining ? "warning" : "success"} />
      <Cell label="نسبة الاعتماد" value={formatPct(breakdown.approvalRate)} tone="primary" />
    </div>
  );
}

/** Quality ratios, shown separately so volume never masks rework. */
export function NotionQualityGrid({ breakdown, className }: { breakdown: ProgressBreakdown; className?: string }) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      <Cell label="نسبة الاعتماد" value={formatPct(breakdown.approvalRate)} tone={breakdown.approvalRate === null ? "neutral" : breakdown.approvalRate >= 90 ? "success" : breakdown.approvalRate >= 75 ? "warning" : "danger"} />
      <Cell label="نسبة إعادة العمل" value={formatPct(breakdown.revisionRate)} tone={breakdown.revisionRate === null ? "neutral" : breakdown.revisionRate <= 5 ? "success" : breakdown.revisionRate <= 15 ? "warning" : "danger"} />
      <Cell label="عناصر أعيدت للتحسين" value={formatNumber(breakdown.reworkCount)} tone={breakdown.reworkCount ? "warning" : "neutral"} />
    </div>
  );
}
