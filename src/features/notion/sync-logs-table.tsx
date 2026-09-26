"use client";

import { Fragment, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/page";
import { EnumBadge } from "@/components/shared/status-badge";
import { SYNC_STATUS_LABELS, SYNC_TRIGGER_LABELS } from "@/lib/labels";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { cn } from "@/lib/utils";
import { formatDuration } from "./labels";
import { RetrySyncButton } from "./sync-buttons";

export interface SyncLogRow {
  id: string;
  dataSourceName: string;
  trigger: "MANUAL" | "SCHEDULED" | "RETRY" | "FULL_RESYNC";
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  cursorFrom: string | null;
  cursorTo: string | null;
  recordsScanned: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorCount: number;
  errors: { pageId?: string; message: string }[];
  isRetry: boolean;
}

const dt = (iso: string | null) => (iso ? formatDateTimeAr(new Date(iso)) : "—");

export function SyncLogsTable({ rows, canRetry, filtered }: { rows: SyncLogRow[]; canRetry: boolean; filtered: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={filtered ? "لا توجد سجلات مطابقة" : "لا توجد عمليات مزامنة بعد"}
        description={filtered ? "غيّر عوامل التصفية لعرض سجلات أخرى." : "تظهر هنا كل عملية مزامنة يدوية أو مجدولة مع نتائجها وأخطائها."}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="text-start">القاعدة</TableHead>
            <TableHead className="text-start">النوع</TableHead>
            <TableHead className="text-start">الحالة</TableHead>
            <TableHead className="text-start">البدء</TableHead>
            <TableHead className="text-start">المدة</TableHead>
            <TableHead className="text-start">فُحص</TableHead>
            <TableHead className="text-start">جديد</TableHead>
            <TableHead className="text-start">محدّث</TableHead>
            <TableHead className="text-start">تُخطي</TableHead>
            <TableHead className="text-start">أخطاء</TableHead>
            <TableHead className="text-start">نطاق المؤشر</TableHead>
            <TableHead className="text-end" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((l) => {
            const expanded = open.has(l.id);
            const canExpand = l.errors.length > 0;
            return (
              <Fragment key={l.id}>
                <TableRow className={cn(l.status === "FAILED" && "bg-danger-soft/30")}>
                  <TableCell className="px-2">
                    {canExpand && (
                      <Button size="icon-xs" variant="ghost" onClick={() => toggle(l.id)} aria-expanded={expanded} aria-label="عرض الأخطاء">
                        <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{l.dataSourceName}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{SYNC_TRIGGER_LABELS[l.trigger]}</TableCell>
                  <TableCell>
                    <EnumBadge map={SYNC_STATUS_LABELS} value={l.status} />
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{dt(l.startTime)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap tabular-nums">{l.status === "RUNNING" ? "جارية…" : formatDuration(l.durationMs)}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(l.recordsScanned)}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(l.recordsCreated)}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(l.recordsUpdated)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatNumber(l.recordsSkipped)}</TableCell>
                  <TableCell>
                    {l.errorCount > 0 ? (
                      <button type="button" className="font-semibold text-danger tabular-nums hover:underline disabled:no-underline" onClick={() => toggle(l.id)} disabled={!canExpand}>
                        {formatNumber(l.errorCount)}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] whitespace-nowrap text-muted-foreground">
                    {l.cursorFrom || l.cursorTo ? (
                      <>
                        {dt(l.cursorFrom)} ← {dt(l.cursorTo)}
                      </>
                    ) : (
                      "من البداية"
                    )}
                  </TableCell>
                  <TableCell className="text-end">{canRetry && (l.status === "FAILED" || l.status === "PARTIAL") && <RetrySyncButton logId={l.id} />}</TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={13} className="bg-muted/30 p-3">
                      <p className="mb-2 text-xs font-semibold">
                        الأخطاء ({formatNumber(l.errors.length)}
                        {l.errorCount > l.errors.length ? ` من ${formatNumber(l.errorCount)}` : ""})
                      </p>
                      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                        {l.errors.map((e, i) => (
                          <li key={i} className="rounded-md border bg-card px-2.5 py-1.5 text-xs whitespace-normal">
                            {e.pageId && (
                              <a
                                href={`https://www.notion.so/${e.pageId.replace(/-/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                dir="ltr"
                                className="me-2 inline-block font-mono text-[11px] text-primary hover:underline"
                              >
                                {e.pageId}
                              </a>
                            )}
                            <span className="text-danger">{e.message}</span>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
