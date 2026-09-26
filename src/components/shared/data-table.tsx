"use client";

import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState } from "./page";

/**
 * Thin TanStack Table wrapper. Filtering & pagination are server-side (URL
 * params); sorting is client-side within the current page.
 */
export function DataTable<T>({
  columns,
  data,
  emptyTitle = "لا توجد بيانات",
  emptyDescription,
  className,
  rowClassName,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <Table>
        <TableHeader className="bg-muted/40">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((header) => (
                <TableHead key={header.id} className="h-10 text-start text-xs font-semibold text-muted-foreground">
                  {header.isPlaceholder ? null : header.column.getCanSort() && header.column.columnDef.enableSorting ? (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <ArrowDownUp className="size-3" />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className={rowClassName?.(row.original)}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-2.5 text-start">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
