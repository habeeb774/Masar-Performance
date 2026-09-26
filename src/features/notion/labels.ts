import type { Tone } from "@/lib/labels";

export const CONNECTION_STATUS_LABELS: Record<"UNTESTED" | "CONNECTED" | "FAILED", { label: string; tone: Tone }> = {
  UNTESTED: { label: "لم يُختبر", tone: "neutral" },
  CONNECTED: { label: "متصل", tone: "success" },
  FAILED: { label: "فشل الاتصال", tone: "danger" },
};

/** Human label for a Notion property type (shown next to property names). */
export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  title: "عنوان",
  rich_text: "نص",
  number: "رقم",
  select: "اختيار",
  multi_select: "اختيار متعدد",
  status: "حالة",
  date: "تاريخ",
  people: "أشخاص",
  created_by: "أنشأه",
  last_edited_by: "آخر من عدّل",
  created_time: "وقت الإنشاء",
  last_edited_time: "وقت آخر تعديل",
  checkbox: "مربع اختيار",
  url: "رابط",
  email: "بريد",
  phone_number: "هاتف",
  formula: "معادلة",
  rollup: "تجميع",
  relation: "علاقة",
  files: "ملفات",
  unique_id: "معرّف فريد",
};

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} مللي ث`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  return `${m} د ${s % 60} ث`;
}
