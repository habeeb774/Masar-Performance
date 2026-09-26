"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Plus, Target, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

const ITEMS = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/my-tasks", label: "مهامي", icon: ListChecks },
] as const;

const ITEMS_END = [{ href: "/my-plan", label: "خطتي", icon: Target }] as const;

/**
 * Fixed bottom navigation for small screens, shown only to users with an
 * employee profile (same gating as `requiresEmployee` in nav.ts). The "المزيد"
 * item reuses the existing mobile sidebar sheet instead of building a new one.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="التنقل السريع"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] transition-colors",
            isActive(href) ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}

      <Link
        href="/my-tasks"
        aria-label="إضافة سريعة"
        className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
      >
        <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-raised)] transition-transform duration-150 [transition-timing-function:var(--ease-press)] active:scale-95">
          <Plus className="size-5" />
        </span>
      </Link>

      {ITEMS_END.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] transition-colors",
            isActive(href) ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}

      <button
        type="button"
        aria-label="المزيد"
        onClick={() => setOpenMobile(true)}
        className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] text-muted-foreground"
      >
        <Menu className="size-5" />
        المزيد
      </button>
    </nav>
  );
}
