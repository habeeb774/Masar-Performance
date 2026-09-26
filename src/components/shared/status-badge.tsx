import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

export const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success ring-success/25",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/25",
  info: "bg-info-soft text-info ring-info/25",
  pending: "bg-pending-soft text-pending ring-pending/25",
  blocked: "bg-blocked-soft text-blocked ring-blocked/25",
  neutral: "bg-muted text-muted-foreground ring-border",
  primary: "bg-primary/10 text-primary ring-primary/25",
};

export const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  pending: "bg-pending",
  blocked: "bg-blocked",
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
  dot = true,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", toneDot[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** Badge from a label map entry, e.g. <EnumBadge map={TASK_STATUS_LABELS} value={task.status} /> */
export function EnumBadge<K extends string>({
  map,
  value,
  className,
}: {
  map: Record<K, { label: string; tone: Tone }>;
  value: K | string | null | undefined;
  className?: string;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const entry = (map as Record<string, { label: string; tone: Tone }>)[value];
  return (
    <StatusBadge tone={entry?.tone ?? "neutral"} className={className}>
      {entry?.label ?? value}
    </StatusBadge>
  );
}
