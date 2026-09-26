import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Tabs driven by a URL search param (server-rendered links, no client state).
 * `base` holds the other params to preserve.
 */
export function UrlTabs({
  param,
  value,
  tabs,
  base = {},
  pathname,
  className,
}: {
  param: string;
  value: string;
  tabs: { value: string; label: string; count?: number; tone?: "danger" | "default" }[];
  base?: Record<string, string | undefined>;
  pathname: string;
  className?: string;
}) {
  const href = (v: string) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries(base)) if (val) qs.set(k, val);
    qs.set(param, v);
    return `${pathname}?${qs.toString()}`;
  };
  return (
    <nav className={cn("mb-4 flex w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 sm:w-fit", className)} aria-label="التبويبات">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Link
            key={t.value}
            href={href(t.value)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  t.tone === "danger" ? "bg-danger text-white" : "bg-foreground/10 text-foreground/70",
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
