"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useUrlParams } from "./url-filters";
import { cn } from "@/lib/utils";

export interface FilterChipDef {
  /** URL param this chip clears when removed. */
  param: string;
  label: string;
}

/**
 * A "فلترة" trigger (badge = active filter count) opening a side sheet with
 * arbitrary filter controls, plus removable chips for the currently-active
 * filters. Both read/write the same `useUrlParams` URL state as the rest of
 * the app's filter components (SelectFilter, SearchInput, DateRangeFilter…).
 */
export function FilterDrawer({
  title = "الفلاتر",
  chips,
  children,
  className,
  drawerOnly = false,
}: {
  title?: string;
  chips: FilterChipDef[];
  children: React.ReactNode;
  className?: string;
  /** Hide the always-visible desktop row and force the drawer everywhere. */
  drawerOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { set } = useUrlParams();
  const activeCount = chips.length;

  const clearAll = () => {
    const patch: Record<string, null> = {};
    for (const c of chips) patch[c.param] = null;
    set(patch);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="relative" onClick={() => setOpen(true)}>
          <Filter /> فلترة
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -end-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
        {!drawerOnly && <div className="hidden flex-wrap items-center gap-2 sm:flex">{children}</div>}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <button
                key={c.param}
                type="button"
                onClick={() => set({ [c.param]: null })}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-inset)] transition-colors hover:bg-danger-soft hover:text-danger"
              >
                {c.label} <X className="size-3" />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="text-xs text-muted-foreground underline hover:text-foreground">
              مسح الكل
            </button>
          </div>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>حدّد الفلاتر ثم اضغط تطبيق</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4">{children}</div>
          <SheetFooter className="flex-row justify-between">
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={activeCount === 0}>
              مسح الكل
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              تطبيق
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
