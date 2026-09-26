"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ChevronLeft, KeyRound, Plus, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { EmptyState } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { createRoleAction } from "@/actions/org";
import { roleSchema } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";
import { formatNumber } from "@/lib/num";
import { RolePermissionsDialog } from "./permission-editor";

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  users: number;
  permissions: string[];
}

type FormIn = z.input<typeof roleSchema>;
type FormOut = z.output<typeof roleSchema>;

export function RolesManager({ rows }: { rows: RoleRow[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/permissions">
            <KeyRound /> مصفوفة الصلاحيات
          </Link>
        </Button>
        <Button onClick={() => setCreating(true)}>
          <Plus /> دور جديد
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="لا توجد أدوار" action={<Button onClick={() => setCreating(true)}>دور جديد</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const full = r.permissions.includes(PERMISSIONS.SYSTEM_ADMIN);
            return (
              <button key={r.id} type="button" onClick={() => setEditing(r)} className="group text-start" aria-label={`تعديل صلاحيات ${r.name}`}>
                <Card className="h-full gap-0 py-4 transition-colors group-hover:border-primary/40 group-hover:bg-accent/30">
                  <CardContent className="flex h-full flex-col gap-3 px-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <ShieldCheck className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{r.name}</span>
                          {r.isSystem && (
                            <StatusBadge tone="neutral" dot={false}>
                              دور نظامي
                            </StatusBadge>
                          )}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                          {r.key}
                        </span>
                      </div>
                      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                    {r.description && <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 tabular-nums">
                        <Users className="size-3.5" /> {formatNumber(r.users)} مستخدم
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 tabular-nums">
                        <KeyRound className="size-3.5" /> {formatNumber(r.permissions.length)} صلاحية
                      </span>
                      {full && <StatusBadge tone="warning">صلاحيات كاملة</StatusBadge>}
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {creating && <CreateRoleDialog onClose={() => setCreating(false)} />}
      {editing && <RolePermissionsDialog key={editing.id} role={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CreateRoleDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(roleSchema), defaultValues: { key: "", name: "", description: "" } });
  const { errors } = form.formState;
  const { run, pending } = useServerAction(createRoleAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>دور جديد</DialogTitle>
          <DialogDescription>يُنشأ الدور بدون صلاحيات؛ حدد صلاحياته بعد الإنشاء من هذه الصفحة أو من مصفوفة الصلاحيات.</DialogDescription>
        </DialogHeader>
        <form id="role-form" className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => run(v))}>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="role-name">اسم الدور</FieldLabel>
            <Input id="role-name" autoFocus {...form.register("name")} aria-invalid={!!errors.name} placeholder="مثال: مشرف المحتوى" />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={!!errors.key}>
            <FieldLabel htmlFor="role-key">المفتاح</FieldLabel>
            <Input id="role-key" dir="ltr" className="font-mono uppercase" {...form.register("key")} aria-invalid={!!errors.key} placeholder="CONTENT_LEAD" maxLength={31} />
            <FieldDescription>بالإنجليزية الكبيرة والأرقام و _ فقط، ولا يمكن تغييره لاحقًا.</FieldDescription>
            <FieldError errors={[errors.key]} />
          </Field>
          <Field data-invalid={!!errors.description}>
            <FieldLabel htmlFor="role-desc">الوصف</FieldLabel>
            <Textarea id="role-desc" rows={2} {...form.register("description")} maxLength={500} />
            <FieldError errors={[errors.description]} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            إلغاء
          </Button>
          <Button type="submit" form="role-form" disabled={pending}>
            {pending && <Spinner />} إنشاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
