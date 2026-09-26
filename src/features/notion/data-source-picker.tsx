"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlParams } from "@/components/shared/url-filters";
import { cn } from "@/lib/utils";

/** Selects the data source bound to ?ds= (no "all" option). */
export function DataSourcePicker({ value, options, className }: { value: string; options: { value: string; label: string }[]; className?: string }) {
  const { set, pending } = useUrlParams();
  return (
    <Select value={value} onValueChange={(v) => set({ ds: v })}>
      <SelectTrigger className={cn("w-full sm:w-72", pending && "opacity-60", className)} aria-label="قاعدة البيانات">
        <SelectValue placeholder="اختر قاعدة البيانات" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
