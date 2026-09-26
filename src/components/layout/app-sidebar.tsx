"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
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
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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
};

export function AppSidebar({ groups, badges }: { groups: NavGroup[]; badges: Record<string, number> }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && href !== "/notion" && href !== "/performance" && pathname.startsWith(`${href}/`));

  return (
    <Sidebar side="right" collapsible="icon" dir="rtl">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-1 py-1.5" onClick={() => setOpenMobile(false)}>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BarChart3 className="size-4" />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-bold text-white">مركز الإدارة والتقييم</span>
            <span className="block truncate text-[11px] text-sidebar-foreground/60">إدارة المتجر الإلكتروني</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/50">{group.label}</SidebarGroupLabel>
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
                    {badge ? <SidebarMenuBadge className="bg-sidebar-primary/25 text-white">{badge}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          <ShieldCheck className="size-3.5" /> جلسة آمنة
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
