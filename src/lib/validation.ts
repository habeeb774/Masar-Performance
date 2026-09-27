import { z } from "zod";
import { isDateKey } from "./dates";
import {
  GOAL_SOURCES,
  GOAL_TYPES,
  KPI_CATEGORIES,
  PRIORITIES,
  TASK_STATUSES,
} from "./labels";
import { notionFilterRuleSchema } from "./notion/filter-rule";
import { SYSTEM_STATUSES } from "./notion/status";
import { methodConfigSchema } from "./kpi/engine";

const msg = {
  required: "هذا الحقل مطلوب",
  short: "القيمة قصيرة جدًا",
  long: "القيمة طويلة جدًا",
};

export const idSchema = z.string().min(1).max(64);
export const dateKeySchema = z.string().refine(isDateKey, "تاريخ غير صالح");
export const optionalDateKey = z
  .union([dateKeySchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));
export const optionalText = (max = 2000) =>
  z
    .string()
    .max(max, msg.long)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));
export const nameSchema = z.string().trim().min(2, msg.short).max(200, msg.long);
export const optionalId = z
  .union([idSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

// ---- auth -------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح").max(200),
  password: z.string().min(1, msg.required).max(200),
});

export const passwordSchema = z
  .string()
  .min(10, "كلمة المرور يجب ألا تقل عن 10 أحرف")
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "يجب أن تحتوي كلمة المرور على أحرف وأرقام");

export const setupSchema = z
  .object({
    companyName: nameSchema,
    fullName: nameSchema,
    email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح").max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "كلمتا المرور غير متطابقتين", path: ["confirmPassword"] });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, msg.required),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "كلمتا المرور غير متطابقتين", path: ["confirmPassword"] });

// ---- organization -------------------------------------------------------------

export const companySchema = z.object({
  name: nameSchema,
  legalName: optionalText(200),
  timezone: z.string().min(1).max(64),
  weekStartDay: z.coerce.number().int().min(0).max(6),
  workDays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "اختر يوم عمل واحد على الأقل").max(7),
  planSubmissionDeadlineDay: z.coerce.number().int().min(1).max(28),
  weeklyReportDueDays: z.coerce.number().int().min(0).max(7),
});

export const departmentSchema = z.object({
  name: nameSchema,
  code: optionalText(40),
  type: z.enum(["ADMINISTRATION", "SECTION"]),
  parentId: optionalId,
  description: optionalText(1000),
  isActive: z.boolean().default(true),
});

export const jobTitleSchema = z.object({
  name: nameSchema,
  description: optionalText(1000),
  departmentId: optionalId,
  isActive: z.boolean().default(true),
});

export const employeeSchema = z.object({
  fullName: nameSchema,
  email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح").max(200),
  employeeNo: optionalText(40),
  phone: optionalText(30),
  roleId: idSchema,
  departmentId: optionalId,
  jobTitleId: optionalId,
  managerId: optionalId,
  hireDate: optionalDateKey,
  status: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]),
  notionUserId: optionalText(64),
  notionAlias: optionalText(120),
  password: z.union([passwordSchema, z.literal("")]).optional(),
});

export const roleSchema = z.object({
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,30}$/, "المفتاح بالإنجليزية الكبيرة بدون مسافات"),
  name: nameSchema,
  description: optionalText(500),
});

// ---- goals & plans --------------------------------------------------------------

const goalBase = z.object({
  name: nameSchema,
  /** «الواجب»; empty = grouped by category */
  dutyName: z.string().trim().max(120).nullish(),
  description: optionalText(2000),
  goalType: z.enum(GOAL_TYPES),
  targetValue: z.coerce.number().min(0, "لا يمكن أن يكون سالبًا").max(1_000_000_000),
  unit: z.string().trim().min(1, msg.required).max(40),
  weight: z.coerce.number().min(0).max(100, "الوزن لا يتجاوز 100"),
  priority: z.enum(PRIORITIES),
  source: z.enum(GOAL_SOURCES),
  category: z.enum(KPI_CATEGORIES),
  notionDataSourceId: optionalId,
  notionFilter: notionFilterRuleSchema.nullable().optional(),
});

const notionRequired = <T extends { source: string; notionDataSourceId: string | null; notionFilter?: unknown }>(d: T, ctx: z.RefinementCtx) => {
  if (d.source === "NOTION") {
    if (!d.notionDataSourceId) ctx.addIssue({ code: "custom", message: "اختر قاعدة Notion", path: ["notionDataSourceId"] });
    if (!d.notionFilter) ctx.addIssue({ code: "custom", message: "حدد قاعدة الفلترة من Notion", path: ["notionFilter"] });
  }
};

export const goalTemplateItemSchema = goalBase.extend({ id: z.string().optional() }).superRefine(notionRequired);

