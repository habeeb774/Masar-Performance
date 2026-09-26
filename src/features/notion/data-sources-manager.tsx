"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Database, FileSearch, ListChecks, MoreHorizontal, Pencil, Plus, RefreshCw, Repeat, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/page";
import { StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { applyPresetAction, deleteDataSourceAction, discoverDatabaseAction, refreshSchemaAction, saveDataSourceAction, syncNowAction } from "@/actions/notion";
import { DATA_SOURCE_PURPOSES } from "@/lib/labels";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";

export interface DataSourceRow {
  id: string;
  name: string;
  purpose: string;
  connectionId: string;
  connectionName: string;
  notionDatabaseId: string;
  notionDataSourceId: string;
  isActive: boolean;
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  defaultEmployeeId: string | null;
  defaultEmployeeName: string | null;
  lastSyncedAt: string | null;
  schemaFetchedAt: string | null;
  itemsCount: number;
  mappingsCount: number;
}

type Option = { value: string; label: string };

const NONE = "__none__";

interface SettingsValues {
  name: string;
  purpose: string;
  syncIntervalMinutes: string;
  syncEnabled: boolean;
  defaultEmployeeId: string;
  isActive: boolean;
}

function SettingsFields({ values, onChange, employees, errors }: { values: SettingsValues; onChange: (patch: Partial<SettingsValues>) => void; employees: Option[]; errors: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ds-name">اسم القاعدة في النظام</Label>
        <Input id="ds-name" value={values.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={200} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>الغرض</Label>
          <Select value={values.purpose} onValueChange={(v) => onChange({ purpose: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DATA_SOURCE_PURPOSES).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ds-interval">فاصل المزامنة (دقيقة)</Label>
          <Input
            id="ds-interval"
            type="number"
            inputMode="numeric"
            min={5}
            max={1440}
            value={values.syncIntervalMinutes}
            onChange={(e) => onChange({ syncIntervalMinutes: e.target.value })}
            aria-invalid={!!errors.syncIntervalMinutes}
          />
          {errors.syncIntervalMinutes && <p className="text-xs text-destructive">{errors.syncIntervalMinutes}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <Label>الموظف الافتراضي</Label>
        <Select value={values.defaultEmployeeId || NONE} onValueChange={(v) => onChange({ defaultEmployeeId: v === NONE ? "" : v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>بدون — حسب حقل الموظف أو مسؤول المرحلة</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">تُنسب إليه العناصر التي لا يمكن تحديد صاحبها من Notion.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
          <span className="text-sm">المزامنة التلقائية</span>
          <Switch checked={values.syncEnabled} onCheckedChange={(v) => onChange({ syncEnabled: v })} />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
          <span className="text-sm">القاعدة نشطة</span>
          <Switch checked={values.isActive} onCheckedChange={(v) => onChange({ isActive: v })} />
        </label>
      </div>
    </div>
  );
}

function validateSettings(v: SettingsValues) {
  const errors: Record<string, string> = {};
  if (v.name.trim().length < 2) errors.name = "الاسم قصير جدًا";
  const n = Number(v.syncIntervalMinutes);
  if (!Number.isInteger(n) || n < 5 || n > 1440) errors.syncIntervalMinutes = "بين 5 و 1440 دقيقة";
  return errors;
}

const fieldErrorsOf = (fe?: Record<string, string[]>) => Object.fromEntries(Object.entries(fe ?? {}).map(([k, v]) => [k, v[0]]));

// ---- wizard ---------------------------------------------------------------------------

type Discovered = { databaseId: string; title: string; dataSources: { id: string; name: string }[] };

function AddDataSourceWizard({ open, onOpenChange, connections, employees }: { open: boolean; onOpenChange: (v: boolean) => void; connections: Option[]; employees: Option[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [connectionId, setConnectionId] = useState(connections[0]?.value ?? "");
  const [url, setUrl] = useState("");
  const [discovered, setDiscovered] = useState<Discovered | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [values, setValues] = useState<SettingsValues>({ name: "", purpose: "PRODUCTS", syncIntervalMinutes: "30", syncEnabled: true, defaultEmployeeId: "", isActive: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [presetCreated, setPresetCreated] = useState<number | null>(null);

  const discover = useServerAction(discoverDatabaseAction, { silent: true });
  const save = useServerAction(saveDataSourceAction, { silent: true });
  const preset = useServerAction(applyPresetAction);

  const doDiscover = () => {
    if (!connectionId) return setErrors({ connectionId: "اختر الاتصال" });
    if (url.trim().length < 8) return setErrors({ url: "الصق رابط قاعدة البيانات أو معرّفها" });
    setErrors({});
    discover.run(connectionId, url.trim()).then((r) => {
      if (!r.ok || !r.data) return;
      const d = r.data;
      if (d.dataSources.length === 0) {
        setErrors({ url: "لم يتم العثور على مصادر بيانات داخل هذه القاعدة" });
        return;
      }
      setDiscovered(d);
      setSourceId(d.dataSources[0].id);
      setValues((v) => ({ ...v, name: d.title || d.dataSources[0].name || v.name }));
      setStep(d.dataSources.length > 1 ? 2 : 3);
    });
  };

  const doSave = () => {
    if (!discovered || !sourceId) return;
    const errs = validateSettings(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save
      .run(null, {
        connectionId,
        name: values.name.trim(),
        purpose: values.purpose,
        notionDatabaseId: discovered.databaseId,
        notionDataSourceId: sourceId,
        syncEnabled: values.syncEnabled,
        syncIntervalMinutes: Number(values.syncIntervalMinutes),
        defaultEmployeeId: values.defaultEmployeeId || null,
        isActive: values.isActive,
      })
      .then((r) => {
        if (r.ok && r.data) {
          toast.success("تمت إضافة قاعدة البيانات وقراءة خصائصها");
          setCreatedId(r.data.id);
          setStep(4);
          router.refresh();
        } else if (!r.ok) setErrors(fieldErrorsOf(r.fieldErrors));
      });
  };

  const selectedSource = discovered?.dataSources.find((s) => s.id === sourceId);
  const stepTitles = ["الاتصال والرابط", "مصدر البيانات", "الإعدادات", "الربط"];

  return (
    <Dialog open={open} onOpenChange={(v) => !(discover.pending || save.pending) && onOpenChange(v)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>إضافة قاعدة بيانات Notion</DialogTitle>
          <DialogDescription>يقرأ النظام خصائص القاعدة مرة واحدة، ثم تتم المزامنة تدريجيًا حسب آخر تعديل.</DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-1 text-xs">
          {stepTitles.map((t, i) => (
            <li key={t} className="flex flex-1 items-center gap-1">
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold", step > i + 1 ? "bg-success text-white" : step === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {step > i + 1 ? "✓" : i + 1}
              </span>
              <span className={cn("truncate", step === i + 1 ? "font-medium" : "text-muted-foreground")}>{t}</span>
              {i < stepTitles.length - 1 && <span className="mx-1 h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاتصال</Label>
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger className="w-full" aria-invalid={!!errors.connectionId}>
                  <SelectValue placeholder="اختر الاتصال" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.connectionId && <p className="text-xs text-destructive">{errors.connectionId}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-url">رابط قاعدة البيانات أو معرّفها</Label>
              <Input
                id="ds-url"
                dir="ltr"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.notion.so/…?v=…"
                className="font-mono text-xs"
                aria-invalid={!!errors.url}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    doDiscover();
                  }
                }}
              />
              {errors.url ? (
                <p className="text-xs text-destructive">{errors.url}</p>
              ) : (
                <p className="text-xs text-muted-foreground">في Notion افتح القاعدة ← ⋯ ← Copy link. تأكد أولًا من مشاركتها مع التكامل عبر «Connections».</p>
              )}
            </div>
          </div>
        )}

        {step === 2 && discovered && (
          <div className="space-y-3">
            <p className="text-sm">
              القاعدة <span className="font-semibold">«{discovered.title || "بدون عنوان"}»</span> تحتوي على {discovered.dataSources.length} مصادر بيانات. اختر المصدر المطلوب:
            </p>
            <div className="space-y-2">
              {discovered.dataSources.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSourceId(s.id)}
                  className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors", sourceId === s.id ? "border-primary bg-primary/5" : "hover:bg-accent/40")}
                >
                  <Database className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{s.name || "بدون اسم"}</span>
                    <span dir="ltr" className="block truncate font-mono text-[11px] text-muted-foreground">
                      {s.id}
                    </span>
                  </span>
                  {sourceId === s.id && <CheckCircle2 className="size-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && discovered && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <span className="text-muted-foreground">المصدر: </span>
              <span className="font-medium">{selectedSource?.name || discovered.title}</span>
              <span dir="ltr" className="ms-2 font-mono text-[11px] text-muted-foreground">
                {sourceId}
              </span>
            </div>
            <SettingsFields values={values} onChange={(p) => setValues((v) => ({ ...v, ...p }))} employees={employees} errors={errors} />
          </div>
        )}

        {step === 4 && createdId && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft/40 p-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <p className="text-sm font-medium">تمت إضافة «{values.name}»</p>
                <p className="text-xs text-muted-foreground">الخطوة التالية: ربط خصائص القاعدة بأدوار النظام (العنوان، الدفعة، التاريخ، حالات المراحل…).</p>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">تطبيق الربط المقترح</p>
              <p className="mt-0.5 text-xs text-muted-foreground">يطابق خصائص قاعدة «إضافة المنتجات للمتجر» تلقائيًا مع حالاتها المعروفة. يمكنك تعديل كل شيء لاحقًا.</p>
              {presetCreated !== null ? (
                <p className="mt-2 text-xs font-medium text-success">تم إنشاء {presetCreated} ربط.</p>
              ) : (
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={preset.pending}
                  onClick={() =>
                    preset.run(createdId).then((r) => {
                      if (r.ok) {
                        setPresetCreated(r.data?.created ?? 0);
                        router.refresh();
                      }
                    })
                  }
                >
                  {preset.pending ? <Spinner /> : <Wand2 />} تطبيق الربط المقترح
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={discover.pending}>
                إلغاء
              </Button>
              <Button onClick={doDiscover} disabled={discover.pending || connections.length === 0}>
                {discover.pending ? <Spinner /> : <FileSearch />} اكتشاف القاعدة
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowRight /> رجوع
              </Button>
              <Button onClick={() => setStep(3)} disabled={!sourceId}>
                التالي <ArrowLeft />
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(discovered && discovered.dataSources.length > 1 ? 2 : 1)} disabled={save.pending}>
                <ArrowRight /> رجوع
              </Button>
              <Button onClick={doSave} disabled={save.pending}>
                {save.pending ? <Spinner /> : <Plus />} حفظ القاعدة
              </Button>
            </>
          )}
          {step === 4 && createdId && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                إغلاق
              </Button>
              <Button asChild>
                <Link href={`/notion/mappings?ds=${createdId}`}>
                  <ListChecks /> صفحة ربط الحقول والحالات
                </Link>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- edit -----------------------------------------------------------------------------

function EditDataSourceDialog({ source, open, onOpenChange, employees }: { source: DataSourceRow; open: boolean; onOpenChange: (v: boolean) => void; employees: Option[] }) {
  const router = useRouter();
  const [values, setValues] = useState<SettingsValues>({
    name: source.name,
    purpose: source.purpose,
    syncIntervalMinutes: String(source.syncIntervalMinutes),
    syncEnabled: source.syncEnabled,
    defaultEmployeeId: source.defaultEmployeeId ?? "",
    isActive: source.isActive,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useServerAction(saveDataSourceAction, {
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  const submit = () => {
    const errs = validateSettings(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    run(source.id, {
      connectionId: source.connectionId,
      name: values.name.trim(),
      purpose: values.purpose,
      notionDatabaseId: source.notionDatabaseId,
      notionDataSourceId: source.notionDataSourceId,
      syncEnabled: values.syncEnabled,
      syncIntervalMinutes: Number(values.syncIntervalMinutes),
      defaultEmployeeId: values.defaultEmployeeId || null,
      isActive: values.isActive,
    }).then((r) => !r.ok && setErrors(fieldErrorsOf(r.fieldErrors)));
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل «{source.name}»</DialogTitle>
          <DialogDescription>تغيير الموظف الافتراضي يعيد نسبة العناصر المحفوظة دون الاتصال بـ Notion.</DialogDescription>
        </DialogHeader>
        <SettingsFields values={values} onChange={(p) => setValues((v) => ({ ...v, ...p }))} employees={employees} errors={errors} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Spinner />} حفظ التعديلات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- row actions ----------------------------------------------------------------------

type ConfirmKind = "full" | "delete" | null;

function RowActions({ source, onEdit }: { source: DataSourceRow; onEdit: () => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const done = { onSuccess: () => router.refresh() };
  const sync = useServerAction(syncNowAction, { successMessage: "تمت المزامنة", ...done });
  const schema = useServerAction(refreshSchemaAction, done);
  const preset = useServerAction(applyPresetAction, done);
  const del = useServerAction(deleteDataSourceAction, { onSuccess: () => { setConfirm(null); router.refresh(); } });
  const busy = sync.pending || schema.pending || preset.pending || del.pending;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="outline" disabled={busy || !source.isActive} onClick={() => sync.run(source.id)}>
        {sync.pending ? <Spinner /> : <RefreshCw />} مزامنة
      </Button>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="المزيد" disabled={busy}>
            {busy && !sync.pending ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> تعديل الإعدادات
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/notion/mappings?ds=${source.id}`}>
              <ListChecks /> ربط الحقول والحالات
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => schema.run(source.id)}>
            <FileSearch /> تحديث خصائص القاعدة
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => preset.run(source.id)}>
            <Sparkles /> تطبيق الربط المقترح
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!source.isActive} onSelect={() => setConfirm("full")}>
            <Repeat /> مزامنة كاملة
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            <Trash2 /> حذف القاعدة
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? `حذف «${source.name}»؟` : "تشغيل مزامنة كاملة؟"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? `سيتم حذف القاعدة مع ${formatNumber(source.itemsCount)} عنصر متزامن وسجلات المزامنة وربط الحقول والحالات. الأهداف المرتبطة بها ستفقد مصدرها. البيانات في Notion لن تتأثر.`
                : "سيتم تجاهل مؤشر آخر مزامنة وإعادة قراءة جميع صفحات القاعدة من Notion. قد تستغرق العملية عدة دقائق."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={confirm === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "delete") del.run(source.id);
                else sync.run(source.id, true).then(() => setConfirm(null));
              }}
            >
              {busy && <Spinner />}
              {confirm === "delete" ? "حذف نهائي" : "بدء المزامنة الكاملة"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- manager --------------------------------------------------------------------------

export function DataSourcesManager({ sources, connections, employees, advanced }: { sources: DataSourceRow[]; connections: Option[]; employees: Option[]; advanced: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const autoOpen = advanced && params.get("new") === "1" && connections.length > 0;
  // `?new=1` opens the wizard on first render; the effect below only cleans the URL
  const [wizard, setWizard] = useState(() => ({ open: autoOpen, key: autoOpen ? 1 : 0 }));
  const [editing, setEditing] = useState<{ source: DataSourceRow; key: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const openWizard = () => setWizard((w) => ({ open: true, key: w.key + 1 }));

  useEffect(() => {
    if (params.get("new") !== "1") return;
    if (advanced) router.replace(pathname, { scroll: false });
    else router.replace("/notion/connect");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mb-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {advanced && (
          <Button variant="outline" onClick={openWizard} disabled={connections.length === 0}>
            <FileSearch /> إضافة يدوية برابط
          </Button>
        )}
        <Button asChild>
          <Link href="/notion/connect">
            <Plus /> إضافة قاعدة بيانات
          </Link>
        </Button>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          icon={Database}
          title="لم تُربط أي قاعدة بيانات بعد"
          description="اربط Notion واختر القاعدة من القائمة — يقترح النظام ربط الحقول والحالات تلقائيًا."
          action={
            <Button size="sm" asChild>
              <Link href="/notion/connect">
                <Plus /> ربط قاعدة بيانات
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-start">القاعدة</TableHead>
                <TableHead className="text-start">الاتصال</TableHead>
                {advanced && <TableHead className="text-start">معرّف Notion</TableHead>}
                <TableHead className="text-start">العناصر</TableHead>
                <TableHead className="text-start">المزامنة</TableHead>
                <TableHead className="text-start">الموظف الافتراضي</TableHead>
                <TableHead className="text-start">آخر مزامنة</TableHead>
                <TableHead className="text-start">الحالة</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {DATA_SOURCE_PURPOSES[s.purpose] ?? s.purpose}
                      {s.mappingsCount === 0 && <span className="ms-1 text-warning">· بدون ربط حقول</span>}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{s.connectionName}</TableCell>
                  {advanced && (
                    <TableCell>
                      <code dir="ltr" className="block max-w-40 truncate font-mono text-[11px] text-muted-foreground" title={`database: ${s.notionDatabaseId}\ndata source: ${s.notionDataSourceId}`}>
                        {s.notionDatabaseId}
                      </code>
                    </TableCell>
                  )}
                  <TableCell className="tabular-nums">{formatNumber(s.itemsCount)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {s.syncEnabled ? <StatusBadge tone="info">كل {formatNumber(s.syncIntervalMinutes)} د</StatusBadge> : <StatusBadge tone="neutral">يدوية فقط</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-sm">{s.defaultEmployeeName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{s.lastSyncedAt ? formatDateTimeAr(new Date(s.lastSyncedAt)) : "لم تُزامن"}</TableCell>
                  <TableCell>{s.isActive ? <StatusBadge tone="success">نشطة</StatusBadge> : <StatusBadge tone="blocked">معطلة</StatusBadge>}</TableCell>
                  <TableCell>
                    <RowActions
                      source={s}
                      onEdit={() => {
                        setEditing((e) => ({ source: s, key: (e?.key ?? 0) + 1 }));
                        setEditOpen(true);
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {wizard.key > 0 && (
        <AddDataSourceWizard key={wizard.key} open={wizard.open} onOpenChange={(v) => setWizard((w) => ({ ...w, open: v }))} connections={connections} employees={employees} />
      )}
      {editing && <EditDataSourceDialog key={editing.key} source={editing.source} open={editOpen} onOpenChange={setEditOpen} employees={employees} />}
    </>
  );
}
