"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Minus, X } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { NotionSyncedTag } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { useUrlParams } from "@/components/shared/url-filters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TaskStatusControl } from "@/features/tasks/task-status-control";
import { formatDateAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { PRIORITY_LABELS, TASK_SOURCE_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AdHocTaskRow, DailyTaskRow, EmployeeOption } from "@/server/queries/tasks";
import { TaskRowMenu } from "./task-row-menu";

function YesNo({ value }: { value: boolean }) {
  return value ? <Check className="size-4 text-success" aria-label="نعم" /> : <X className="size-4 text-muted-foreground" aria-label="لا" />;
}

export function AdHocTable({
  rows,
  today,
  employees,
  currentUserId,
}: {
  rows: AdHocTaskRow[];
  today: string;
  employees: EmployeeOption[];
  currentUserId: string;
}) {
  const columns: ColumnDef<AdHocTaskRow, unknown>[] = [
    { accessorKey: "employeeName", header: "الموظف", enableSorting: true, cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.employeeName}</span> },
    {
      accessorKey: "title",
      header: "التكليف",
      cell: ({ row }) => (
        <div className="max-w-64 min-w-40">
          <p className="truncate font-medium">{row.original.title}</p>
          {row.original.assignedByName && <p className="truncate text-xs text-muted-foreground">من: {row.original.assignedByName}</p>}
        </div>
      ),
    },
    {
      accessorKey: "assignedDate",
      header: "التكليف / التسليم",
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-xs whitespace-nowrap">
          <p>{formatDateAr(row.original.assignedDate)}</p>
          <p className={cn("text-muted-foreground", row.original.overdue && "font-semibold text-danger")}>
            {row.original.dueDate ? `← ${formatDateAr(row.original.dueDate)}` : "بدون موعد"}
          </p>
        </div>
      ),
    },
    { accessorKey: "priority", header: "الأولوية", cell: ({ row }) => <EnumBadge map={PRIORITY_LABELS} value={row.original.priority} /> },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <EnumBadge map={TASK_STATUS_LABELS} value={row.original.status} />
          {row.original.overdue && row.original.status !== "DELAYED" && <StatusBadge tone="danger">متأخر</StatusBadge>}
        </div>
      ),
    },
    {
      id: "eval",
      header: "في التقييم / الوزن",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <YesNo value={row.original.includeInEvaluation} />
          {row.original.includeInEvaluation ? `${formatNumber(row.original.weight)}%` : ""}
        </span>
      ),
    },
    { accessorKey: "isOutOfPlan", header: "خارج الخطة", cell: ({ row }) => <YesNo value={row.original.isOutOfPlan} /> },
    {
      accessorKey: "compensatesGoalName",
      header: "يعوض هدفًا",
      cell: ({ row }) =>
        row.original.compensatesGoalName ? <span className="block max-w-40 truncate text-xs">{row.original.compensatesGoalName}</span> : <Minus className="size-4 text-muted-foreground" />,
    },
    { accessorKey: "progress", header: "التقدم", enableSorting: true, cell: ({ row }) => <ProgressBar value={row.original.progress} size="sm" showLabel className="w-32" /> },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <TaskStatusControl
            compact
            task={{
              id: row.original.id,
              kind: "adhoc",
              title: row.original.title,
              status: row.original.status,
              progress: row.original.progress,
              notes: row.original.notes,
              delayReason: row.original.delayReason,
            }}
          />
          <TaskRowMenu task={row.original} today={today} employees={employees} currentUserId={currentUserId} canManage allowEdit />
        </div>
      ),
    },
  ];
  return (
    <div className="overflow-x-auto">
      <DataTable
        columns={columns}
        data={rows}
        emptyTitle="لا توجد تكليفات"
        emptyDescription="أنشئ تكليفًا جديدًا بالزر أعلى الصفحة."
        rowClassName={(r) => (r.overdue ? "bg-danger-soft/40" : undefined)}
      />
    </div>
  );
}

