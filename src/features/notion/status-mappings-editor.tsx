"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useServerAction } from "@/hooks/use-server-action";
import { saveStatusMappingsAction } from "@/actions/notion";
import { NOTION_STATUS_LABELS } from "@/lib/labels";
import { DEFAULT_PRECEDENCE, SYSTEM_STATUSES, type SystemStatus } from "@/lib/notion/status";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS } from "./labels";

const NONE = "__none__";

export interface StatusFieldData {
  id: string;
  stageKey: string;
  label: string;
  notionProperty: string;
  notionPropertyType: string;
  isActive: boolean;
  propertyMissing: boolean;
  rows: { notionValue: string; systemStatus: SystemStatus | null; precedence: number; count: number; inSchema: boolean; color: string | null }[];
}

/** Notion option colors → a small swatch so admins recognise the option. */
const NOTION_COLORS: Record<string, string> = {
  default: "#9b9a97",
  gray: "#9b9a97",
  brown: "#a27763",
  orange: "#e3822f",
  yellow: "#dfab01",
  green: "#4d9f6e",
  blue: "#3a86c7",
  purple: "#9a6dd7",
  pink: "#e255a1",
  red: "#e5484d",
};

function StatusFieldEditor({ field }: { field: StatusFieldData }) {
  const router = useRouter();
  const [rows, setRows] = useState(field.rows);
  const [dirty, setDirty] = useState(false);
  const { run, pending } = useServerAction(saveStatusMappingsAction, { onSuccess: () => { setDirty(false); router.refresh(); } });
  const unmapped = rows.filter((r) => !r.systemStatus).length;
  const isMulti = field.notionPropertyType === "multi_select";

  const set = (i: number, patch: Partial<StatusFieldData["rows"][number]>) => {
    setDirty(true);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const submit = () =>
    run({
      fieldMappingId: field.id,
      rows: rows.filter((r) => r.systemStatus).map((r) => ({ notionValue: r.notionValue, systemStatus: r.systemStatus as SystemStatus, precedence: Math.max(0, Math.min(1000, Math.round(r.precedence) || 0)) })),
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          خاصية Notion: <span className="font-medium text-foreground">{field.notionProperty}</span> ({PROPERTY_TYPE_LABELS[field.notionPropertyType] ?? field.notionPropertyType})
        </span>
        <span dir="ltr" className="rounded bg-muted px-1.5 font-mono">
          {field.stageKey}
        </span>
        {!field.isActive && <StatusBadge tone="blocked">الحقل معطل</StatusBadge>}
        {field.propertyMissing && <StatusBadge tone="warning">الخاصية لم تعد موجودة في Notion</StatusBadge>}
        {unmapped > 0 && <StatusBadge tone="warning">{unmapped} قيمة بدون ربط</StatusBadge>}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="لا توجد قيم لهذه المرحلة بعد"
          description="لم يُعثر على خيارات معرفة في Notion ولا قيم في العناصر المتزامنة. حدّث خصائص القاعدة أو شغّل مزامنة ثم عد إلى هنا."
          className="py-6"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-start">القيمة في Notion</TableHead>
                <TableHead className="text-start">عدد العناصر</TableHead>
                <TableHead className="min-w-52 text-start">حالة النظام</TableHead>
                <TableHead className="text-start">الأولوية</TableHead>
                <TableHead className="text-start">المعاينة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.notionValue} className={cn(!r.systemStatus && "bg-warning-soft/40 hover:bg-warning-soft/60")}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: NOTION_COLORS[r.color ?? ""] ?? "transparent", border: r.color ? undefined : "1px dashed currentColor" }} aria-hidden />
                      <span className="font-medium">{r.notionValue}</span>
                      {!r.inSchema && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">من البيانات فقط</span>}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{r.count ? formatNumber(r.count) : <span className="text-muted-foreground">0</span>}</TableCell>
                  <TableCell>
                    <Select value={r.systemStatus ?? NONE} onValueChange={(v) => set(i, { systemStatus: v === NONE ? null : (v as SystemStatus) })}>
                      <SelectTrigger className={cn("w-full", !r.systemStatus && "border-warning/60")} size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— بدون ربط —</SelectItem>
                        {SYSTEM_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {NOTION_STATUS_LABELS[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      inputMode="numeric"
                      className="h-7 w-20 text-xs"
                      value={String(r.precedence)}
                      disabled={!r.systemStatus}
                      onChange={(e) => set(i, { precedence: Number(e.target.value) || 0 })}
                      aria-label="الأولوية"
                      title={r.systemStatus ? `0 = الافتراضي (${DEFAULT_PRECEDENCE[r.systemStatus]})` : undefined}
                    />
                  </TableCell>
                  <TableCell>
                    {r.systemStatus ? (
                      <EnumBadge map={NOTION_STATUS_LABELS} value={r.systemStatus} />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="size-3.5" /> تُعامل كـ «لم يبدأ»
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {isMulti
            ? "هذه الخاصية اختيار متعدد: عند وجود أكثر من قيمة في العنصر تُعتمد القيمة ذات الأولوية الأعلى. 0 = الأولوية الافتراضية حسب الحالة (المكتمل يغلب التعديل، والتعديل يغلب الانتظار)."
            : "الأولوية تُستخدم فقط عند وجود عدة قيم في اختيار متعدد — الأعلى يغلب. 0 = الافتراضي حسب الحالة."}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {dirty && <span className="text-xs text-warning">تغييرات غير محفوظة</span>}
          <Button onClick={submit} disabled={pending || rows.length === 0}>
            {pending ? <Spinner /> : <Save />} حفظ ربط الحالات
          </Button>
        </div>
      </div>
    </div>
  );
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function StatusMappingsEditor({ fields }: { fields: StatusFieldData[] }) {
  // deep link `#stage-<key>` (from the unmapped-values warning) selects that stage's tab
  const hashStage = useSyncExternalStore(
    subscribeHash,
    () => decodeURIComponent(window.location.hash.replace(/^#stage-/, "")),
    () => "",
  );
  const linkedStage = hashStage && fields.some((f) => f.stageKey === hashStage) ? hashStage : null;
  const [chosenTab, setTab] = useState<string | null>(null);
  const tab = chosenTab ?? linkedStage ?? fields[0]?.stageKey ?? "";

  useEffect(() => {
    if (linkedStage) document.getElementById("status-mappings")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [linkedStage]);

  if (fields.length === 0) {
    return <EmptyState title="لا توجد حقول حالة مربوطة" description="أضف حقلًا بدور «حالة مرحلة عمل» في ربط الحقول أعلاه واحفظه، ثم اربط قيمه هنا." className="py-8" />;
  }

  return (
    <Tabs value={tab} onValueChange={setTab} dir="rtl">
      <div className="overflow-x-auto pb-1">
        <TabsList className="h-auto flex-wrap">
          {fields.map((f) => {
            const n = f.rows.filter((r) => !r.systemStatus).length;
            return (
              <TabsTrigger key={f.id} value={f.stageKey} className="gap-1.5">
                {f.label}
                {n > 0 && <span className="grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-bold text-white">{n}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {fields.map((f) => (
        <TabsContent key={f.id} value={f.stageKey} className="pt-2">
          <StatusFieldEditor key={f.rows.map((r) => `${r.notionValue}:${r.systemStatus}:${r.precedence}`).join("|")} field={f} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
