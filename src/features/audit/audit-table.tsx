"use client";

import { useState } from "react";
import { Bot, ChevronLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { KeyValue } from "@/components/shared/page";
import { AuditDiff } from "./audit-diff";
import type { JsonValue } from "./redact";

export interface AuditRow {
  id: string;
  createdAt: string;
  time: string;
  userName: string | null;
  userEmail: string | null;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  before: JsonValue;
  after: JsonValue;
}

function UserCell({ row }: { row: AuditRow }) {
  if (!row.userName)
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Bot className="size-3.5" /> النظام
      </span>
    );
  return <span className="font-medium">{row.userName}</span>;
}

export function AuditTable({ rows, timezone }: { rows: AuditRow[]; timezone: string }) {
  const [selected, setSelected] = useState<AuditRow | null>(null);
  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-start text-xs">الوقت</TableHead>
              <TableHead className="text-start text-xs">المستخدم</TableHead>
              <TableHead className="text-start text-xs">الإجراء</TableHead>
              <TableHead className="text-start text-xs">الكيان</TableHead>
              <TableHead className="text-start text-xs">المعرّف</TableHead>
              <TableHead className="text-start text-xs">السبب</TableHead>
              <TableHead className="text-start text-xs">IP</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                tabIndex={0}
                role="button"
                aria-label={`تفاصيل: ${r.actionLabel}`}
                className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
                onClick={() => setSelected(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(r);
                  }
                }}
              >
                <TableCell className="py-2.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{r.time}</TableCell>
                <TableCell className="py-2.5 text-sm whitespace-nowrap">
                  <UserCell row={r} />
                </TableCell>
                <TableCell className="py-2.5">
                  <span className="block text-sm whitespace-nowrap">{r.actionLabel}</span>
                  {r.actionLabel !== r.action && (
                    <span className="block font-mono text-[10px] text-muted-foreground" dir="ltr">
                      {r.action}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-2.5 font-mono text-xs" dir="ltr">
                  {r.entityType}
                </TableCell>
                <TableCell className="max-w-32 truncate py-2.5 font-mono text-xs text-muted-foreground" dir="ltr" title={r.entityId ?? undefined}>
                  {r.entityId ?? "—"}
                </TableCell>
                <TableCell className="max-w-48 truncate py-2.5 text-xs" title={r.reason ?? undefined}>
                  {r.reason ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="py-2.5 font-mono text-xs text-muted-foreground" dir="ltr">
                  {r.ip ?? "—"}
                </TableCell>
                <TableCell className="py-2.5">
                  <ChevronLeft className="size-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="left" className="w-full overflow-y-auto data-[side=left]:w-full data-[side=left]:sm:max-w-2xl">
          {selected && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{selected.actionLabel}</SheetTitle>
                <SheetDescription>
                  <span className="font-mono" dir="ltr">
                    {selected.action}
                  </span>{" "}
                  — {selected.time}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <div className="divide-y rounded-lg border px-3">
                  <KeyValue label="المستخدم">
                    {selected.userName ? (
                      <>
                        {selected.userName}
                        {selected.userEmail && (
                          <span className="block text-xs font-normal text-muted-foreground" dir="ltr">
                            {selected.userEmail}
                          </span>
                        )}
                      </>
                    ) : (
                      "النظام"
                    )}
                  </KeyValue>
                  <KeyValue label="نوع الكيان">
                    <span className="font-mono text-xs" dir="ltr">
                      {selected.entityType}
                    </span>
                  </KeyValue>
                  <KeyValue label="المعرّف">
                    <span className="font-mono text-xs break-all" dir="ltr">
                      {selected.entityId ?? "—"}
                    </span>
                  </KeyValue>
                  <KeyValue label="السبب">{selected.reason ?? "—"}</KeyValue>
                  <KeyValue label="عنوان IP">
                    <span className="font-mono text-xs" dir="ltr">
                      {selected.ip ?? "—"}
                    </span>
                  </KeyValue>
                  {selected.userAgent && (
                    <div className="py-1.5 text-sm">
                      <span className="text-muted-foreground">المتصفح</span>
                      <p className="mt-0.5 font-mono text-[11px] break-all text-muted-foreground" dir="ltr">
                        {selected.userAgent}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">التغييرات</h3>
                  <AuditDiff before={selected.before} after={selected.after} tz={timezone} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
