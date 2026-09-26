"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_ICONS } from "./settings-icons";
import type { SettingsIcon } from "./settings-sections";

export interface SettingsNavItem {
  href: string;
  label: string;
  icon: SettingsIcon;
}

/** Secondary navigation: horizontal scrollable tabs on mobile, vertical list on desktop. */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/settings" ? pathname === "/settings" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="أقسام الإعدادات" className="-mx-3 overflow-x-auto px-3 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex w-max gap-1 border-b pb-2 lg:w-auto lg:flex-col lg:border-b-0 lg:pb-0">
        {items.map((item) => {
          const Icon = SETTINGS_ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
