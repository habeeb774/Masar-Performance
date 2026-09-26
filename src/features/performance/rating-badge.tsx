import { StatusBadge } from "@/components/shared/status-badge";
import type { Tone } from "@/lib/labels";

/** Map a rating band color name (seeded as Tailwind color names) to a UI tone. */
export function ratingTone(color: string | null | undefined): Tone {
  switch ((color ?? "").toLowerCase()) {
    case "emerald":
    case "green":
    case "teal":
    case "success":
      return "success";
    case "blue":
    case "sky":
    case "cyan":
    case "indigo":
    case "info":
      return "info";
    case "amber":
    case "yellow":
    case "orange":
    case "warning":
      return "warning";
    case "red":
    case "rose":
    case "danger":
      return "danger";
    case "violet":
    case "purple":
      return "pending";
    default:
      return "neutral";
  }
}

export function RatingBadge({ label, color, className }: { label: string | null | undefined; color: string | null | undefined; className?: string }) {
  if (!label) return <span className="text-muted-foreground">—</span>;
  return (
    <StatusBadge tone={ratingTone(color)} className={className}>
      {label}
    </StatusBadge>
  );
}

export const scoreTextClass: Record<Tone, string> = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
  pending: "text-pending",
  blocked: "text-blocked",
  neutral: "text-foreground",
  primary: "text-primary",
};
