"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { CornerDownLeft, Network, Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { useServerAction } from "@/hooks/use-server-action";
import { deleteDepartmentAction, saveDepartmentAction } from "@/actions/org";
import { departmentSchema } from "@/lib/validation";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";

export interface DepartmentRow {
  id: string;
  name: string;
  code: string | null;
  type: "ADMINISTRATION" | "SECTION";
  parentId: string | null;
  description: string | null;
  isActive: boolean;
  headName: string | null;
  employees: number;
  children: number;
  jobTitles: number;
}

type FormIn = z.input<typeof departmentSchema>;
type FormOut = z.output<typeof departmentSchema>;

const TYPE_LABEL: Record<DepartmentRow["type"], string> = { ADMINISTRATION: "إدارة", SECTION: "قسم" };
const NONE = "__none";

interface TreeNode extends DepartmentRow {
  depth: number;
}

/** Depth-first ordering; rows whose parent is missing are treated as roots. */
function flattenTree(rows: DepartmentRow[]): TreeNode[] {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string | null, DepartmentRow[]>();
  for (const r of rows) {
    const key = r.parentId && ids.has(r.parentId) ? r.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }
  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const r of byParent.get(parent) ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ ...r, depth });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  // defensive: cycles would leave rows unvisited
  for (const r of rows) if (!seen.has(r.id)) out.push({ ...r, depth: 0 });
  return out;
}

function descendantsOf(rows: DepartmentRow[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parentId && result.has(r.parentId) && !result.has(r.id)) {
        result.add(r.id);
        grew = true;
      }
    }
  }
  return result;
}

