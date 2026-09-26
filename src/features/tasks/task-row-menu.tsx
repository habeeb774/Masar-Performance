"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Spinner } from "@/components/ui/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { createTaskAction, deleteAdHocAction, deleteTaskAction } from "@/actions/tasks";
import { addDays } from "@/lib/dates";
import type { AdHocTaskRow, DailyTaskRow, EmployeeOption, GoalOption } from "@/server/queries/tasks";
import { ManualTaskDialog } from "./manual-task-dialog";
import { AdHocTaskDialog } from "./adhoc-task-dialog";
import { TaskDetailSheet } from "./task-detail-sheet";

/**
 * Per-row "more" menu: details sheet (attachments + comments), edit and
 * delete. Edit/delete are offered only where the server allows them.
 */
export function TaskRowMenu({
  task,
  today,
  currentUserId,
  canManage,
  goals = [],
  employees = [],
  allowEdit,
  onOpenDetails,
}: {
  task: DailyTaskRow | AdHocTaskRow;
  today: string;
  currentUserId: string;
  /** holder of TASKS_ASSIGN */
  canManage: boolean;
  goals?: GoalOption[];
  employees?: EmployeeOption[];
  allowEdit: boolean;
  /** when the row owns the details sheet, the menu only asks it to open */
  onOpenDetails?: () => void;
}) {
  const router = useRouter();
  const [details, setDetails] = useState(false);
  const [edit, setEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useServerAction(task.kind === "daily" ? deleteTaskAction : deleteAdHocAction, {
    onSuccess: () => {
      setConfirmDelete(false);
      router.refresh();
    },
  });
  const duplicate = useServerAction(createTaskAction, {
    successMessage: "تم تكرار المهمة",
    onSuccess: () => router.refresh(),
  });
  const canDuplicate = allowEdit && task.kind === "daily";
  const duplicateTask = () => {
    if (task.kind !== "daily") return;
    duplicate.run({
      title: task.title,
      description: task.description,
      date: addDays(task.date, 1),
      deadline: null,
      target: task.target,
      achieved: 0,
      progress: 0,
      status: "NOT_STARTED",
      priority: task.priority,
      monthlyGoalId: task.monthlyGoalId,
      notes: task.notes,
      delayReason: null,
      employeeId: task.employeeId,
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="خيارات المهمة" title="المزيد">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => (onOpenDetails ? onOpenDetails() : setDetails(true))}>
            <Eye /> التفاصيل والملاحظات
          </DropdownMenuItem>
          {allowEdit && (
            <>
              <DropdownMenuItem onSelect={() => setEdit(true)}>
                <Pencil /> تعديل
              </DropdownMenuItem>
              {canDuplicate && (
                <DropdownMenuItem onSelect={duplicateTask} disabled={duplicate.pending}>
                  <Copy /> تكرار المهمة
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> حذف
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {!onOpenDetails && <TaskDetailSheet task={task} open={details} onOpenChange={setDetails} currentUserId={currentUserId} canManage={canManage} />}

      {allowEdit &&
        (task.kind === "daily" ? (
          <ManualTaskDialog today={today} goals={goals} task={task} open={edit} onOpenChange={setEdit} />
        ) : (
          <AdHocTaskDialog today={today} employees={employees} task={task} open={edit} onOpenChange={setEdit} />
        ))}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{task.kind === "daily" ? "حذف المهمة؟" : "حذف التكليف؟"}</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف &quot;{task.title}&quot; نهائيًا ولا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.pending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.pending}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void del.run(task.id);
              }}
            >
              {del.pending && <Spinner />} حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
