"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerAction } from "@/hooks/use-server-action";
import { saveRolePermissionsAction } from "@/actions/org";
import { PERMISSION_CATALOG, PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export interface PermissionGroup {
  group: string;
  items: { key: string; name: string }[];
}

export function groupedCatalog(): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  for (const p of PERMISSION_CATALOG) {
    let g = groups.find((x) => x.group === p.group);
    if (!g) groups.push((g = { group: p.group, items: [] }));
    g.items.push({ key: p.key, name: p.name });
  }
  return groups;
}

/** `system.admin` may never be removed from the built-in ADMIN role (the server enforces the same rule). */
export function isLockedPermission(roleKey: string, permissionKey: string) {
  return roleKey === "ADMIN" && permissionKey === PERMISSIONS.SYSTEM_ADMIN;
}

export function SystemAdminNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-xs text-warning", className)}>
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        صلاحية <b>«إدارة النظام بالكامل»</b> (<code dir="ltr">system.admin</code>) تمنح الدور جميع الصلاحيات تلقائيًا بغض النظر عن باقي الاختيارات، ولا يمكن
        إزالتها من دور المدير العام (ADMIN).
      </span>
    </p>
  );
}

/** Grouped checklist of the permission catalog for one role. */
export function PermissionChecklist({
  roleKey,
  value,
  onChange,
  disabled,
}: {
  roleKey: string;
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const isAdmin = value.has(PERMISSIONS.SYSTEM_ADMIN);
  const toggle = (key: string, on: boolean) => {
    if (isLockedPermission(roleKey, key)) return;
    const next = new Set(value);
    if (on) next.add(key);
    else next.delete(key);
    onChange(next);
  };
  const toggleGroup = (g: PermissionGroup, on: boolean) => {
    const next = new Set(value);
    for (const it of g.items) {
      if (isLockedPermission(roleKey, it.key)) continue;
      if (on) next.add(it.key);
      else next.delete(it.key);
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {groupedCatalog().map((g) => {
        const all = g.items.every((it) => value.has(it.key));
        const some = g.items.some((it) => value.has(it.key));
        return (
          <fieldset key={g.group} className="rounded-lg border">
            <legend className="sr-only">{g.group}</legend>
            <label className="flex cursor-pointer items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-semibold">
              <Checkbox checked={all ? true : some ? "indeterminate" : false} disabled={disabled} onCheckedChange={(v) => toggleGroup(g, v === true)} />
              {g.group}
            </label>
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              {g.items.map((it) => {
                const locked = isLockedPermission(roleKey, it.key);
                const implied = isAdmin && !value.has(it.key);
                return (
                  <label
                    key={it.key}
                    className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50", locked && "cursor-not-allowed")}
                  >
                    <Checkbox className="mt-0.5" checked={value.has(it.key)} disabled={disabled || locked} onCheckedChange={(v) => toggle(it.key, v === true)} />
                    <span className="min-w-0">
                      <span className="block">{it.name}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground" dir="ltr">
                        {it.key}
                      </span>
                      {implied && <span className="text-[11px] text-success">مشمولة عبر إدارة النظام</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function RolePermissionsDialog({
  role,
  onClose,
}: {
  role: { id: string; key: string; name: string; permissions: string[] };
  onClose: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(() => new Set(role.permissions));
  const { run, pending } = useServerAction(saveRolePermissionsAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const catalogKeys = new Set(PERMISSION_CATALOG.map((p) => p.key as string));
  const extra = role.permissions.filter((k) => !catalogKeys.has(k));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>صلاحيات دور «{role.name}»</DialogTitle>
          <DialogDescription>
            {value.size} صلاحية محددة — تُطبق التغييرات على جميع مستخدمي هذا الدور فور الحفظ.
          </DialogDescription>
        </DialogHeader>
        <SystemAdminNote />
        <PermissionChecklist roleKey={role.key} value={value} onChange={setValue} disabled={pending} />
        {extra.length > 0 && <p className="text-xs text-muted-foreground">صلاحيات قديمة غير موجودة في الكتالوج ستبقى كما هي: {extra.join("، ")}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            إلغاء
          </Button>
          <Button onClick={() => run(role.id, [...value])} disabled={pending}>
            {pending && <Spinner />} حفظ الصلاحيات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
