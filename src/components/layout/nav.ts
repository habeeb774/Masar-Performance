import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

export type NavIcon =
  | "dashboard"
  | "tasks"
  | "goals"
  | "week"
  | "month"
  | "reports"
  | "performance"
  | "employees"
  | "plans"
  | "weekly"
  | "allTasks"
  | "weeklyReports"
  | "monthlyReports"
  | "reviews"
  | "kpis"
  | "reviewCenter"
  | "notion"
  | "connections"
  | "dataSources"
  | "mappings"
  | "syncLogs"
  | "notifications"
  | "settings"
  | "audit"
  | "templates"
  | "reminders";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** any of these permissions shows the item; empty = everyone */
  anyOf?: PermissionKey[];
  requiresEmployee?: boolean;
}

export interface NavGroup {
  label: string;
  /** rendered as a closed section unless one of its pages is open */
  collapsed?: boolean;
  items: NavItem[];
}

const TEAM = [PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE, PERMISSIONS.TASKS_ASSIGN, PERMISSIONS.EMPLOYEES_VIEW_ALL, PERMISSIONS.PERFORMANCE_REVIEW];

/** Few top-level items; everything secondary sits in a collapsed section. */
export const NAV: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/dashboard", label: "الرئيسية", icon: "dashboard" },
      { href: "/my-tasks", label: "مهامي", icon: "tasks", requiresEmployee: true },
      { href: "/my-plan", label: "خطتي", icon: "month", requiresEmployee: true },
      { href: "/team", label: "الفريق", icon: "employees", anyOf: TEAM },
      { href: "/review-center", label: "بانتظارك", icon: "reviewCenter", anyOf: [PERMISSIONS.REVIEW_CENTER] },
    ],
  },
  {
    label: "الفريق",
    collapsed: true,
    items: [
      { href: "/monthly-plans", label: "خطة الفريق", icon: "plans", anyOf: [PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE] },
      { href: "/tasks", label: "مهام الفريق", icon: "allTasks", anyOf: [PERMISSIONS.TASKS_ASSIGN] },
      { href: "/performance", label: "أداء الفريق", icon: "kpis", anyOf: [PERMISSIONS.PERFORMANCE_REVIEW, PERMISSIONS.PERFORMANCE_APPROVE, PERMISSIONS.KPI_MANAGE] },
      { href: "/employees", label: "الموظفون", icon: "employees", anyOf: [PERMISSIONS.EMPLOYEES_VIEW_ALL, PERMISSIONS.EMPLOYEES_MANAGE] },
    ],
  },
  {
    label: "المزيد",
    collapsed: true,
    items: [
      { href: "/my-reports", label: "تقاريري", icon: "reports", requiresEmployee: true },
      { href: "/my-performance", label: "أدائي", icon: "performance", requiresEmployee: true, anyOf: [PERMISSIONS.PERFORMANCE_VIEW_OWN] },
      { href: "/reminders", label: "ملاحظات وتذكيرات", icon: "reminders" },
    ],
  },
  {
    label: "الإدارة",
    collapsed: true,
    items: [
      { href: "/goals", label: "القوالب", icon: "templates", anyOf: [PERMISSIONS.GOAL_TEMPLATES_MANAGE] },
      {
        href: "/settings",
        label: "الإعدادات والصلاحيات",
        icon: "settings",
        anyOf: [PERMISSIONS.ORG_MANAGE, PERMISSIONS.ROLES_MANAGE, PERMISSIONS.KPI_MANAGE, PERMISSIONS.RATING_SCALE_MANAGE, PERMISSIONS.USERS_MANAGE],
      },
      { href: "/notion", label: "Notion", icon: "notion", anyOf: [PERMISSIONS.NOTION_MANAGE, PERMISSIONS.NOTION_SYNC] },
      { href: "/audit-logs", label: "سجل النشاط", icon: "audit", anyOf: [PERMISSIONS.AUDIT_VIEW] },
    ],
  },
];

export function visibleNav(permissions: ReadonlySet<string>, hasEmployee: boolean): NavGroup[] {
  const allowed = (item: NavItem) =>
    (!item.requiresEmployee || hasEmployee) &&
    (!item.anyOf || item.anyOf.length === 0 || permissions.has(PERMISSIONS.SYSTEM_ADMIN) || item.anyOf.some((k) => permissions.has(k)));
  return NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length > 0);
}
