import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/num";

export function progressTone(pct: number) {
  if (pct >= 100) return "bg-success";
  if (pct >= 75) return "bg-info";
  if (pct >= 50) return "bg-warning";
  return "bg-danger";
}

/** RTL-aware progress bar: fills from the start (right) edge. */
export function ProgressBar({
  value,
  className,
  showLabel = false,
  size = "md",
  tone,
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  tone?: string;
}) {
  const pct = Number.isFinite(value) ? Math.max(0, value) : 0;
  const width = Math.min(pct, 100);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn("relative w-full overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2")}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("absolute inset-y-0 start-0 rounded-full transition-all", tone ?? progressTone(pct))} style={{ width: `${width}%` }} />
      </div>
      {showLabel && <span className="w-12 shrink-0 text-end text-xs font-medium tabular-nums text-muted-foreground">{formatPct(pct)}</span>}
    </div>
  );
}
