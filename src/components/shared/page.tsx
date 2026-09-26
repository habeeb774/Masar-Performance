import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { toneClasses } from "./status-badge";
import type { Tone } from "@/lib/labels";

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  href,
  footer,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  footer?: React.ReactNode;
}) {
  const body = (
    <Card className={cn("h-full gap-0 py-4 transition-colors", href && "hover:border-primary/40 hover:bg-accent/30")}>
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset", toneClasses[tone])}>
            <Icon className="size-4.5" />
          </span>
        )}
      </CardContent>
      {footer && <div className="mt-3 px-4">{footer}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end font-medium">{children}</span>
    </div>
  );
}

export function NotionSyncedTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-foreground/5 px-1.5 py-0.5 text-[11px] font-medium text-foreground/70", className)}>
      <svg viewBox="0 0 24 24" className="size-3" aria-hidden fill="currentColor">
        <path d="M4.46 4.21c.75.61 1.03.56 2.44.47l13.27-.8c.28 0 .05-.28-.05-.33L18.9 2.1c-.42-.33-.98-.7-2.06-.61L4 2.43c-.47.05-.56.28-.38.47l.84 1.31Zm.8 3.09v13.96c0 .75.37 1.03 1.22.98l14.58-.84c.84-.05.94-.56.94-1.17V6.36c0-.61-.23-.94-.75-.89L6.01 6.36c-.56.05-.75.33-.75.94Zm14.4.75c.09.42 0 .84-.42.89l-.7.14v10.3c-.61.33-1.17.52-1.64.52-.75 0-.94-.23-1.5-.94l-4.58-7.2v6.97l1.45.33s0 .84-1.17.84l-3.23.19c-.09-.19 0-.66.33-.75l.84-.23V9.84l-1.17-.09c-.09-.42.14-1.03.8-1.08l3.47-.23 4.77 7.3V9.28l-1.22-.14c-.09-.52.28-.89.75-.94l3.23-.19Z" />
      </svg>
      Synced from Notion
    </span>
  );
}
