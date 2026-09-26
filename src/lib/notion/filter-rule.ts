import { z } from "zod";
import { SYSTEM_STATUSES } from "./status";

export const filterConditionSchema = z.object({
  field: z.enum(["batch", "productCode", "taskType", "property"]),
  /** Notion property name when field = "property" */
  property: z.string().optional(),
  op: z.enum(["eq", "neq", "in", "not_in", "gte", "lte", "contains", "is_empty", "not_empty"]),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

export const notionFilterRuleSchema = z.object({
  /** workflow stage whose status defines progress */
  stageKey: z.string().min(1),
  completedStatuses: z.array(z.enum(SYSTEM_STATUSES)).default(["COMPLETED"]),
  /** explicit Notion values counted as completed — overrides completedStatuses when set */
  completedRawValues: z.array(z.string()).default([]),
  conditions: z.array(filterConditionSchema).default([]),
  /** which date decides whether an item belongs to the period */
  dateBasis: z.enum(["STAGE_CHANGED", "ITEM_DATE", "CREATED", "LAST_EDITED", "NONE"]).default("STAGE_CHANGED"),
  /** only count items attributed to the goal's employee */
  matchEmployee: z.boolean().default(false),
});

export type FilterCondition = z.infer<typeof filterConditionSchema>;
export type NotionFilterRule = z.infer<typeof notionFilterRuleSchema>;

export function parseFilterRule(value: unknown): NotionFilterRule | null {
  if (!value || typeof value !== "object") return null;
  const parsed = notionFilterRuleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const DATE_BASIS_LABELS: Record<NotionFilterRule["dateBasis"], string> = {
  STAGE_CHANGED: "تاريخ تغيّر حالة المرحلة",
  ITEM_DATE: "حقل التاريخ المربوط",
  CREATED: "تاريخ إنشاء الصفحة",
  LAST_EDITED: "آخر تعديل",
  NONE: "بدون فلترة زمنية",
};

export const CONDITION_OP_LABELS: Record<FilterCondition["op"], string> = {
  eq: "يساوي",
  neq: "لا يساوي",
  in: "ضمن",
  not_in: "ليس ضمن",
  gte: "أكبر أو يساوي",
  lte: "أصغر أو يساوي",
  contains: "يحتوي",
  is_empty: "فارغ",
  not_empty: "غير فارغ",
};
