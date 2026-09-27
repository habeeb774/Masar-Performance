import { hasPermission, PERMISSIONS, type PermissionKey, type PermissionSubject } from "@/lib/permissions";

export type SettingsIcon = "overview" | "company" | "departments" | "jobTitles" | "roles" | "permissions" | "kpis" | "ratingScale" | "users";

export interface SettingsSection {
  href: string;
  label: string;
  description: string;
  icon: SettingsIcon;
  anyOf: PermissionKey[];
}

/** Sub pages of /settings; each is shown only to users holding one of `anyOf`. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { href: "/settings/company", label: "بيانات الشركة", description: "الاسم، المنطقة الزمنية، أيام العمل ومواعيد التسليم", icon: "company", anyOf: [PERMISSIONS.ORG_MANAGE] },
  { href: "/settings/departments", label: "الإدارات والأقسام", description: "الهيكل التنظيمي: إدارات وأقسام تابعة لها", icon: "departments", anyOf: [PERMISSIONS.ORG_MANAGE] },
  { href: "/settings/job-titles", label: "المسميات الوظيفية", description: "المسميات وربطها بالإدارات وقوالب الأهداف والمؤشرات", icon: "jobTitles", anyOf: [PERMISSIONS.ORG_MANAGE] },
  { href: "/settings/roles", label: "الأدوار", description: "أدوار المستخدمين وصلاحيات كل دور", icon: "roles", anyOf: [PERMISSIONS.ROLES_MANAGE] },
  { href: "/settings/permissions", label: "مصفوفة الصلاحيات", description: "تعديل صلاحيات جميع الأدوار في جدول واحد", icon: "permissions", anyOf: [PERMISSIONS.ROLES_MANAGE] },
  { href: "/settings/kpi-templates", label: "مؤشرات الأداء", description: "قوالب مؤشرات الأداء وطرق حسابها وأوزانها", icon: "kpis", anyOf: [PERMISSIONS.KPI_MANAGE] },
  { href: "/settings/rating-scale", label: "سلم التقييم", description: "فئات التقدير (متميز، ممتاز، جيد جدا…) وحدود كل فئة", icon: "ratingScale", anyOf: [PERMISSIONS.RATING_SCALE_MANAGE] },
  { href: "/employees", label: "المستخدمون والموظفون", description: "حسابات الدخول، الأدوار، وإعادة تعيين كلمات المرور", icon: "users", anyOf: [PERMISSIONS.USERS_MANAGE] },
];

export const SETTINGS_ANY_OF: PermissionKey[] = [
  PERMISSIONS.ORG_MANAGE,
  PERMISSIONS.ROLES_MANAGE,
  PERMISSIONS.KPI_MANAGE,
  PERMISSIONS.RATING_SCALE_MANAGE,
  PERMISSIONS.USERS_MANAGE,
];

export function visibleSettingsSections(user: PermissionSubject): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => s.anyOf.some((k) => hasPermission(user, k)));
}
