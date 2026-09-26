"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, PartyPopper } from "lucide-react";
import { EmptyState } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdHocTaskRow, DailyTaskRow, GoalOption } from "@/server/queries/tasks";
import { groupTasks } from "./task-groups";
import { DailyTaskItem, AdHocTaskItem } from "./my-task-list";

const ACCENT: Record<string, string> = {
  urgent: "border-s-4 border-s-danger",
  blocked: "border-s-4 border-s-warning",
};

/**
 * Renders daily + ad-hoc tasks grouped into سections (urgent/today/upcoming/
 * blocked/done) instead of a flat list. Empty sections are hidden; when
 * nothing is due at all a single celebratory empty state is shown instead.
 */
export function TaskSections({
  daily,
  adHoc,
  today,
  goals,
  currentUserId,
  canManage,
  onAddNew,
}: {
  daily: DailyTaskRow[];
  adHoc: AdHocTaskRow[];
  today: string;
  goals: GoalOption[];
  currentUserId: string;
  canManage: boolean;
  onAddNew?: () => void;
}) {
  const groups = groupTasks(daily, adHoc, today);
  const [doneCollapsed, setDoneCollapsed] = useState(true);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={PartyPopper}
        title="لا توجد مهام اليوم 🎉"
        description="أنت أنجزت جميع مهامك المجدولة لهذا اليوم."
        action={onAddNew && <Button size="sm" onClick={onAddNew}>+ مهمة جديدة</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const isDone = g.key === "doneRecently";
        const collapsed = isDone && doneCollapsed;
        return (
          <section key={g.key} className={cn("space-y-2", isDone && "opacity-80")}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground">
                {g.title} <span className="tabular-nums">({g.daily.length + g.adHoc.length})</span>
              </h3>
              {isDone && (
                <button
                  type="button"
                  onClick={() => setDoneCollapsed((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {collapsed ? "عرض" : "إخفاء"} {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                </button>
              )}
            </div>
            {!collapsed && (
              <div className="space-y-2">
                {g.daily.map((t) => (
                  <div key={t.id} className={cn("rounded-lg", ACCENT[g.key])}>
                    <DailyTaskItem task={t} today={today} goals={goals} currentUserId={currentUserId} canManage={canManage} showDate={false} />
                  </div>
                ))}
                {g.adHoc.map((t) => (
                  <div key={t.id} className={cn("rounded-lg", ACCENT[g.key])}>
                    <AdHocTaskItem task={t} today={today} currentUserId={currentUserId} canManage={canManage} />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
