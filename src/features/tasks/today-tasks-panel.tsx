"use client";

import { useRef } from "react";
import { QuickAddTask } from "./quick-add-task";
import { TaskSections } from "./task-sections";
import type { AdHocTaskRow, DailyTaskRow, GoalOption } from "@/server/queries/tasks";

/**
 * Combines the persistent quick-add bar with the grouped today sections for
 * /my-tasks (today view). The empty state's "+ مهمة جديدة" scrolls to and
 * focuses the quick-add title field instead of navigating anywhere.
 */
export function TodayTasksPanel({
  daily,
  adHoc,
  today,
  goals,
  currentUserId,
  canManage,
}: {
  daily: DailyTaskRow[];
  adHoc: AdHocTaskRow[];
  today: string;
  goals: GoalOption[];
  currentUserId: string;
  canManage: boolean;
}) {
  const quickAddRef = useRef<HTMLDivElement>(null);

  const focusQuickAdd = () => {
    const el = quickAddRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector("input")?.focus();
  };

  return (
    <div className="space-y-4">
      <div ref={quickAddRef}>
        <QuickAddTask today={today} goals={goals} />
      </div>
      <TaskSections daily={daily} adHoc={adHoc} today={today} goals={goals} currentUserId={currentUserId} canManage={canManage} onAddNew={focusQuickAdd} />
    </div>
  );
}