export function DailyTasksTable({ rows, today, currentUserId }: { rows: DailyTaskRow[]; today: string; currentUserId: string }) {
  const columns: ColumnDef<DailyTaskRow, unknown>[] = [
    { accessorKey: "employeeName", header: "الموظف", enableSorting: true, cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.employeeName}</span> },
    {
      accessorKey: "date",
      header: "التاريخ",
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-xs whitespace-nowrap">
          <p>{row.original.date === today ? "اليوم" : formatDateAr(row.original.date)}</p>
          {row.original.deadline && <p className={cn("text-muted-foreground", row.original.overdue && "font-semibold text-danger")}>الموعد {formatDateAr(row.original.deadline)}</p>}
        </div>
      ),
    },
    {
      accessorKey: "title",
      header: "المهمة",
      cell: ({ row }) => (
        <div className="max-w-72 min-w-44">
          <p className="truncate font-medium">{row.original.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <StatusBadge tone="neutral" dot={false}>
              {TASK_SOURCE_LABELS[row.original.source]}
            </StatusBadge>
            {row.original.notionDriven && <NotionSyncedTag />}
          </div>
        </div>
      ),
    },
    {
      id: "progress",
      header: "المنجز / المستهدف",
      cell: ({ row }) => {
        const t = row.original;
        const pct = t.target > 0 ? (t.achieved / t.target) * 100 : t.progress;
        return (
          <div className="w-36">
            <ProgressBar value={pct} size="sm" />
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              {t.target > 0 ? `${formatNumber(t.achieved)} / ${formatNumber(t.target)} ${t.unit ?? ""}` : `${t.progress}%`}
            </p>
          </div>
        );
      },
    },
    { accessorKey: "priority", header: "الأولوية", cell: ({ row }) => <EnumBadge map={PRIORITY_LABELS} value={row.original.priority} /> },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <EnumBadge map={TASK_STATUS_LABELS} value={row.original.status} />
          {row.original.overdue && row.original.status !== "DELAYED" && <StatusBadge tone="danger">متأخرة</StatusBadge>}
        </div>
      ),
    },
    {
      accessorKey: "notes",
      header: "ملاحظات",
      cell: ({ row }) => (
        <p className="line-clamp-2 max-w-48 text-xs text-muted-foreground">
          {row.original.delayReason ? `السبب: ${row.original.delayReason}` : (row.original.notes ?? "—")}
        </p>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <TaskStatusControl
            compact
            task={{
              id: row.original.id,
              kind: "daily",
              title: row.original.title,
              status: row.original.status,
              achieved: row.original.achieved,
              target: row.original.target,
              progress: row.original.progress,
              notes: row.original.notes,
              delayReason: row.original.delayReason,
              notionDriven: row.original.notionDriven,
            }}
          />
          <TaskRowMenu task={row.original} today={today} currentUserId={currentUserId} canManage allowEdit={false} />
        </div>
      ),
    },
  ];
  return (
    <div className="overflow-x-auto">
      <DataTable
        columns={columns}
        data={rows}
        emptyTitle="لا توجد مهام مطابقة"
        emptyDescription="غيّر الفلاتر أو نطاق التاريخ."
        rowClassName={(r) => (r.overdue ? "bg-danger-soft/40" : undefined)}
      />
    </div>
  );
}

/** From / to date inputs bound to ?from=&to= */
export function DateRangeFilter() {
  const { params, set } = useUrlParams();
  const urlFrom = params.get("from") ?? "";
  const urlTo = params.get("to") ?? "";
  const [from, setFrom] = useState(urlFrom);
  const [to, setTo] = useState(urlTo);
  // re-sync the inputs when the URL changes (back/forward, filter reset) — adjusted during render
  const [synced, setSynced] = useState({ from: urlFrom, to: urlTo });
  if (synced.from !== urlFrom || synced.to !== urlTo) {
    setSynced({ from: urlFrom, to: urlTo });
    setFrom(urlFrom);
    setTo(urlTo);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        من
        <Input type="date" value={from} className="w-40" onChange={(e) => { setFrom(e.target.value); set({ from: e.target.value || null }); }} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        إلى
        <Input type="date" value={to} className="w-40" onChange={(e) => { setTo(e.target.value); set({ to: e.target.value || null }); }} />
      </label>
      {(from || to) && (
        <Button variant="ghost" size="sm" onClick={() => set({ from: null, to: null })}>
          مسح التاريخ
        </Button>
      )}
    </div>
  );
}
