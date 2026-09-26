import type { SystemStatus } from "./status";

/**
 * Suggested mappings for the store's "قاعدة بيانات إضافة المنتجات للمتجر".
 * Used by the "auto-map" button — every value remains editable afterwards and
 * nothing in the engine depends on these names.
 */

export interface PresetField {
  property: string;
  role: "TITLE" | "STATUS" | "DATE" | "BATCH" | "PRODUCT_CODE" | "EMPLOYEE" | "TASK_TYPE" | "TEXT" | "NUMBER";
  label: string;
  stageKey?: string;
  statuses?: { value: string; status: SystemStatus; precedence?: number }[];
}

export const PRODUCTS_PRESET: PresetField[] = [
  { property: "المسمى في النظام", role: "TITLE", label: "المسمى في النظام" },
  { property: "الدفعة", role: "BATCH", label: "الدفعة" },
  { property: "كود المنتج", role: "PRODUCT_CODE", label: "كود المنتج" },
  { property: "تاريخ الإضافة", role: "DATE", label: "تاريخ الإضافة" },
  { property: "المسمى في المتجر", role: "TEXT", label: "المسمى في المتجر" },
  {
    property: "اعتماد الصور",
    role: "STATUS",
    stageKey: "images",
    label: "اعتماد الصور",
    statuses: [
      { value: "تم الرفع بدون اعتماد", status: "PENDING_APPROVAL" },
      { value: "يحتاج إلى اعتماد", status: "PENDING_APPROVAL" },
      { value: "معتمد", status: "COMPLETED" },
      { value: "تحتاج إلى تحسين", status: "NEEDS_REVISION" },
      { value: "تم التعديل", status: "IN_PROGRESS_AFTER_REVISION" },
      { value: "معلق", status: "BLOCKED" },
    ],
  },
  {
    property: "اعتماد صورة المنتج",
    role: "STATUS",
    stageKey: "productImage",
    label: "اعتماد صورة المنتج",
    statuses: [
      { value: "اعتماد أولي", status: "PENDING_APPROVAL" },
      { value: "تحتاج إلى تحسين", status: "NEEDS_REVISION" },
      { value: "تم التحسين", status: "IN_PROGRESS_AFTER_REVISION" },
      { value: "اعتماد نهائي", status: "COMPLETED" },
    ],
  },
  {
    property: "اعتماد للإضافة",
    role: "STATUS",
    stageKey: "approval",
    label: "اعتماد للإضافة",
    statuses: [
      { value: "معتمد", status: "COMPLETED" },
      { value: "غير معتمد", status: "CANCELLED" },
    ],
  },
  {
    property: "الإضافة للمتجر",
    role: "STATUS",
    stageKey: "store",
    label: "الإضافة للمتجر",
    statuses: [
      { value: "يحتاج اضافة", status: "NOT_STARTED" },
      { value: "مضاف ومخفي", status: "PENDING_APPROVAL" },
      { value: "تم الإضافة", status: "COMPLETED" },
      { value: "مضاف نهائي", status: "COMPLETED" },
      { value: "تم الدمج", status: "COMPLETED" },
      { value: "مضاف مسبقاً", status: "NOT_APPLICABLE" },
    ],
  },
  {
    property: "كتابة المحتوى",
    role: "STATUS",
    stageKey: "content",
    label: "كتابة المحتوى",
    statuses: [
      { value: "تم كتابة الوصف الفني", status: "IN_PROGRESS" },
      { value: "تم كتابة المحتوى الأولي", status: "PENDING_APPROVAL" },
      { value: "يحتاج تعديل الملاحظات", status: "NEEDS_REVISION" },
      { value: "تم تعديل الملاحظات", status: "IN_PROGRESS_AFTER_REVISION" },
      { value: "الوصف معتمد", status: "COMPLETED" },
      { value: "تمت الإضافة للمتجر", status: "COMPLETED", precedence: 85 },
    ],
  },
  {
    property: "اعتماد الوصف",
    role: "STATUS",
    stageKey: "description",
    label: "اعتماد الوصف",
    statuses: [
      { value: "تم كتابة الوصف الأولي", status: "PENDING_APPROVAL" },
      { value: "تم تعديل الملاحظات", status: "IN_PROGRESS_AFTER_REVISION" },
      { value: "الوصف النهائي معتمد", status: "COMPLETED" },
      { value: "إضافة بدون وصف", status: "NOT_APPLICABLE" },
    ],
  },
  {
    property: "SEO أولوية",
    role: "STATUS",
    stageKey: "seo",
    label: "SEO",
    statuses: [
      { value: "ليس بحاجة لسيو", status: "NOT_APPLICABLE" },
      { value: "مطلوب سيو", status: "NOT_STARTED" },
      { value: "تم تجهيز السيو", status: "PENDING_APPROVAL" },
      { value: "تم إضافة السيو للمتجر", status: "COMPLETED" },
    ],
  },
  {
    property: "اضافة السيو الأولي",
    role: "STATUS",
    stageKey: "seoInitial",
    label: "إضافة السيو الأولي",
    statuses: [
      { value: "لم يتم الاضافة", status: "NOT_STARTED" },
      { value: "تم الاضافة", status: "COMPLETED" },
    ],
  },
  {
    property: "اضافة صورة المنتج",
    role: "STATUS",
    stageKey: "imageUpload",
    label: "إضافة صورة المنتج",
    statuses: [
      { value: "لم يتم الاضافة", status: "NOT_STARTED" },
      { value: "تم الاضافة", status: "COMPLETED" },
    ],
  },
];

const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");

/**
 * Match preset fields to a data source schema by (whitespace-insensitive)
 * property name, returning the exact Notion property names.
 */
export function matchPreset(schema: { name: string; type: string; options: { name: string }[] }[], preset = PRODUCTS_PRESET) {
  const out: (PresetField & { notionProperty: string; notionPropertyType: string })[] = [];
  for (const field of preset) {
    const prop = schema.find((p) => norm(p.name) === norm(field.property));
    if (!prop) continue;
    const options = new Set(prop.options.map((o) => norm(o.name)));
    out.push({
      ...field,
      notionProperty: prop.name,
      notionPropertyType: prop.type,
      statuses: field.statuses
        ?.map((s) => ({ ...s, value: prop.options.find((o) => norm(o.name) === norm(s.value))?.name ?? s.value }))
        .filter((s) => options.size === 0 || options.has(norm(s.value))),
    });
  }
  return out;
}
