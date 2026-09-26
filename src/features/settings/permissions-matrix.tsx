"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveRolePermissionsAction } from "@/actions/org";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { groupedCatalog, isLockedPermission, SystemAdminNote } from "./permission-editor";

interface MatrixRole {
  id: string;
  key: string;
  name: string;
  users: number;
  permissions: string[];
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((k) => b.has(k));

export function PermissionsMatrix({ roles, missing }: { roles: MatrixRole[]; missing: string[] }) {
  const router = useRouter();
  const groups = useMemo(() => groupedCatalog(), []);
  const initial = useMemo(() => new Map(roles.map((r) => [r.id, new Set(r.permissions)])), [roles]);
  const [state, setState] = useState(() => new Map(roles.map((r) => [r.id, new Set(r.permissions)])));
  const [savingId, setSavingId] = useState<string | "all" | null>(null);
  const [pending, start] = useTransition();

  const dirty = roles.filter((r) => !sameSet(state.get(r.id) ?? new Set(), initial.get(r.id) ?? new Set()));
  const dirtyIds = new Set(dirty.map((r) => r.id));

  const toggle = (role: MatrixRole, key: string, on: boolean) => {
    if (isLockedPermission(role.key, key)) return;
    setState((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(role.id));
      if (on) set.add(key);
      else set.delete(key);
      next.set(role.id, set);
      return next;
    });
  };

  const save = (targets: MatrixRole[], id: string | "all") => {
    setSavingId(id);
    start(async () => {
      let ok = 0;
      const errors: string[] = [];
      for (const r of targets) {
        try {
          const res = await saveRolePermissionsAction(r.id, [...(state.get(r.id) ?? [])]);
          if (res.ok) ok++;
          else errors.push(`${r.name}: ${res.error}`);
        } catch {
          errors.push(`${r.name}: تعذر الاتصال بالخادم`);
        }
      }
      if (ok) toast.success(ok === 1 ? "تم حفظ صلاحيات الدور" : `تم حفظ صلاحيات ${ok} أدوار`);
      errors.forEach((e) => toast.error(e));
      setSavingId(null);
      router.refresh();
    });
  };

  const reset = () => setState(new Map(roles.map((r) => [r.id, new Set(r.permissions)])));

  return (
    <div className="space-y-4">
      <SystemAdminNote />
      {missing.length > 0 && (
        <p className="rounded-lg bg-danger-soft p-3 text-xs text-danger">
          صلاحيات غير موجودة في قاعدة البيانات ولن تُحفظ حتى تشغيل التهيئة (seed):{" "}
          <span dir="ltr" className="font-mono">
            {missing.join(", ")}
          </span>
        </p>
      )}

      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/95 p-2 backdrop-blur">
        <p className="px-1 text-sm text-muted-foreground">{dirty.length ? `تغييرات غير محفوظة في ${dirty.length} دور` : "لا توجد تغييرات"}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} disabled={!dirty.length || pending}>
            <RotateCcw /> تراجع
          </Button>
          <Button size="sm" onClick={() => save(dirty, "all")} disabled={!dirty.length || pending}>
            {savingId === "all" ? <Spinner /> : <Save />} حفظ كل التغييرات
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky start-0 z-[1] min-w-56 bg-muted text-start">الصلاحية</TableHead>
              {roles.map((r) => {
                const isDirty = dirtyIds.has(r.id);
                const full = state.get(r.id)?.has(PERMISSIONS.SYSTEM_ADMIN);
                return (
                  <TableHead key={r.id} className="min-w-32 py-2 text-center align-top">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-semibold text-foreground">{r.name}</span>
                      <span className="font-mono text-[10px] font-normal" dir="ltr">
                        {r.key} · {r.users} مستخدم
                      </span>
                      {full && <span className="text-[10px] font-medium text-warning">صلاحيات كاملة</span>}
                      <Button
                        size="xs"
                        variant={isDirty ? "default" : "ghost"}
                        disabled={!isDirty || pending}
                        onClick={() => save([r], r.id)}
                        aria-label={`حفظ صلاحيات ${r.name}`}
                      >
                        {savingId === r.id ? <Spinner /> : <Save />} حفظ
                      </Button>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <Fragment key={g.group}>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={roles.length + 1} className="sticky start-0 py-1.5 text-xs font-bold text-muted-foreground">
                    {g.group}
                  </TableCell>
                </TableRow>
                {g.items.map((it) => (
                  <TableRow key={it.key}>
                    <TableCell className="sticky start-0 z-[1] bg-card py-2">
                      <span className="block text-sm">{it.name}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground" dir="ltr">
                        {it.key}
                      </span>
                    </TableCell>
                    {roles.map((r) => {
                      const set = state.get(r.id) ?? new Set<string>();
                      const checked = set.has(it.key);
                      const changed = checked !== (initial.get(r.id)?.has(it.key) ?? false);
                      const locked = isLockedPermission(r.key, it.key);
                      const implied = !checked && set.has(PERMISSIONS.SYSTEM_ADMIN);
                      return (
                        <TableCell key={r.id} className={cn("py-2 text-center", changed && "bg-warning-soft")}>
                          <div className="flex flex-col items-center gap-0.5">
                            <Checkbox
                              checked={checked}
                              disabled={locked || pending || missing.includes(it.key)}
                              onCheckedChange={(v) => toggle(r, it.key, v === true)}
                              aria-label={`${it.name} — ${r.name}`}
                            />
                            {implied && <span className="text-[10px] text-success">مشمولة</span>}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
