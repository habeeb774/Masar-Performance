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
  | "templates";

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
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "مساحتي",
    items: [
      { href: "/dashboard", label: "لوحة التحكم", icon: "dashboard" },
      { href: "/my-tasks", label: "مهامي", icon: "tasks", requiresEmployee: true },
      { href: "/my-week", label: "أسبوعي", icon: "week", requiresEmployee: true },
      { href: "/my-month", label: "خطة الشهر", icon: "month", requiresEmployee: true },
      { href: "/my-goals", label: "أهدافي", icon: "goals", requiresEmployee: true },
      { href: "/my-reports", label: "تقاريري", icon: "reports", requiresEmployee: true },
      { href: "/my-performance", label: "أدائي", icon: "performance", requiresEmployee: true, anyOf: [PERMISSIONS.PERFORMANCE_VIEW_OWN] },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { href: "/review-center", label: "مركز المراجعة", icon: "reviewCenter", anyOf: [PERMISSIONS.REVIEW_CENTER] },
      { href: "/employees", label: "الموظفون", icon: "employees", anyOf: [PERMISSIONS.EMPLOYEES_VIEW_ALL, PERMISSIONS.EMPLOYEES_MANAGE] },
      { href: "/monthly-plans", label: "الخطط الشهرية", icon: "plans", anyOf: [PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE] },
      { href: "/weekly-plans", label: "الخطط الأسبوعية", icon: "weekly", anyOf: [PERMISSIONS.PLANS_MANAGE, PERMISSIONS.PLANS_APPROVE] },
      { href: "/goals", label: "قوالب الأهداف", icon: "templates", anyOf: [PERMISSIONS.GOAL_TEMPLATES_MANAGE] },
      { href: "/tasks", label: "المهام والتكليفات", icon: "allTasks", anyOf: [PERMISSIONS.TASKS_ASSIGN] },
      { href: "/reports/weekly", label: "التقارير الأسبوعية", icon: "weeklyReports", anyOf: [PERMISSIONS.REPORTS_REVIEW] },
      { href: "/reports/monthly", label: "التقارير الشهرية", icon: "monthlyReports", anyOf: [PERMISSIONS.REPORTS_REVIEW] },
    ],
  },
  {
    label: "الأداء",
    items: [
      { href: "/performance", label: "تحليلات الأداء", icon: "performance", anyOf: [PERMISSIONS.PERFORMANCE_REVIEW] },
      { href: "/performance/reviews", label: "التقييمات الشهرية", icon: "reviews", anyOf: [PERMISSIONS.PERFORMANCE_REVIEW, PERMISSIONS.PERFORMANCE_APPROVE] },
      { href: "/performance/kpis", label: "مؤشرات الأداء", icon: "kpis", anyOf: [PERMISSIONS.KPI_MANAGE, PERMISSIONS.PERFORMANCE_REVIEW] },
    ],
  },
  {
    label: "Notion",
    items: [
      { href: "/notion", label: "نظرة عامة", icon: "notion", anyOf: [PERMISSIONS.NOTION_MANAGE, PERMISSIONS.NOTION_SYNC] },
      { href: "/notion/connections", label: "الاتصالات", icon: "connections", anyOf: [PERMISSIONS.NOTION_MANAGE] },
      { href: "/notion/data-sources", label: "قواعد البيانات", icon: "dataSources", anyOf: [PERMISSIONS.NOTION_MANAGE] },
      { href: "/notion/mappings", label: "ربط الحقول والحالات", icon: "mappings", anyOf: [PERMISSIONS.NOTION_MANAGE] },
      { href: "/notion/sync-logs", label: "سجل المزامنة", icon: "syncLogs", anyOf: [PERMISSIONS.NOTION_MANAGE, PERMISSIONS.NOTION_SYNC] },
    ],
  },
  {
    label: "النظام",
    items: [
      { href: "/notifications", label: "الإشعارات", icon: "notifications" },
      {
        href: "/settings",
        label: "الإعدادات",
        icon: "settings",
        anyOf: [PERMISSIONS.ORG_MANAGE, PERMISSIONS.ROLES_MANAGE, PERMISSIONS.KPI_MANAGE, PERMISSIONS.RATING_SCALE_MANAGE, PERMISSIONS.USERS_MANAGE],
      },
      { href: "/audit-logs", label: "سجل التدقيق", icon: "audit", anyOf: [PERMISSIONS.AUDIT_VIEW] },
    ],
  },
];

export function visibleNav(permissions: ReadonlySet<string>, hasEmployee: boolean): NavGroup[] {
  const allowed = (item: NavItem) =>
    (!item.requiresEmployee || hasEmployee) &&
    (!item.anyOf || item.anyOf.length === 0 || permissions.has(PERMISSIONS.SYSTEM_ADMIN) || item.anyOf.some((k) => permissions.has(k)));
  return NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length > 0);
}
