import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { requestMeta, type AuthUser } from "@/server/auth/session";

type Json = Prisma.InputJsonValue;

function toJson(value: unknown): Json | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (v && typeof v === "object" && "toNumber" in v && typeof v.toNumber === "function") return v.toNumber();
      if (typeof v === "bigint") return Number(v);
      if (v instanceof Uint8Array) return `[${v.length} bytes]`;
      return v;
    }),
  ) as Json;
}

/** Only keep keys whose values differ, so audit rows stay small and readable. */
export function diffObjects(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined) {
  if (!before || !after) return { before, after };
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const norm = (v: unknown) => JSON.stringify(toJson(v) ?? null);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "updatedAt") continue;
    if (norm(before[key]) !== norm(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

export interface AuditInput {
  user: AuthUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  diff?: boolean;
}

export async function audit(input: AuditInput, tx: Prisma.TransactionClient | typeof db = db) {
  let meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null };
  try {
    meta = await requestMeta();
  } catch {
    // outside a request (cron / scripts)
  }
  let before = input.before;
  let after = input.after;
  if (input.diff && before && after && typeof before === "object" && typeof after === "object") {
    const d = diffObjects(before as Record<string, unknown>, after as Record<string, unknown>);
    before = d.before;
    after = d.after;
  }
  await tx.auditLog.create({
    data: {
      userId: input.user?.id ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: toJson(before),
      after: toJson(after),
      reason: input.reason ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "تسجيل دخول",
  "auth.logout": "تسجيل خروج",
  "auth.login_failed": "محاولة دخول فاشلة",
  "user.create": "إنشاء مستخدم",
  "user.update": "تعديل مستخدم",
  "user.reset_password": "إعادة تعيين كلمة المرور",
  "role.update_permissions": "تعديل صلاحيات دور",
  "role.create": "إنشاء دور",
  "employee.create": "إضافة موظف",
  "employee.update": "تعديل موظف",
  "department.create": "إضافة إدارة/قسم",
  "department.update": "تعديل إدارة/قسم",
  "department.delete": "حذف إدارة/قسم",
  "job_title.create": "إضافة مسمى وظيفي",
  "job_title.update": "تعديل مسمى وظيفي",
  "job_title.delete": "حذف مسمى وظيفي",
  "company.update": "تعديل بيانات الشركة",
  "goal_template.create": "إنشاء قالب أهداف",
  "goal_template.update": "تعديل قالب أهداف",
  "goal_template.delete": "حذف قالب أهداف",
  "plan.create": "إنشاء خطة شهرية",
  "plan.submit": "إرسال خطة للاعتماد",
  "plan.approve": "اعتماد خطة",
  "plan.return": "إعادة خطة",
  "plan.status": "تغيير حالة خطة",
  "goal.create": "إضافة هدف",
  "goal.update": "تعديل هدف",
  "goal.delete": "حذف هدف",
  "weekly.distribute": "توزيع أسبوعي",
  "weekly.variance_approve": "اعتماد فرق التوزيع",
  "daily.distribute": "توزيع يومي",
  "task.create": "إضافة مهمة",
  "task.update": "تعديل مهمة",
  "task.delete": "حذف مهمة",
  "adhoc.create": "تكليف جديد",
  "adhoc.update": "تعديل تكليف",
  "adhoc.delete": "حذف تكليف",
  "report.weekly.update": "تعديل تقرير أسبوعي",
  "report.weekly.status": "تغيير حالة تقرير أسبوعي",
  "report.monthly.update": "تعديل تقرير شهري",
  "report.monthly.status": "تغيير حالة تقرير شهري",
  "kpi_template.create": "إنشاء مؤشر",
  "kpi_template.update": "تعديل مؤشر",
  "kpi.assign": "ربط مؤشر بوظيفة",
  "kpi.unassign": "إلغاء ربط مؤشر",
  "kpi_result.override": "تعديل نتيجة مؤشر",
  "review.calculate": "حساب التقييم",
  "review.adjust": "تعديل يدوي على التقييم",
  "review.approve": "اعتماد التقييم",
  "rating_scale.update": "تعديل سلم التقييم",
  "notion.connection.create": "إضافة اتصال Notion",
  "notion.connection.update": "تعديل اتصال Notion",
  "notion.connection.delete": "حذف اتصال Notion",
  "notion.data_source.create": "إضافة قاعدة Notion",
  "notion.data_source.update": "تعديل قاعدة Notion",
  "notion.data_source.delete": "حذف قاعدة Notion",
  "notion.mapping.update": "تعديل ربط حقول Notion",
  "notion.status_mapping.update": "تعديل ربط حالات Notion",
  "notion.sync": "تشغيل مزامنة Notion",
  "attachment.upload": "رفع مرفق",
  "attachment.delete": "حذف مرفق",
  "setup.complete": "إعداد النظام لأول مرة",
};
