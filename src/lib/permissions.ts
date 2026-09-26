/**
 * Permission catalog. Keys are stored in the `Permission` table and linked to
 * roles from /settings/roles — authorization decisions never rely on role names.
 */

export const PERMISSIONS = {
  // system
  SYSTEM_ADMIN: "system.admin",
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  ORG_MANAGE: "org.manage",
  AUDIT_VIEW: "audit.view",
  // people
  EMPLOYEES_VIEW_ALL: "employees.view_all",
  EMPLOYEES_MANAGE: "employees.manage",
  // configuration
  GOAL_TEMPLATES_MANAGE: "goal_templates.manage",
  KPI_MANAGE: "kpi.manage",
  RATING_SCALE_MANAGE: "rating_scale.manage",
  NOTION_MANAGE: "notion.manage",
  NOTION_SYNC: "notion.sync",
  // planning
  PLANS_MANAGE: "plans.manage",
  PLANS_APPROVE: "plans.approve",
  PLANS_DISTRIBUTE_OWN: "plans.distribute_own",
  // tasks
  TASKS_MANAGE_OWN: "tasks.manage_own",
  TASKS_ASSIGN: "tasks.assign",
  // reports
  REPORTS_SUBMIT_OWN: "reports.submit_own",
  REPORTS_REVIEW: "reports.review",
  // performance
  PERFORMANCE_VIEW_OWN: "performance.view_own",
  PERFORMANCE_REVIEW: "performance.review",
  PERFORMANCE_APPROVE: "performance.approve",
  REVIEW_CENTER: "review_center.access",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: { key: PermissionKey; name: string; group: string }[] = [
  { key: PERMISSIONS.SYSTEM_ADMIN, name: "إدارة النظام بالكامل", group: "النظام" },
  { key: PERMISSIONS.USERS_MANAGE, name: "إدارة المستخدمين", group: "النظام" },
  { key: PERMISSIONS.ROLES_MANAGE, name: "إدارة الأدوار والصلاحيات", group: "النظام" },
  { key: PERMISSIONS.ORG_MANAGE, name: "إدارة الشركة والإدارات والمسميات", group: "النظام" },
  { key: PERMISSIONS.AUDIT_VIEW, name: "عرض سجل التدقيق", group: "النظام" },
  { key: PERMISSIONS.EMPLOYEES_VIEW_ALL, name: "عرض جميع الموظفين وبياناتهم", group: "الموظفون" },
  { key: PERMISSIONS.EMPLOYEES_MANAGE, name: "إدارة الموظفين", group: "الموظفون" },
  { key: PERMISSIONS.GOAL_TEMPLATES_MANAGE, name: "إدارة قوالب الأهداف", group: "الإعدادات" },
  { key: PERMISSIONS.KPI_MANAGE, name: "إدارة مؤشرات الأداء", group: "الإعدادات" },
  { key: PERMISSIONS.RATING_SCALE_MANAGE, name: "إدارة سلم التقييم", group: "الإعدادات" },
  { key: PERMISSIONS.NOTION_MANAGE, name: "إعداد تكامل Notion", group: "Notion" },
  { key: PERMISSIONS.NOTION_SYNC, name: "تشغيل مزامنة Notion", group: "Notion" },
  { key: PERMISSIONS.PLANS_MANAGE, name: "إنشاء وتعديل خطط الموظفين", group: "التخطيط" },
  { key: PERMISSIONS.PLANS_APPROVE, name: "اعتماد الخطط", group: "التخطيط" },
  { key: PERMISSIONS.PLANS_DISTRIBUTE_OWN, name: "توزيع أهدافي على الأسابيع والأيام", group: "التخطيط" },
  { key: PERMISSIONS.TASKS_MANAGE_OWN, name: "إدارة مهامي", group: "المهام" },
  { key: PERMISSIONS.TASKS_ASSIGN, name: "تكليف مهام مستجدة", group: "المهام" },
  { key: PERMISSIONS.REPORTS_SUBMIT_OWN, name: "مراجعة وإرسال تقاريري", group: "التقارير" },
  { key: PERMISSIONS.REPORTS_REVIEW, name: "مراجعة واعتماد التقارير", group: "التقارير" },
  { key: PERMISSIONS.PERFORMANCE_VIEW_OWN, name: "عرض تقييمي", group: "الأداء" },
  { key: PERMISSIONS.PERFORMANCE_REVIEW, name: "إعداد التقييمات", group: "الأداء" },
  { key: PERMISSIONS.PERFORMANCE_APPROVE, name: "اعتماد التقييمات", group: "الأداء" },
  { key: PERMISSIONS.REVIEW_CENTER, name: "الوصول لمركز المراجعة", group: "الأداء" },
];

const ALL_KEYS = PERMISSION_CATALOG.map((p) => p.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<"ADMIN" | "MANAGER" | "EMPLOYEE", PermissionKey[]> = {
  ADMIN: ALL_KEYS,
  MANAGER: [
    PERMISSIONS.EMPLOYEES_VIEW_ALL,
    PERMISSIONS.GOAL_TEMPLATES_MANAGE,
    PERMISSIONS.NOTION_SYNC,
    PERMISSIONS.NOTION_MANAGE,
    PERMISSIONS.PLANS_MANAGE,
    PERMISSIONS.PLANS_APPROVE,
    PERMISSIONS.PLANS_DISTRIBUTE_OWN,
    PERMISSIONS.TASKS_MANAGE_OWN,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.REPORTS_REVIEW,
    PERMISSIONS.PERFORMANCE_REVIEW,
    PERMISSIONS.PERFORMANCE_APPROVE,
    PERMISSIONS.PERFORMANCE_VIEW_OWN,
    PERMISSIONS.REVIEW_CENTER,
    PERMISSIONS.AUDIT_VIEW,
  ],
  EMPLOYEE: [
    PERMISSIONS.PLANS_DISTRIBUTE_OWN,
    PERMISSIONS.TASKS_MANAGE_OWN,
    PERMISSIONS.REPORTS_SUBMIT_OWN,
    PERMISSIONS.PERFORMANCE_VIEW_OWN,
  ],
};

export interface PermissionSubject {
  permissions: ReadonlySet<string> | readonly string[];
}

/** Pure permission check — `system.admin` implies every permission. */
export function hasPermission(subject: PermissionSubject, key: PermissionKey): boolean {
  const set = subject.permissions;
  const has = (k: string) => (set instanceof Set ? set.has(k) : (set as readonly string[]).includes(k));
  return has(PERMISSIONS.SYSTEM_ADMIN) || has(key);
}

export function hasAnyPermission(subject: PermissionSubject, keys: PermissionKey[]): boolean {
  return keys.some((k) => hasPermission(subject, k));
}

/**
 * Employee data scope: who's data may this user read?
 * Returns `"ALL"` or the explicit list of employee ids (self + direct reports).
 */
export function employeeScope(
  subject: PermissionSubject & { employeeId: string | null; directReportIds: string[] },
): "ALL" | string[] {
  if (hasPermission(subject, PERMISSIONS.EMPLOYEES_VIEW_ALL)) return "ALL";
  const ids = [...subject.directReportIds];
  if (subject.employeeId) ids.unshift(subject.employeeId);
  return ids;
}

export function canAccessEmployee(
  subject: PermissionSubject & { employeeId: string | null; directReportIds: string[] },
  employeeId: string,
): boolean {
  const scope = employeeScope(subject);
  return scope === "ALL" || scope.includes(employeeId);
}
