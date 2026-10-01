"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { EnumBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeAr } from "@/lib/dates";
import { REPORT_STATUS_LABELS } from "@/lib/labels";
import type { ReportListRow } from "@/server/queries/reports";

export function ReportListTable({ rows, showEmployee = true, emptyTitle = "لا توجد تقارير" }: { rows: ReportListRow[]; showEmployee?: boolean; emptyTitle?: string }) {
  const columns: ColumnDef<ReportListRow, unknown>[] = [
    ...(showEmployee
      ? [
          {
            accessorKey: "employeeName",
            header: "الموظف",
            enableSorting: true,
            cell: ({ row }) => (
              <Link href={row.original.href} className="font-medium whitespace-nowrap hover:underline">
                {row.original.employeeName}
              </Link>
            ),
          } satisfies ColumnDef<ReportListRow, unknown>,
        ]
      : []),
    {
      accessorKey: "period",
      header: "الفترة",
      cell: ({ row }) => (
        <Link href={row.original.href} className="block min-w-44 text-sm hover:underline">
          {row.original.period}
        </Link>
      ),
    },
    { accessorKey: "status", header: "الحالة", cell: ({ row }) => <EnumBadge map={REPORT_STATUS_LABELS} value={row.original.status} /> },
    {
      accessorKey: "progress",
      header: "الإنجاز الموزون",
      enableSorting: true,
      cell: ({ row }) =>
        row.original.progress === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="space-y-1">
            <ProgressBar value={row.original.progress} showLabel size="sm" className="w-36" />
            {row.original.progressUpdated && (
              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground" title="النسبة محسوبة من الإنجاز الحالي للأسبوع">
                {row.original.status === "DRAFT" || row.original.status === "RETURNED" ? "البيانات الحالية تختلف عن نسخة التقرير" : "تم تحديث الإنجاز بعد إرسال التقرير"}
              </Badge>
            )}
          </div>
        ),
    },
    {
      accessorKey: "submittedAt",
      header: "تاريخ الإرسال",
      enableSorting: true,
      cell: ({ row }) => <span className="text-xs whitespace-nowrap">{row.original.submittedAt ? formatDateTimeAr(new Date(row.original.submittedAt)) : "—"}</span>,
    },
    {
      accessorKey: "reviewedAt",
      header: "تاريخ المراجعة",
      cell: ({ row }) => <span className="text-xs whitespace-nowrap">{row.original.reviewedAt ? formatDateTimeAr(new Date(row.original.reviewedAt)) : "—"}</span>,
    },
    {
      id: "open",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" asChild>
          <Link href={row.original.href}>
            فتح <ArrowLeft />
          </Link>
        </Button>
      ),
    },
  ];
  return <DataTable columns={columns} data={rows} emptyTitle={emptyTitle} rowClassName={(r) => (r.status === "SUBMITTED" ? "bg-pending-soft/40" : undefined)} />;
}
