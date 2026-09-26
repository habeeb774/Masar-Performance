"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickAddTask } from "./quick-add-task";
import { TaskSections } from "./task-sections";
import type { AdHocTaskRow, DailyTaskRow, GoalOption } from "@/server/queries/tasks";

/**
 * "مهام اليوم" section on the employee dashboard: a compact trigger that
 * expands the shared quick-add form inline (no navigation), plus the same
 * grouped sections used on /my-tasks.
 */
export function DashboardTodayTasks({
  daily,
  adHoc,
  today,
  goals,
  currentUserId,
}: {
  daily: DailyTaskRow[];
  adHoc: AdHocTaskRow[];
  today: string;
  goals: GoalOption[];
  currentUserId: string;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-3">
      {addOpen ? (
        <QuickAddTask today={today} goals={goals} />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus /> مهمة سريعة
        </Button>
      )}
      <TaskSections daily={daily} adHoc={adHoc} today={today} goals={goals} currentUserId={currentUserId} canManage={false} onAddNew={() => setAddOpen(true)} />
    </div>
  );
}