export const goalTemplateSchema = z.object({
  name: nameSchema,
  description: optionalText(1000),
  jobTitleId: optionalId,
  isActive: z.boolean().default(true),
  items: z.array(goalTemplateItemSchema).max(50),
});

export const monthlyGoalSchema = goalBase
  .extend({
    startDate: optionalDateKey,
    dueDate: optionalDateKey,
  })
  .superRefine(notionRequired)
  .superRefine((d, ctx) => {
    if (d.startDate && d.dueDate && d.dueDate < d.startDate) {
      ctx.addIssue({ code: "custom", message: "تاريخ التسليم قبل تاريخ البداية", path: ["dueDate"] });
    }
  });

export const createPlanSchema = z.object({
  employeeId: idSchema,
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  templateId: optionalId,
  /** false = start a blank plan even when the job title has an active template */
  useTemplate: z.boolean().default(true),
});

/** Quick team plan: just goal names and targets; everything else is inferred. */
export const teamPlanSchema = z.object({
  employeeId: idSchema,
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  goals: z
    .array(
      z.object({
        name: nameSchema,
        target: z.coerce.number().positive("المستهدف يجب أن يكون أكبر من صفر").max(1_000_000_000),
        unit: z.string().trim().min(1, msg.required).max(40),
        sourceId: z.string().max(60).nullable(),
      }),
    )
    .min(1, "أضف هدفًا واحدًا على الأقل")
    .max(30),
});

export const weeklyDistributionSchema = z.object({
  planId: idSchema,
  /** monthlyGoalId → weekIndex → target */
  targets: z.record(z.string(), z.record(z.string(), z.coerce.number().min(0).max(1_000_000_000))),
  varianceNote: optionalText(1000),
});

export const dailyDistributionSchema = z.object({
  weeklyPlanId: idSchema,
  /** weeklyGoalId → DateKey → target */
  targets: z.record(z.string(), z.record(z.string(), z.coerce.number().min(0).max(1_000_000_000))),
});

// ---- tasks -----------------------------------------------------------------------

export const dailyTaskSchema = z.object({
  title: nameSchema,
  description: optionalText(2000),
  date: dateKeySchema,
  deadline: optionalDateKey,
  target: z.coerce.number().min(0).max(1_000_000_000).default(0),
  achieved: z.coerce.number().min(0).max(1_000_000_000).default(0),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  monthlyGoalId: optionalId,
  notes: optionalText(2000),
  delayReason: optionalText(1000),
  employeeId: optionalId,
});

export const taskProgressSchema = z.object({
  status: z.enum(TASK_STATUSES),
  achieved: z.coerce.number().min(0).max(1_000_000_000).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  notes: optionalText(2000),
  delayReason: optionalText(1000),
});

export const adHocTaskSchema = z.object({
  employeeId: idSchema,
  title: nameSchema,
  description: optionalText(2000),
  assignedDate: dateKeySchema,
  dueDate: optionalDateKey,
  priority: z.enum(PRIORITIES),
  includeInEvaluation: z.boolean().default(true),
  weight: z.coerce.number().min(0).max(100).default(0),
  isOutOfPlan: z.boolean().default(true),
  compensatesGoalId: optionalId,
  notes: optionalText(2000),
});

// ---- reports ---------------------------------------------------------------------

export const reportNotesSchema = z.object({
  employeeNotes: optionalText(5000),
  highlights: optionalText(5000),
  blockers: optionalText(5000),
  carryOver: optionalText(5000),
});

export const reportReviewSchema = z.object({
  decision: z.enum(["APPROVE", "RETURN", "REVIEWED"]),
  comment: optionalText(5000),
});

// ---- KPI & performance -----------------------------------------------------------

export const kpiTemplateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9_]{1,40}$/, "الرمز بالإنجليزية الكبيرة بدون مسافات"),
    name: nameSchema,
    description: optionalText(1000),
    category: z.enum(KPI_CATEGORIES),
    unit: z.string().trim().min(1).max(20),
    defaultTarget: z.coerce.number().min(0).max(1_000_000_000),
    defaultWeight: z.coerce.number().min(0).max(100),
    calculationMethod: z.enum(["RATIO", "INVERSE_RATIO", "THRESHOLD_TABLE", "FORMULA", "MANUAL"]),
    methodConfig: methodConfigSchema.nullable().optional(),
    maxScore: z.coerce.number().positive().max(1000),
    sourceType: z.enum([
      "GOALS",
      "NOTION_APPROVAL_RATE",
      "NOTION_REVISION_RATE",
      "NOTION_COUNT",
      "PLAN_SUBMISSION_DELAY",
      "WEEKLY_PLANS_PREPARED",
      "WEEKLY_REPORTS_SUBMITTED",
      "MONTHLY_REPORT_SUBMITTED",
      "AD_HOC_COMPLETION",
      "DEADLINE_COMMITMENT",
      "MANUAL",
    ]),
    sourceConfig: z
      .object({
        category: z.enum(KPI_CATEGORIES).optional().nullable(),
        stageKey: z.string().max(40).optional().nullable(),
        onTimeOnly: z.boolean().optional(),
      })
      .partial()
      .nullable()
      .optional(),
    isAutomatic: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.calculationMethod === "FORMULA" && !d.methodConfig?.formula) {
      ctx.addIssue({ code: "custom", message: "اكتب المعادلة", path: ["methodConfig", "formula"] });
    }
    if (d.calculationMethod === "THRESHOLD_TABLE" && !(d.methodConfig?.rules && d.methodConfig.rules.length > 0)) {
      ctx.addIssue({ code: "custom", message: "أضف قاعدة واحدة على الأقل", path: ["methodConfig", "rules"] });
    }
  });

