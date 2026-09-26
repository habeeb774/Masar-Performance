"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { formatDateTimeAr } from "@/lib/dates";
import { formatNumber } from "@/lib/num";
import { PLAN_STATUS_LABELS, type PlanStatusKey } from "@/lib/labels";

export interface PlanListRow {
  id: string;
  employeeName: string;
  jobTitle: string | null;
  status: PlanStatusKey;
  goalsCount: number;
  totalWeight: number;
  progress: number;
  submittedAt: string | null;
  approvedAt: string | null;
  pendingWeeks: number;
}

const columns: ColumnDef<PlanListRow, unknown>[] = [
  {
    accessorKey: "employeeName",
    header: "الموظف",
    enableSorting: true,
    cell: ({ row }) => (
      <Link href={`/monthly-plans/${row.original.id}`} className="block min-w-36 hover:underline">
        <span className="block font-medium">{row.original.employeeName}</span>
        <span className="block text-xs text-muted-foreground">{row.original.jobTitle ?? "—"}</span>
      </Link>
    ),
  },
  {
    accessorKey: "status",
    header: "الحالة",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        <EnumBadge map={PLAN_STATUS_LABELS} value={row.original.status} />
        {row.original.pendingWeeks > 0 && <StatusBadge tone="pending">توزيع بانتظار الاعتماد</StatusBadge>}
      </div>
    ),
  },
  { accessorKey: "goalsCount", header: "الأهداف", enableSorting: true, cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.goalsCount)}</span> },
  {
    accessorKey: "totalWeight",
    header: "مجموع الأوزان",
    cell: ({ row }) => {
      const ok = Math.abs(row.original.totalWeight - 100) < 0.01;
      return (
        <StatusBadge tone={ok ? "success" : "warning"} dot={false}>
          {formatNumber(row.original.totalWeight, 2)}%
        </StatusBadge>
      );
    },
  },
  {
    accessorKey: "progress",
    header: "الإنجاز الموزون",
    enableSorting: true,
    cell: ({ row }) => <ProgressBar value={row.original.progress} showLabel size="sm" className="min-w-36" />,
  },
  {
    accessorKey: "submittedAt",
    header: "الإرسال",
    cell: ({ row }) => <span className="text-xs whitespace-nowrap">{row.original.submittedAt ? formatDateTimeAr(new Date(row.original.submittedAt)) : "—"}</span>,
  },
  {
    accessorKey: "approvedAt",
    header: "الاعتماد",
    cell: ({ row }) => <span className="text-xs whitespace-nowrap">{row.original.approvedAt ? formatDateTimeAr(new Date(row.original.approvedAt)) : "—"}</span>,
  },
  {
    id: "open",
    header: "",
    cell: ({ row }) => (
      <Button variant="ghost" size="icon-sm" asChild>
        <Link href={`/monthly-plans/${row.original.id}`} aria-label="فتح الخطة">
          <ArrowLeft />
        </Link>
      </Button>
    ),
  },
];

export function PlansTable({ rows }: { rows: PlanListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyTitle="لا توجد خطط مطابقة"
      emptyDescription="غيّر الفلاتر أو أنشئ خططًا للموظفين من القائمة أدناه."
      rowClassName={(r) => (r.status === "SUBMITTED" || r.pendingWeeks > 0 ? "bg-pending-soft/30" : undefined)}
    />
  );
}
