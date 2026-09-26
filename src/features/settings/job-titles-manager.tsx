"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { useServerAction } from "@/hooks/use-server-action";
import { deleteJobTitleAction, saveJobTitleAction } from "@/actions/org";
import { jobTitleSchema } from "@/lib/validation";
import { formatNumber } from "@/lib/num";

export interface JobTitleRow {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isActive: boolean;
  employees: number;
  goalTemplates: number;
  kpis: number;
}

interface DepartmentOption {
  id: string;
  name: string;
  type: "ADMINISTRATION" | "SECTION";
  isActive: boolean;
}

type FormIn = z.input<typeof jobTitleSchema>;
type FormOut = z.output<typeof jobTitleSchema>;
const NONE = "__none";

function CountLink({ href, value, label }: { href: string; value: number; label: string }) {
  return (
    <Link href={href} className="tabular-nums hover:text-primary hover:underline" title={label}>
      {formatNumber(value)}
    </Link>
  );
}

export function JobTitlesManager({ rows, departments }: { rows: JobTitleRow[]; departments: DepartmentOption[] }) {
  const [editing, setEditing] = useState<JobTitleRow | "new" | null>(null);

  const columns = useMemo<ColumnDef<JobTitleRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "المسمى",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="font-medium">{row.original.name}</p>
            {row.original.description && <p className="line-clamp-1 text-xs text-muted-foreground">{row.original.description}</p>}
          </div>
        ),
      },
      {
        accessorKey: "departmentName",
        header: "الإدارة / القسم",
        enableSorting: true,
        cell: ({ row }) => row.original.departmentName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "employees",
        header: "الموظفون",
        enableSorting: true,
        cell: ({ row }) => <CountLink href={`/employees?jobTitleId=${row.original.id}`} value={row.original.employees} label="عرض الموظفين" />,
      },
      {
        accessorKey: "goalTemplates",
        header: "قوالب الأهداف",
        enableSorting: true,
        cell: ({ row }) => <CountLink href={`/goals?jobTitleId=${row.original.id}`} value={row.original.goalTemplates} label="قوالب الأهداف" />,
      },
      {
        accessorKey: "kpis",
        header: "المؤشرات",
        enableSorting: true,
        cell: ({ row }) => <CountLink href={`/performance/kpis?jobTitleId=${row.original.id}`} value={row.original.kpis} label="مؤشرات الأداء" />,
      },
      {
        accessorKey: "isActive",
        header: "الحالة",
        cell: ({ row }) => (row.original.isActive ? <StatusBadge tone="success">نشط</StatusBadge> : <StatusBadge tone="blocked">غير نشط</StatusBadge>),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button size="icon-sm" variant="ghost" aria-label={`تعديل ${row.original.name}`} onClick={() => setEditing(row.original)}>
              <Pencil />
            </Button>
            <ActionButton
              size="icon-sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`حذف ${row.original.name}`}
              action={deleteJobTitleAction.bind(null, row.original.id)}
              confirm={{
                title: `حذف المسمى «${row.original.name}»؟`,
                description: row.original.employees
                  ? `لا يمكن الحذف: يوجد ${formatNumber(row.original.employees)} موظف بهذا المسمى. يمكنك تعطيله بدلًا من ذلك.`
                  : "سيتم حذف المسمى نهائيًا، وستُحذف مؤشرات الأداء المرتبطة به.",
                confirmLabel: "حذف",
                destructive: true,
              }}
            >
              <Trash2 />
            </ActionButton>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-sm">
          <Button variant="outline" size="sm" asChild>
            <Link href="/goals">قوالب الأهداف</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/performance/kpis">مؤشرات الأداء</Link>
          </Button>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus /> مسمى جديد
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="لا توجد مسميات وظيفية"
          description="أضف المسميات (مثل: مسؤول إضافة المنتجات، كاتب محتوى) لربطها بقوالب الأهداف والمؤشرات."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> إضافة مسمى
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={rows} rowClassName={(r) => (r.isActive ? undefined : "opacity-60")} />
        </div>
      )}
      {editing && (
        <JobTitleDialog key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} departments={departments} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function JobTitleDialog({ row, departments, onClose }: { row: JobTitleRow | null; departments: DepartmentOption[]; onClose: () => void }) {
  const router = useRouter();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(jobTitleSchema),
    defaultValues: {
      name: row?.name ?? "",
      description: row?.description ?? "",
      departmentId: row?.departmentId ?? "",
      isActive: row?.isActive ?? true,
    },
  });
  const { errors } = form.formState;
  const { run, pending } = useServerAction(saveJobTitleAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const options = departments.filter((d) => d.isActive || d.id === row?.departmentId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? `تعديل «${row.name}»` : "مسمى وظيفي جديد"}</DialogTitle>
          <DialogDescription>بعد الحفظ اربط المسمى بقالب أهداف ومؤشرات أداء.</DialogDescription>
        </DialogHeader>
        <form id="job-title-form" className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => run(row?.id ?? null, v))}>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="jt-name">المسمى</FieldLabel>
            <Input id="jt-name" autoFocus {...form.register("name")} aria-invalid={!!errors.name} maxLength={200} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field>
            <FieldLabel>الإدارة / القسم</FieldLabel>
            <Controller
              control={form.control}
              name="departmentId"
              render={({ field }) => (
                <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— غير محدد —</SelectItem>
                    {options.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.type === "ADMINISTRATION" ? "إدارة" : "قسم"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field data-invalid={!!errors.description}>
            <FieldLabel htmlFor="jt-desc">الوصف / المهام الأساسية</FieldLabel>
            <Textarea id="jt-desc" rows={3} {...form.register("description")} maxLength={1000} />
            <FieldError errors={[errors.description]} />
          </Field>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <Field orientation="horizontal" className="rounded-lg border p-3">
                <div className="flex-1">
                  <FieldLabel htmlFor="jt-active">نشط</FieldLabel>
                  <FieldDescription>المسميات غير النشطة لا تظهر عند إضافة موظف جديد.</FieldDescription>
                </div>
                <Switch id="jt-active" checked={field.value ?? true} onCheckedChange={field.onChange} />
              </Field>
            )}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            إلغاء
          </Button>
          <Button type="submit" form="job-title-form" disabled={pending}>
            {pending && <Spinner />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