export const kpiAssignmentSchema = z.object({
  templateId: idSchema,
  jobTitleId: optionalId,
  weight: z.coerce.number().min(0).max(100),
  target: z.union([z.coerce.number().min(0), z.null()]).optional(),
  isActive: z.boolean().default(true),
});

export const reviewAdjustSchema = z.object({
  adjustment: z.coerce.number().min(-100).max(100),
  reason: z.string().trim().max(2000).optional().default(""),
  managerNotes: optionalText(5000),
  strengths: optionalText(5000),
  improvements: optionalText(5000),
}).superRefine((d, ctx) => {
  if (d.adjustment !== 0 && d.reason.length < 5) {
    ctx.addIssue({ code: "custom", message: "سبب التعديل اليدوي مطلوب", path: ["reason"] });
  }
});

export const kpiOverrideSchema = z.object({
  score: z.coerce.number().min(0).max(1000).nullable(),
  reason: z.string().trim().min(5, "سبب التعديل مطلوب").max(2000),
});

export const ratingScaleSchema = z.object({
  name: nameSchema,
  bands: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        minScore: z.coerce.number().min(0).max(100),
        maxScore: z.coerce.number().min(0).max(100),
        color: z.string().max(20),
      }),
    )
    .min(1)
    .max(20)
    .superRefine((bands, ctx) => {
      bands.forEach((b, i) => {
        if (b.maxScore < b.minScore) ctx.addIssue({ code: "custom", message: "الحد الأعلى أقل من الأدنى", path: [i, "maxScore"] });
      });
    }),
});

// ---- Notion ------------------------------------------------------------------------

export const notionConnectionSchema = z.object({
  name: nameSchema,
  token: z
    .string()
    .trim()
    .regex(/^(secret_|ntn_)[A-Za-z0-9]{20,}$/, "رمز Notion غير صالح (يبدأ بـ ntn_ أو secret_)")
    .optional()
    .or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const notionDataSourceSchema = z.object({
  connectionId: idSchema,
  name: nameSchema,
  purpose: z.string().min(1).max(40),
  notionDatabaseId: z.string().min(8).max(64),
  notionDataSourceId: z.string().min(8).max(64),
  syncEnabled: z.boolean().default(true),
  syncIntervalMinutes: z.coerce.number().int().min(5).max(24 * 60),
  defaultEmployeeId: optionalId,
  isActive: z.boolean().default(true),
});

export const fieldMappingSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["TITLE", "STATUS", "DATE", "BATCH", "PRODUCT_CODE", "EMPLOYEE", "TASK_TYPE", "TEXT", "NUMBER", "NOTES"]),
  notionProperty: z.string().min(1).max(200),
  notionPropertyType: z.string().min(1).max(40),
  stageKey: z
    .string()
    .trim()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, "مفتاح المرحلة بالإنجليزية بدون مسافات")
    .optional()
    .nullable()
    .or(z.literal("")),
  label: z.string().trim().min(1).max(120),
  ownerEmployeeId: optionalId,
  isActive: z.boolean().default(true),
});

export const fieldMappingsSchema = z
  .object({ dataSourceId: idSchema, mappings: z.array(fieldMappingSchema).max(60) })
  .superRefine((d, ctx) => {
    const keys = new Set<string>();
    d.mappings.forEach((m, i) => {
      if (m.role === "STATUS") {
        if (!m.stageKey) ctx.addIssue({ code: "custom", message: "مفتاح المرحلة مطلوب لحقول الحالة", path: ["mappings", i, "stageKey"] });
        else if (keys.has(m.stageKey)) ctx.addIssue({ code: "custom", message: "مفتاح مرحلة مكرر", path: ["mappings", i, "stageKey"] });
        else keys.add(m.stageKey);
      }
    });
  });

export const statusMappingsSchema = z.object({
  fieldMappingId: idSchema,
  rows: z
    .array(
      z.object({
        notionValue: z.string().min(1).max(200),
        systemStatus: z.enum(SYSTEM_STATUSES),
        precedence: z.coerce.number().int().min(0).max(1000).default(0),
      }),
    )
    .max(200),
});
