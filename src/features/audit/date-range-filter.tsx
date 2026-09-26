"use client";

import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUrlParams } from "@/components/shared/url-filters";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD bound date inputs. */
export function DateRangeFilter() {
  const { params, set } = useUrlParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return (
    <div className="flex items-center gap-1.5">
      <Input type="date" value={from} max={to || undefined} onChange={(e) => set({ from: e.target.value || null })} aria-label="من تاريخ" className="w-full sm:w-38" />
      <span className="text-xs text-muted-foreground">إلى</span>
      <Input type="date" value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value || null })} aria-label="إلى تاريخ" className="w-full sm:w-38" />
      {(from || to) && (
        <Button variant="ghost" size="icon-sm" onClick={() => set({ from: null, to: null })} aria-label="مسح نطاق التاريخ">
          <X />
        </Button>
      )}
    </div>
  );
}
