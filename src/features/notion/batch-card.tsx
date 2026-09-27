import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import type { BatchSummary } from "@/lib/notion/batches";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";

const PACE = {
  done: { label: "اكتملت", tone: "success" },
  ahead: { label: "متقدمة", tone: "success" },
  on_track: { label: "على المسار", tone: "info" },
  behind: { label: "متأخرة", tone: "warning" },
} as const;

function Line({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{formatNumber(value)}</span>
          <span className="text-muted-foreground"> / {formatNumber(total)}</span>
        </span>
      </div>
      <ProgressBar value={total > 0 ? (value / total) * 100 : 0} size="sm" />
    </div>
  );
}

/** «دفعة 65 — 40 منتج»: photos approved vs. added to the store, plus what is waiting. */
export function BatchCard({
  batch,
  pace,
  subtitle,
  className,
  children,
}: {
  batch: BatchSummary;
  pace?: keyof typeof PACE | null;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const waiting = batch.images.waiting + batch.images.edited;
  return (
    <Card className={cn("gap-0", className)}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Package className="size-4.5" />
            </span>
            <div>
              <p className="font-semibold">{batch.label}</p>
              <p className="text-xs text-muted-foreground">
                {formatNumber(batch.total)} منتج{subtitle ? ` · ${subtitle}` : ""}
              </p>
            </div>
          </div>
          {pace && <StatusBadge tone={PACE[pace].tone}>{PACE[pace].label}</StatusBadge>}
        </div>
        <Line label="الصور المعتمدة" value={batch.images.approved} total={batch.total} />
        <Line label="تمت الإضافة للمتجر" value={batch.store.added} total={batch.total} />
        {(batch.images.needsImprovement > 0 || waiting > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {batch.images.needsImprovement > 0 && (
              <span>
                تحتاج تحسين: <span className="font-semibold text-warning">{formatNumber(batch.images.needsImprovement)}</span>
              </span>
            )}
            {waiting > 0 && (
              <span>
                بانتظار الاعتماد: <span className="font-semibold text-foreground">{formatNumber(waiting)}</span>
              </span>
            )}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
