"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Pencil, Plus, ShieldCheck, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ActionButton } from "@/components/shared/action-button";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { deleteConnectionAction, saveConnectionAction, testConnectionAction } from "@/actions/notion";
import { formatDateTimeAr } from "@/lib/dates";
import { CONNECTION_STATUS_LABELS } from "./labels";

export interface ConnectionRow {
  id: string;
  name: string;
  tokenHint: string;
  workspaceName: string | null;
  botName: string | null;
  authType: "INTERNAL" | "OAUTH";
  ownerEmail: string | null;
  status: "UNTESTED" | "CONNECTED" | "FAILED";
  lastTestedAt: string | null;
  lastError: string | null;
  isActive: boolean;
  dataSourcesCount: number;
}

const TOKEN_RE = /^(secret_|ntn_)[A-Za-z0-9]{20,}$/;

function ConnectionDialog({ open, onOpenChange, connection }: { open: boolean; onOpenChange: (v: boolean) => void; connection: ConnectionRow | null }) {
  const router = useRouter();
  const [name, setName] = useState(connection?.name ?? "Notion المتجر");
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [isActive, setIsActive] = useState(connection?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useServerAction(saveConnectionAction, {
    onSuccess: () => {
      setToken("");
      onOpenChange(false);
      router.refresh();
    },
  });

  const submit = () => {
    const next: Record<string, string> = {};
    const t = token.trim();
    if (name.trim().length < 2) next.name = "الاسم قصير جدًا";
    if (!connection && !t) next.token = "رمز التكامل مطلوب";
    else if (t && !TOKEN_RE.test(t)) next.token = "رمز Notion غير صالح (يبدأ بـ ntn_ أو secret_)";
    setErrors(next);
    if (Object.keys(next).length) return;
    run(connection?.id ?? null, { name: name.trim(), token: t, isActive }).then((r) => {
      if (!r.ok && r.fieldErrors) setErrors(Object.fromEntries(Object.entries(r.fieldErrors).map(([k, v]) => [k, v[0]])));
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{connection ? "تعديل اتصال Notion" : "إضافة رمز داخلي"}</DialogTitle>
          <DialogDescription>يُتحقق من الرمز مباشرة مع Notion قبل الحفظ، ويُخزن مشفّرًا ولا يُعرض مرة أخرى.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="conn-name">اسم الاتصال</Label>
            <Input id="conn-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          {connection?.authType === "OAUTH" ? (
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              هذا الاتصال مربوط عبر OAuth{connection.ownerEmail ? ` بحساب ${connection.ownerEmail}` : ""}. لتجديد الصلاحيات أو اختيار صفحات أخرى أعد الربط من زر
              «ربط Notion» أعلى الصفحة — سيُحدَّث هذا الاتصال نفسه.
            </p>
          ) : (
          <div className="space-y-2">
            <Label htmlFor="conn-token">رمز التكامل الداخلي (Internal Integration Secret)</Label>
            <div className="relative">
              <Input
                id="conn-token"
                type={show ? "text" : "password"}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={connection ? `•••• ${connection.tokenHint} — اتركه فارغًا للإبقاء على الرمز الحالي` : "ntn_…"}
                className="pe-9 font-mono text-xs"
                aria-invalid={!!errors.token}
              />
              <button
                type="button"
                className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "إخفاء الرمز" : "إظهار الرمز"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.token ? (
              <p className="text-xs text-destructive">{errors.token}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                من notion.so/my-integrations ← التكامل ← Configuration. {connection && "اتركه فارغًا إن لم ترد تغييره."}
              </p>
            )}
          </div>
          )}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <Label htmlFor="conn-active">الاتصال نشط</Label>
              <p className="text-xs text-muted-foreground">إيقافه يوقف المزامنة لكل القواعد المرتبطة به</p>
            </div>
            <Switch id="conn-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : <ShieldCheck />}
              {token.trim() ? "تحقق واحفظ" : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectionsManager({ connections }: { connections: ConnectionRow[] }) {
  const [dialog, setDialog] = useState<{ open: boolean; connection: ConnectionRow | null; key: number }>({ open: false, connection: null, key: 0 });
  const openDialog = (connection: ConnectionRow | null) => setDialog((d) => ({ open: true, connection, key: d.key + 1 }));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => openDialog(null)}>
          <Plus /> إضافة رمز داخلي
        </Button>
      </div>

      {connections.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="لا توجد اتصالات برمز داخلي"
          description="خيار للحالات الخاصة فقط. الطريقة المعتادة هي زر «ربط Notion» أعلى الصفحة."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-start">الاسم</TableHead>
                <TableHead className="text-start">التكامل / مساحة العمل</TableHead>
                <TableHead className="text-start">الحالة</TableHead>
                <TableHead className="text-start">الرمز</TableHead>
                <TableHead className="text-start">آخر اختبار</TableHead>
                <TableHead className="text-start">آخر خطأ</TableHead>
                <TableHead className="text-start">نشط</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{c.name}</p>
                      <StatusBadge tone={c.authType === "OAUTH" ? "info" : "neutral"} dot={false}>
                        {c.authType === "OAUTH" ? "OAuth" : "رمز داخلي"}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.dataSourcesCount} قاعدة بيانات{c.ownerEmail ? ` · ${c.ownerEmail}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    <p>{c.botName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{c.workspaceName ?? "—"}</p>
                  </TableCell>
                  <TableCell>
                    <EnumBadge map={CONNECTION_STATUS_LABELS} value={c.status} />
                  </TableCell>
                  <TableCell>
                    <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      •••• {c.tokenHint}
                    </code>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{c.lastTestedAt ? formatDateTimeAr(new Date(c.lastTestedAt)) : "—"}</TableCell>
                  <TableCell className="max-w-56">
                    {c.lastError ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="line-clamp-2 cursor-help text-xs text-danger">{c.lastError}</p>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">{c.lastError}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{c.isActive ? <StatusBadge tone="success">نشط</StatusBadge> : <StatusBadge tone="blocked">معطل</StatusBadge>}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <ActionButton size="sm" variant="outline" action={() => testConnectionAction(c.id)} disabled={!c.isActive}>
                        <Zap /> اختبار
                      </ActionButton>
                      <Button size="icon-sm" variant="ghost" aria-label="تعديل" onClick={() => openDialog(c)}>
                        <Pencil />
                      </Button>
                      <ActionButton
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label="حذف"
                        action={() => deleteConnectionAction(c.id)}
                        confirm={{
                          title: `حذف الاتصال «${c.name}»؟`,
                          description:
                            c.dataSourcesCount > 0
                              ? `سيتم حذف ${c.dataSourcesCount} قاعدة بيانات مرتبطة بهذا الاتصال مع جميع العناصر المتزامنة وسجلات المزامنة وربط الحقول. الأهداف المرتبطة ستفقد مصدرها. لا يمكن التراجع.`
                              : "سيتم حذف الاتصال والرمز المشفّر نهائيًا.",
                          confirmLabel: "حذف نهائي",
                          destructive: true,
                        }}
                      >
                        <Trash2 />
                      </ActionButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog.open || dialog.key > 0 ? (
        <ConnectionDialog key={dialog.key} open={dialog.open} onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))} connection={dialog.connection} />
      ) : null}
    </>
  );
}
