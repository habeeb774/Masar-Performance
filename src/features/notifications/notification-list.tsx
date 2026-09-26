"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClock,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  FileText,
  FileWarning,
  Hourglass,
  ListPlus,
  RefreshCcwDot,
  RotateCcw,
  Send,
  Star,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { markNotificationReadAction } from "@/actions/org";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  time: string;
}

const TYPE_ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  WEEK_ENDING: { icon: CalendarClock, cls: "bg-info-soft text-info" },
  LOW_WEEKLY_PROGRESS: { icon: TrendingDown, cls: "bg-warning-soft text-warning" },
  ITEM_RETURNED_FOR_REVISION: { icon: RotateCcw, cls: "bg-danger-soft text-danger" },
  PENDING_APPROVAL_ITEMS: { icon: Hourglass, cls: "bg-pending-soft text-pending" },
  TASK_ASSIGNED: { icon: ListPlus, cls: "bg-primary/10 text-primary" },
  WEEKLY_REPORT_READY: { icon: FileText, cls: "bg-info-soft text-info" },
  REPORT_RETURNED: { icon: FileWarning, cls: "bg-warning-soft text-warning" },
  REPORT_SUBMITTED: { icon: Send, cls: "bg-pending-soft text-pending" },
  REPORT_APPROVED: { icon: FileCheck2, cls: "bg-success-soft text-success" },
  MONTH_ENDING: { icon: AlarmClock, cls: "bg-info-soft text-info" },
  PLAN_SUBMITTED: { icon: ClipboardList, cls: "bg-pending-soft text-pending" },
  PLAN_APPROVED: { icon: ClipboardCheck, cls: "bg-success-soft text-success" },
  PLAN_RETURNED: { icon: RotateCcw, cls: "bg-warning-soft text-warning" },
  REVIEW_APPROVED: { icon: Star, cls: "bg-success-soft text-success" },
  SYNC_FAILED: { icon: RefreshCcwDot, cls: "bg-danger-soft text-danger" },
  GENERAL: { icon: Bell, cls: "bg-muted text-muted-foreground" },
};

function isExternal(link: string) {
  if (!/^https?:\/\//i.test(link)) return false;
  try {
    return new URL(link).origin !== window.location.origin;
  } catch {
    return true;
  }
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  const open = (n: NotificationItem) => {
    const external = n.link ? isExternal(n.link) : false;
    // open the new tab synchronously so popup blockers allow it
    if (n.link && external) window.open(n.link, "_blank", "noopener,noreferrer");
    setBusyId(n.id);
    start(async () => {
      if (!n.read) {
        try {
          const r = await markNotificationReadAction(n.id);
          if (!r.ok) toast.error(r.error);
        } catch {
          toast.error("تعذر الاتصال بالخادم");
        }
      }
      setBusyId(null);
      if (n.link && !external) router.push(n.link);
      else router.refresh();
    });
  };

  return (
    <Card className="gap-0 divide-y overflow-hidden py-0">
      {items.map((n) => {
        const meta = TYPE_ICONS[n.type] ?? TYPE_ICONS.GENERAL;
        const Icon = meta.icon;
        const external = !!n.link && /^https?:\/\//i.test(n.link);
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n)}
            disabled={busyId === n.id}
            className={cn("flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none", !n.read && "bg-primary/[0.03]")}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", meta.cls)}>{busyId === n.id ? <Spinner /> : <Icon className="size-4" />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={cn("text-sm", n.read ? "font-medium text-foreground/80" : "font-semibold")}>{n.title}</span>
                {external && <ExternalLink className="size-3.5 text-muted-foreground" aria-label="يفتح في نافذة جديدة" />}
              </span>
              {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
              <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5">{n.typeLabel}</span>
                <span className="tabular-nums">{n.time}</span>
              </span>
            </span>
            {!n.read ? (
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />
            ) : (
              <CheckCircle2 className="mt-1 size-4 shrink-0 text-muted-foreground/40" aria-label="مقروء" />
            )}
          </button>
        );
      })}
    </Card>
  );
}