export function DepartmentsManager({ rows }: { rows: DepartmentRow[] }) {
  const [editing, setEditing] = useState<{ row: DepartmentRow | null; parentId?: string | null } | null>(null);
  const tree = useMemo(() => flattenTree(rows), [rows]);
  const admins = rows.filter((r) => r.type === "ADMINISTRATION").length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {formatNumber(admins)} إدارة · {formatNumber(rows.length - admins)} قسم
        </p>
        <Button onClick={() => setEditing({ row: null })}>
          <Plus /> إدارة / قسم جديد
        </Button>
      </div>

      {tree.length === 0 ? (
        <EmptyState
          icon={Network}
          title="لا توجد إدارات بعد"
          description="ابدأ بإضافة الإدارات الرئيسية ثم أضف الأقسام التابعة لكل إدارة."
          action={
            <Button onClick={() => setEditing({ row: null })}>
              <Plus /> إضافة إدارة
            </Button>
          }
        />
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="divide-y px-0">
            {tree.map((d) => (
              <div
                key={d.id}
                className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4", !d.isActive && "opacity-60")}
                style={{ paddingInlineStart: `${1 + d.depth * 1.75}rem` }}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  {d.depth > 0 ? (
                    <CornerDownLeft className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <Network className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{d.name}</span>
                      <StatusBadge tone={d.type === "ADMINISTRATION" ? "primary" : "info"} dot={false}>
                        {TYPE_LABEL[d.type]}
                      </StatusBadge>
                      {d.code && (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" dir="ltr">
                          {d.code}
                        </span>
                      )}
                      {!d.isActive && <StatusBadge tone="blocked">غير نشط</StatusBadge>}
                    </div>
                    {d.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:w-72 sm:justify-end">
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="size-3.5" /> {d.headName ?? "بدون رئيس"}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Users className="size-3.5" /> {formatNumber(d.employees)} موظف
                  </span>
                </div>
                <div className="flex items-center gap-1 self-end sm:self-auto">
                  {d.type === "ADMINISTRATION" && (
                    <Button size="icon-sm" variant="ghost" aria-label={`إضافة قسم تابع لـ ${d.name}`} title="إضافة قسم تابع" onClick={() => setEditing({ row: null, parentId: d.id })}>
                      <Plus />
                    </Button>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label={`تعديل ${d.name}`} onClick={() => setEditing({ row: d })}>
                    <Pencil />
                  </Button>
                  <ActionButton
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`حذف ${d.name}`}
                    action={deleteDepartmentAction.bind(null, d.id)}
                    confirm={{
                      title: `حذف «${d.name}»؟`,
                      description:
                        d.children || d.employees
                          ? `لا يمكن الحذف ما دام مرتبطًا بـ ${formatNumber(d.children)} قسم و${formatNumber(d.employees)} موظف. انقلهم أولًا أو عطّل الإدارة بدلًا من حذفها.`
                          : "سيتم حذف هذه الإدارة/القسم نهائيًا.",
                      confirmLabel: "حذف",
                      destructive: true,
                    }}
                  >
                    <Trash2 />
                  </ActionButton>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {editing && <DepartmentDialog key={editing.row?.id ?? `new-${editing.parentId ?? ""}`} rows={rows} row={editing.row} presetParent={editing.parentId ?? null} onClose={() => setEditing(null)} />}
    </>
  );
}

function DepartmentDialog({ rows, row, presetParent, onClose }: { rows: DepartmentRow[]; row: DepartmentRow | null; presetParent: string | null; onClose: () => void }) {
  const router = useRouter();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: row?.name ?? "",
      code: row?.code ?? "",
      type: row?.type ?? (presetParent ? "SECTION" : "ADMINISTRATION"),
      parentId: row?.parentId ?? presetParent ?? "",
      description: row?.description ?? "",
      isActive: row?.isActive ?? true,
    },
  });
  const { errors } = form.formState;
  const { run, pending } = useServerAction(saveDepartmentAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const excluded = row ? descendantsOf(rows, row.id) : new Set<string>();
  const parentOptions = flattenTree(rows).filter((r) => !excluded.has(r.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? `تعديل «${row.name}»` : "إضافة إدارة / قسم"}</DialogTitle>
          <DialogDescription>الأقسام تتبع إدارة رئيسية؛ ويمكن للإدارة أن تتبع إدارة أعلى.</DialogDescription>
        </DialogHeader>
        <form id="department-form" className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => run(row?.id ?? null, v))}>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="dep-name">الاسم</FieldLabel>
              <Input id="dep-name" autoFocus {...form.register("name")} aria-invalid={!!errors.name} maxLength={200} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.code}>
              <FieldLabel htmlFor="dep-code">الرمز</FieldLabel>
              <Input id="dep-code" dir="ltr" {...form.register("code")} maxLength={40} placeholder="MKT" />
              <FieldError errors={[errors.code]} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.type}>
              <FieldLabel>النوع</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMINISTRATION">إدارة</SelectItem>
                      <SelectItem value="SECTION">قسم</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={!!errors.parentId}>
              <FieldLabel>تابع لـ</FieldLabel>
              <Controller
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— بدون (مستوى أعلى) —</SelectItem>
                      {parentOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {"  ".repeat(p.depth)}
                          {p.name} ({TYPE_LABEL[p.type]})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.parentId]} />
            </Field>
          </div>
          <Field data-invalid={!!errors.description}>
            <FieldLabel htmlFor="dep-desc">الوصف</FieldLabel>
            <Textarea id="dep-desc" rows={3} {...form.register("description")} maxLength={1000} />
            <FieldError errors={[errors.description]} />
          </Field>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <Field orientation="horizontal" className="rounded-lg border p-3">
                <div className="flex-1">
                  <FieldLabel htmlFor="dep-active">نشط</FieldLabel>
                  <FieldDescription>الإدارات غير النشطة لا تظهر عند اختيار إدارة لموظف جديد.</FieldDescription>
                </div>
                <Switch id="dep-active" checked={field.value ?? true} onCheckedChange={field.onChange} />
              </Field>
            )}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            إلغاء
          </Button>
          <Button type="submit" form="department-form" disabled={pending}>
            {pending && <Spinner />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
