"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AR_MONTH_NAMES } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null | undefined>, opts: { resetPage?: boolean } = { resetPage: true }) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    if (opts.resetPage && !("page" in patch)) next.delete("page");
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, set, pending };
}

export function SearchInput({ placeholder = "بحث…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { params, set } = useUrlParams();
  const [value, setValue] = useState(params.get(param) ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get(param) ?? "") !== value) set({ [param]: value.trim() || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="ps-8 pe-8" aria-label={placeholder} />
      {value && (
        <button type="button" onClick={() => setValue("")} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="مسح">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function SelectFilter({
  param,
  options,
  placeholder,
  allLabel = "الكل",
  className,
}: {
  param: string;
  options: { value: string; label: string }[];
  placeholder: string;
  allLabel?: string;
  className?: string;
}) {
  const { params, set } = useUrlParams();
  return (
    <Select value={params.get(param) ?? "all"} onValueChange={(v) => set({ [param]: v })}>
      <SelectTrigger className={cn("w-full sm:w-44", className)} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Month navigator bound to ?year=&month= */
export function MonthPicker({ year, month }: { year: number; month: number }) {
  const { set } = useUrlParams();
  const go = (delta: number) => {
    const idx = year * 12 + (month - 1) + delta;
    set({ year: String(Math.floor(idx / 12)), month: String((idx % 12) + 1) });
  };
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
      <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} aria-label="الشهر السابق">
        <ChevronRight />
      </Button>
      <span className="min-w-28 text-center text-sm font-medium">
        {AR_MONTH_NAMES[month - 1]} {year}
      </span>
      <Button variant="ghost" size="icon-sm" onClick={() => go(1)} aria-label="الشهر التالي">
        <ChevronLeft />
      </Button>
    </div>
  );
}

export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { set, pending } = useUrlParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total > 0 ? <p className="px-1 pt-3 text-xs text-muted-foreground">{total} سجل</p> : null;
  return (
    <div className={cn("flex items-center justify-between gap-2 px-1 pt-3", pending && "opacity-60")}>
      <p className="text-xs text-muted-foreground">
        صفحة {page} من {pages} — {total} سجل
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, { resetPage: false })}>
          <ChevronRight /> السابق
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => set({ page: String(page + 1) }, { resetPage: false })}>
          التالي <ChevronLeft />
        </Button>
      </div>
    </div>
  );
}

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>{children}</div>;
}
