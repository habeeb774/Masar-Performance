"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  BookCheck,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileBarChart,
  FileText,
  Gauge,
  GitMerge,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  Trophy,
  Users,
  Workflow,
  LayoutTemplate,
  type LucideIcon, NotebookPen, ChevronDown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NavGroup, NavIcon } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  tasks: ListTodo,
  goals: Target,
  week: CalendarDays,
  month: CalendarRange,
  reports: FileText,
  performance: Trophy,
  employees: Users,
  plans: ClipboardList,
  weekly: CalendarDays,
  allTasks: ListChecks,
  weeklyReports: FileText,
  monthlyReports: FileBarChart,
  reviews: BookCheck,
  kpis: Gauge,
  reviewCenter: ClipboardCheck,
  notion: Workflow,
  connections: Plug,
  dataSources: Database,
  mappings: GitMerge,
  syncLogs: Activity,
  notifications: Bell,
  settings: Settings,
  audit: ScrollText,
  templates: LayoutTemplate,
  reminders: NotebookPen,
};

export function AppSidebar({ groups, badges }: { groups: NavGroup[]; badges: Record<string, number> }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && (pathname.startsWith(`${href}/`) || (href === "/monthly-plans" && pathname.startsWith("/weekly-plans")) || (href === "/review-center" && pathname.startsWith("/reports"))));

  return (
    <Sidebar side="right" collapsible="icon" dir="rtl">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors duration-150 [transition-timing-function:var(--ease-press)] hover:bg-sidebar-accent/50 active:scale-[0.98]"
          onClick={() => setOpenMobile(false)}
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-black shadow-[var(--shadow-raised)]">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-full object-cover" priority />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-bold text-sidebar-foreground">مسار الأداء</span>
            <span className="block truncate text-[11px] text-sidebar-foreground/60">إدارة المتجر الإلكتروني</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => {
          const menu = (
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const badge = badges[item.href];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                      <Link href={item.href} onClick={() => setOpenMobile(false)}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge ? <SidebarMenuBadge className="bg-sidebar-primary text-sidebar-primary-foreground">{badge}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          );
          if (!group.collapsed) return <SidebarGroup key={group.label || "main"}>{menu}</SidebarGroup>;
          const open = group.items.some((i) => isActive(i.href));
          return (
            <SidebarGroup key={group.label} className="py-0">
              <details open={open || undefined} className="group/nav">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                  {group.label}
                  <ChevronDown className="size-3.5 transition-transform group-open/nav:rotate-180" />
                </summary>
                {menu}
              </details>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-sidebar-foreground/50 shadow-[var(--shadow-inset)] group-data-[collapsible=icon]:hidden">
          <ShieldCheck className="size-3.5 text-success" /> جلسة آمنة
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
