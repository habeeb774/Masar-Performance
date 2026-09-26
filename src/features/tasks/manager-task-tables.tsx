"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { ProgressBar } from "@/components/shared/progress-bar";
import { SearchInput, SelectFilter, useUrlParams } from "@/components/shared/url-filters";
import { FilterDrawer, type FilterChipDef } from "@/components/shared/filter-drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TaskPriorityMark, TaskStatusControl, TaskStatusMarker } from "@/features/tasks/task-status-control";
import { useServerAction } from "@/hooks/use-server-action";
import type { ActionResult } from "@/server/action";
import { bulkMarkCompletedAction, bulkSetDeadlineAction, bulkSetPriorityAction, type BulkResult } from "@/actions/tasks";
import { formatDateAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { PRIORITIES, PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_STATUSES, type PriorityKey } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AdHocTaskRow, DailyTaskRow, EmployeeOption } from "@/server/queries/tasks";
import { TaskDetailSheet } from "./task-detail-sheet";
import { TaskRowMenu } from "./task-row-menu";

function TaskTitleCell({ task, currentUserId }: { task: DailyTaskRow | AdHocTaskRow; currentUserId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex max-w-72 min-w-40 items-center gap-1.5 rounded-md text-start outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
        <TaskPriorityMark priority={task.priority} />
        <span className="truncate font-medium">{task.title}</span>
      </button>
      <TaskDetailSheet task={task} open={open} onOpenChange={setOpen} currentUserId={currentUserId} canManage />
    </>
  );
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
    { accessorKey: "title", header: "التكليف", cell: ({ row }) => <TaskTitleCell task={row.original} currentUserId={currentUserId} /> },
    {
      accessorKey: "dueDate",
      header: "الموعد / التقدم",
      enableSorting: true,
      cell: ({ row }) => (
        <div className="w-36 text-xs">
          <p className={cn("whitespace-nowrap text-muted-foreground", row.original.overdue && "font-semibold text-danger")}>
            {row.original.dueDate ? (row.original.dueDate === today ? "اليوم" : formatDateAr(row.original.dueDate)) : "بدون موعد"}
          </p>
          <ProgressBar value={row.original.progress} size="sm" showLabel className="mt-1" />
        </div>
      ),
    },
    { accessorKey: "status", header: "الحالة", cell: ({ row }) => <TaskStatusMarker status={row.original.status} overdue={row.original.overdue} /> },
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visibleIds = rows.map((r) => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visibleIds));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: ColumnDef<DailyTaskRow, unknown>[] = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={someSelected ? "indeterminate" : allSelected}
          onCheckedChange={toggleAll}
          aria-label="تحديد كل مهام هذه الصفحة"
        />
      ),
      cell: ({ row }) => <Checkbox checked={selected.has(row.original.id)} onCheckedChange={() => toggleOne(row.original.id)} aria-label={`تحديد ${row.original.title}`} />,
    },
    { accessorKey: "employeeName", header: "الموظف", enableSorting: true, cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.employeeName}</span> },
    { accessorKey: "title", header: "المهمة", cell: ({ row }) => <TaskTitleCell task={row.original} currentUserId={currentUserId} /> },
    {
      accessorKey: "date",
      header: "الموعد / التقدم",
      enableSorting: true,
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="w-36 text-xs">
            <p className={cn("whitespace-nowrap text-muted-foreground", t.overdue && "font-semibold text-danger")}>
              {t.deadline && t.overdue ? `الموعد ${formatDateAr(t.deadline)}` : t.date === today ? "اليوم" : formatDateAr(t.date)}
            </p>
            {t.target > 0 && (
              <p className="mt-0.5 tabular-nums">
                {formatNumber(t.achieved)} / {formatNumber(t.target)} {t.unit ?? ""}
              </p>
            )}
          </div>
        );
      },
    },
    { accessorKey: "status", header: "الحالة", cell: ({ row }) => <TaskStatusMarker status={row.original.status} overdue={row.original.overdue} /> },
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
    <div className="overflow-x-auto pb-16">
      <DataTable
        columns={columns}
        data={rows}
        emptyTitle="لا توجد مهام مطابقة"
        emptyDescription="غيّر الفلاتر أو نطاق التاريخ."
        rowClassName={(r) => cn(r.overdue && "bg-danger-soft/40", selected.has(r.id) && "bg-primary/5")}
      />
      {selected.size > 0 && <BulkActionBar ids={[...selected]} onDone={() => setSelected(new Set())} />}
    </div>
  );
}

/**
 * Sticky floating bar shown when ≥1 daily-task row is selected. Every action
 * requires confirmation and calls a thin bulk-wrapper action that loops the
 * existing single-item `updateDailyTask` service call per id, then reports
 * partial success/failure back via a toast.
 */
function BulkActionBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const router = useRouter();
  const [priority, setPriority] = useState<PriorityKey>("MEDIUM");
  const [deadline, setDeadline] = useState("");
  const [dialog, setDialog] = useState<null | "priority" | "deadline" | "complete">(null);

  const report = (result: ActionResult<BulkResult>) => {
    // useServerAction (silent:true) already toasts a hard error (e.g. session expired); here we
    // only need to summarize the per-item partial success/failure count for a successful call.
    if (!result.ok) return;
    const d = result.data;
    if (!d) return;
    if (d.succeeded === d.total) toast.success(`تم التحديث لـ ${d.total} من أصل ${d.total}`);
    else toast.error(`تم التحديث لـ ${d.succeeded} من أصل ${d.total}، فشل ${d.total - d.succeeded}: ${d.firstError ?? "خطأ غير معروف"}`);
    router.refresh();
    onDone();
    setDialog(null);
  };

  const { run: runPriority, pending: pendingPriority } = useServerAction(bulkSetPriorityAction, { silent: true, onSuccess: () => {} });
  const { run: runDeadline, pending: pendingDeadline } = useServerAction(bulkSetDeadlineAction, { silent: true, onSuccess: () => {} });
  const { run: runComplete, pending: pendingComplete } = useServerAction(bulkMarkCompletedAction, { silent: true, onSuccess: () => {} });
  const pending = pendingPriority || pendingDeadline || pendingComplete;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2.5 shadow-[var(--shadow-float)] ring-1 ring-foreground/5">
        <span className="text-sm font-medium">{ids.length} محدد</span>
        <div className="h-5 w-px bg-border" />

        <Select value={priority} onValueChange={(v) => setPriority(v as PriorityKey)}>
          <SelectTrigger className="w-32" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setDialog("priority")} disabled={pending}>
          تغيير الأولوية
        </Button>

        <Input type="date" className="w-40" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => setDialog("deadline")} disabled={pending || !deadline}>
          تغيير الموعد
        </Button>

        <Button variant="outline" size="sm" onClick={() => setDialog("complete")} disabled={pending}>
          تعليم كمكتملة
        </Button>

        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          إلغاء التحديد
        </Button>
      </div>

      <AlertDialog open={dialog === "priority"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تغيير الأولوية لـ {ids.length} مهمة</AlertDialogTitle>
            <AlertDialogDescription>سيتم تعيين الأولوية &quot;{PRIORITY_LABELS[priority].label}&quot; لكل المهام المحددة. المهام غير اليدوية (من الخطة) لن تتأثر وسيُبلّغ عنها ضمن الفشل.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingPriority}>إلغاء</AlertDialogCancel>
            <AlertDialogAction disabled={pendingPriority} onClick={(e) => { e.preventDefault(); runPriority(ids, priority).then(report); }}>
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "deadline"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تغيير الموعد لـ {ids.length} مهمة</AlertDialogTitle>
            <AlertDialogDescription>سيتم تعيين الموعد {deadline ? formatDateAr(deadline) : ""} لكل المهام المحددة.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingDeadline}>إلغاء</AlertDialogCancel>
            <AlertDialogAction disabled={pendingDeadline} onClick={(e) => { e.preventDefault(); runDeadline(ids, deadline || null).then(report); }}>
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "complete"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تعليم {ids.length} مهمة كمكتملة</AlertDialogTitle>
            <AlertDialogDescription>لا يمكن التراجع عن هذا الإجراء تلقائيًا — تأكد من صحة الاختيار قبل المتابعة.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingComplete}>إلغاء</AlertDialogCancel>
            <AlertDialogAction disabled={pendingComplete} onClick={(e) => { e.preventDefault(); runComplete(ids).then(report); }}>
              تأكيد الإكمال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

/**
 * Filter drawer + chips for /tasks: status, employee, date range, search.
 * On wide desktop screens the controls also render inline (FilterDrawer's
 * `children` are shown in both places); the drawer trigger + chips are
 * always available regardless of width.
 */
export function TasksFilterBar({ employees, tab }: { employees: EmployeeOption[]; tab: "adhoc" | "daily" }) {
  const { params } = useUrlParams();
  const chips: FilterChipDef[] = [];
  const q = params.get("q");
  const employeeId = params.get("employee");
  const status = params.get("status");
  const from = params.get("from");
  const to = params.get("to");
  if (q) chips.push({ param: "q", label: `بحث: ${q}` });
  if (employeeId) chips.push({ param: "employee", label: employees.find((e) => e.id === employeeId)?.name ?? "موظف" });
  if (status) chips.push({ param: "status", label: status === "DELAYED" ? "متأخرة" : (TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS]?.label ?? status) });
  if (from) chips.push({ param: "from", label: `من ${formatDateAr(from)}` });
  if (to) chips.push({ param: "to", label: `إلى ${formatDateAr(to)}` });

  return (
    <FilterDrawer title="فلترة المهام" chips={chips} className="mb-4">
      <SearchInput placeholder={tab === "adhoc" ? "بحث في التكليفات…" : "بحث في المهام…"} />
      <SelectFilter param="employee" placeholder="الموظف" allLabel="كل الموظفين" options={employees.map((e) => ({ value: e.id, label: e.name }))} />
      <SelectFilter
        param="status"
        placeholder="الحالة"
        allLabel="كل الحالات"
        options={TASK_STATUSES.map((s) => ({ value: s, label: s === "DELAYED" ? "متأخرة (تجاوزت الموعد)" : TASK_STATUS_LABELS[s].label }))}
      />
      <DateRangeFilter />
    </FilterDrawer>
  );
}
