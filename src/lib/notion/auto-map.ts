import type { FieldRole } from "./item-mapper";
import { PRODUCTS_PRESET } from "./presets";
import type { SystemStatus } from "./status";

/**
 * Suggests field roles, workflow stages and status mappings for a Notion data
 * source from its property names, types and option values (Arabic + English).
 * Pure: the connect wizard shows the result and the user only resolves what
 * is not confidently detected.
 */

export type Confidence = "auto" | "suggested" | "unknown";
export type StatusGroup = "to_do" | "in_progress" | "complete";

export interface SchemaInput {
  name: string;
  type: string;
  options: { name: string; group?: StatusGroup | null }[];
}

export interface StatusSuggestion {
  value: string;
  status: SystemStatus | null;
  confidence: Confidence;
  count?: number;
}

export interface FieldSuggestion {
  property: string;
  propertyType: string;
  /** null = not used by the system */
  role: FieldRole | null;
  stageKey: string | null;
  label: string;
  confidence: Confidence;
  statuses: StatusSuggestion[];
}

export const STAGE_TYPES = new Set(["status", "select", "multi_select"]);

/** Arabic/English normalization: diacritics, alef/teh-marbuta/yeh variants, case, punctuation. */
export function normalizeLabel(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[_\-/\\.,:;!?()[\]{}"'«»|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (n: string) => n.split(" ");
const hasWord = (n: string, words: string[]) => tokens(n).some((t) => words.includes(t));
const hasAny = (n: string, parts: string[]) => parts.some((p) => n.includes(p));
/** Arabic words are often prefixed with ال/و/ب/ل — strip one prefix for word matching. */
const stems = (n: string) => tokens(n).flatMap((t) => [t, t.replace(/^(وال|بال|لل|ال|و|ب|ل)(?=.{2,})/, "")]);
const hasStem = (n: string, words: string[]) => stems(n).some((t) => words.includes(t));

// ---- status values ------------------------------------------------------------------

const EXACT_STATUS: Record<string, SystemStatus> = {};
const exact = (status: SystemStatus, values: string[]) => values.forEach((v) => (EXACT_STATUS[normalizeLabel(v)] = status));
exact("COMPLETED", ["done", "complete", "completed", "finished", "approved", "published", "مكتمل", "مكتملة", "تم", "منجز", "منتهي", "معتمد", "تم الاعتماد", "تم الإنجاز", "تم الإضافة", "تمت الإضافة", "مضاف", "تم النشر", "اعتماد نهائي", "مضاف نهائي"]);
exact("IN_PROGRESS", ["doing", "in progress", "working", "started", "wip", "جاري", "جاري العمل", "قيد التنفيذ", "قيد العمل", "تحت التنفيذ", "بدأ"]);
exact("PENDING_APPROVAL", ["waiting", "review", "in review", "pending", "pending review", "awaiting approval", "بانتظار", "بانتظار المراجعة", "بانتظار الاعتماد", "قيد المراجعة", "تحت المراجعة", "يحتاج اعتماد", "يحتاج إلى اعتماد"]);
exact("NOT_STARTED", ["not started", "new", "todo", "to do", "backlog", "جديد", "لم يبدأ", "لم يتم", "لم يتم البدء", "مطلوب"]);
exact("NEEDS_REVISION", ["needs revision", "changes requested", "rework", "يحتاج تعديل", "يحتاج تحسين", "تحتاج تحسين", "تحتاج إلى تحسين", "إعادة تعديل", "مرفوض"]);
exact("IN_PROGRESS_AFTER_REVISION", ["revised", "تم التعديل", "تم تعديل الصور", "تم التحسين"]);
exact("BLOCKED", ["blocked", "on hold", "paused", "معلق", "متوقف"]);
exact("CANCELLED", ["cancelled", "canceled", "ملغي", "غير معتمد"]);
exact("NOT_APPLICABLE", ["n a", "na", "not applicable", "لا ينطبق"]);

/**
 * Terminal values whose effect on the target is a business rule (count as done, or
 * exclude from the target) — never guessed; the admin decides once in the mapping.
 */
const RULE_DECIDED = ["دمج", "منتج سابق", "مستبعد", "استبعاد", "غير مطلوب", "merged", "excluded"];

function keywordStatus(n: string): SystemStatus | null {
  if (hasAny(n, ["ليس بحاجه", "لا يحتاج", "لا ينطبق", "مسبقا", "not needed", "not applicable"])) return "NOT_APPLICABLE";
  if (hasAny(n, ["غير معتمد", "ملغ", "cancel", "reject"])) return "CANCELLED";
  if (hasWord(n, ["لم", "not"]) || hasAny(n, ["لم يتم", "لم يبدا"])) return "NOT_STARTED";
  if (hasAny(n, ["تم تعديل", "تم التعديل", "تم التحسين", "تم تحسين", "revised", "after revision"])) return "IN_PROGRESS_AFTER_REVISION";
  if (hasAny(n, ["تعديل", "تحسين", "revision", "rework", "fix", "changes"])) return "NEEDS_REVISION";
  if (hasAny(n, ["معلق", "متوقف", "hold", "block", "pause"])) return "BLOCKED";
  if (hasAny(n, ["انتظار", "مراجعه", "review", "pending", "wait", "اعتماد اولي", "يحتاج اعتماد", "يحتاج الي اعتماد", "بدون اعتماد", "مخفي"])) return "PENDING_APPROVAL";
  if (hasAny(n, ["جاري", "قيد", "progress", "doing", "working"])) return "IN_PROGRESS";
  if (hasWord(n, ["تم", "تمت", "done"]) || hasAny(n, ["مكتمل", "منجز", "معتمد", "نهائي", "complet", "finish", "approv", "publish"])) return "COMPLETED";
  if (hasAny(n, ["جديد", "مطلوب", "يحتاج", "todo", "to do", "new", "backlog"])) return "NOT_STARTED";
  return null;
}

const GROUP_STATUS: Record<StatusGroup, SystemStatus> = { complete: "COMPLETED", in_progress: "IN_PROGRESS", to_do: "NOT_STARTED" };

export function suggestStatus(value: string, group?: StatusGroup | null): Omit<StatusSuggestion, "value"> {
  const n = normalizeLabel(value);
  if (hasAny(n, RULE_DECIDED.map(normalizeLabel))) return { status: null, confidence: "unknown" };
  const hit = EXACT_STATUS[n];
  if (hit) return { status: hit, confidence: "auto" };
  const kw = keywordStatus(n);
  if (kw) return { status: kw, confidence: "suggested" };
  if (group) return { status: GROUP_STATUS[group], confidence: "suggested" };
  return { status: null, confidence: "unknown" };
}

// ---- workflow stages ----------------------------------------------------------------

const STAGE_KEYWORDS: { key: string; words: string[]; parts?: string[] }[] = [
  { key: "images", words: ["صور", "صوره", "image", "images", "photo", "photos", "picture", "pictures"] },
  { key: "seo", words: ["seo", "سيو"] },
  { key: "content", words: ["محتوي", "وصف", "content", "description", "copy", "copywriting", "كتابه"] },
  { key: "video", words: ["فيديو", "video", "reels", "ريلز"] },
  { key: "design", words: ["تصميم", "design", "تصاميم"] },
  // "store" matches the key goal rules use for «الإضافة للمتجر»
  { key: "store", words: ["رفع", "اضافه", "متجر", "نشر", "upload", "publish", "store", "listing"] },
  { key: "review", words: ["مراجعه", "اعتماد", "review", "approval", "qa", "تدقيق"] },
  { key: "status", words: ["status", "حاله", "state", "stage", "مرحله"] },
];

function detectStageKey(name: string): string | null {
  const n = normalizeLabel(name);
  for (const s of STAGE_KEYWORDS) if (hasStem(n, s.words)) return s.key;
  return null;
}

// ---- field roles --------------------------------------------------------------------

const TEXTUAL = new Set(["rich_text", "title", "number", "unique_id", "formula", "select"]);

function detectRole(p: SchemaInput): { role: FieldRole; confidence: Confidence } | null {
  const n = normalizeLabel(p.name);
  if (p.type === "title") return { role: "TITLE", confidence: "auto" };
  if (TEXTUAL.has(p.type) && (hasStem(n, ["sku", "كود", "باركود", "barcode", "رمز"]) || hasAny(n, ["product code", "item code", "code"])))
    return { role: "PRODUCT_CODE", confidence: "auto" };
  if (hasStem(n, ["batch", "دفعه", "دفعات"]) && p.type !== "date") return { role: "BATCH", confidence: "auto" };
  if ((p.type === "rich_text" || p.type === "formula") && hasStem(n, ["ملاحظات", "ملاحظه", "notes", "note", "تعليق", "تعليقات", "comments", "feedback"]))
    return { role: "NOTES", confidence: "auto" };
  if (p.type === "date" || p.type === "created_time")
    return { role: "DATE", confidence: hasStem(n, ["date", "تاريخ", "يوم", "day"]) ? "auto" : "suggested" };
  if (p.type === "people")
    return { role: "EMPLOYEE", confidence: hasStem(n, ["assignee", "owner", "employee", "responsible", "مسؤول", "موظف", "مكلف", "منفذ", "assigned"]) ? "auto" : "suggested" };
  if (p.type === "select" && hasStem(n, ["type", "نوع", "category", "تصنيف"]) && !detectStageKey(p.name)) return { role: "TASK_TYPE", confidence: "suggested" };
  return null;
}

const presetNorm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");

function statusRows(p: SchemaInput, observed: Record<string, number> | undefined, preset?: { value: string; status: SystemStatus }[]): StatusSuggestion[] {
  const values = new Map<string, StatusGroup | null>();
  for (const o of p.options) values.set(o.name, o.group ?? null);
  for (const v of Object.keys(observed ?? {})) if (!values.has(v)) values.set(v, null);
  return [...values].map(([value, group]) => {
    const fromPreset = preset?.find((s) => presetNorm(s.value) === presetNorm(value));
    const s = fromPreset ? { status: fromPreset.status, confidence: "auto" as const } : suggestStatus(value, group);
    return { value, ...s, count: observed?.[value] };
  });
}

function uniqueKey(base: string, used: Set<string>) {
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}${i}`;
  used.add(key);
  return key;
}

/**
 * @param observed raw option values seen in real items: { propertyName: { value: count } }
 */
export function suggestMappings(schema: SchemaInput[], observed: Record<string, Record<string, number>> = {}): FieldSuggestion[] {
  const usedStages = new Set<string>();
  const out: FieldSuggestion[] = [];
  const singleRoleTaken = new Set<FieldRole>();

  // exact preset matches first so their stage keys win
  const ordered = [...schema].sort((a, b) => Number(!findPreset(a)) - Number(!findPreset(b)));

  for (const p of ordered) {
    const preset = findPreset(p);
    if (preset) {
      if (preset.role !== "STATUS") singleRoleTaken.add(preset.role);
      out.push({
        property: p.name,
        propertyType: p.type,
        role: preset.role,
        stageKey: preset.stageKey ? uniqueKey(preset.stageKey, usedStages) : null,
        label: preset.label,
        confidence: "auto",
        statuses: preset.role === "STATUS" ? statusRows(p, observed[p.name], preset.statuses) : [],
      });
      continue;
    }

    const role = detectRole(p);
    if (role && !singleRoleTaken.has(role.role)) {
      singleRoleTaken.add(role.role);
      out.push({ property: p.name, propertyType: p.type, role: role.role, stageKey: null, label: p.name, confidence: role.confidence, statuses: [] });
      continue;
    }

    if (STAGE_TYPES.has(p.type)) {
      const detected = detectStageKey(p.name);
      const statuses = statusRows(p, observed[p.name]);
      if (detected) {
        const allAuto = statuses.length > 0 && statuses.every((s) => s.confidence === "auto");
        out.push({
          property: p.name,
          propertyType: p.type,
          role: "STATUS",
          stageKey: uniqueKey(detected, usedStages),
          label: p.name,
          confidence: allAuto ? "auto" : "suggested",
          statuses,
        });
      } else {
        out.push({ property: p.name, propertyType: p.type, role: null, stageKey: null, label: p.name, confidence: "unknown", statuses });
      }
      continue;
    }

    out.push({ property: p.name, propertyType: p.type, role: null, stageKey: null, label: p.name, confidence: "auto", statuses: [] });
  }

  // keep Notion's property order for display
  const index = new Map(schema.map((p, i) => [p.name, i]));
  return out.sort((a, b) => (index.get(a.property) ?? 0) - (index.get(b.property) ?? 0));
}

function findPreset(p: SchemaInput) {
  return PRODUCTS_PRESET.find((f) => presetNorm(f.property) === presetNorm(p.name));
}

/** Stable stage key for a stage the user promotes manually (never typed by the user). */
export function stageKeyFor(label: string, used: Iterable<string>): string {
  return uniqueKey(detectStageKey(label) ?? "stage", new Set(used));
}

/** True when the wizard can proceed: a title exists and every stage value has a status. */
export function unresolvedCount(fields: FieldSuggestion[]): number {
  let n = 0;
  for (const f of fields) {
    if (f.confidence === "unknown" && f.role === null) n++;
    if (f.role === "STATUS") n += f.statuses.filter((s) => !s.status).length;
  }
  return n;
}

const DATABASE_HINTS: { words: string[]; score: number }[] = [
  { words: ["منتج", "منتجات", "product", "products", "catalog", "sku"], score: 3 },
  { words: ["مهام", "مهمه", "task", "tasks", "محتوي", "content", "seo", "سيو", "صور", "تصميم", "design"], score: 2 },
];

/**
 * After authorization, choose the database to sync without asking — only when
 * the choice is unambiguous: a single new database, or one clearly stronger
 * name match than every other. Otherwise null (the user picks from the list).
 */
export function pickDatabase<T extends { name: string; addedId: string | null }>(databases: T[]): T | null {
  const fresh = databases.filter((d) => !d.addedId);
  if (fresh.length === 1) return fresh[0];
  const scored = fresh
    .map((d) => {
      const n = normalizeLabel(d.name);
      return { d, score: DATABASE_HINTS.reduce((s, h) => (hasStem(n, h.words) || h.words.some((w) => w.length > 3 && n.includes(w)) ? s + h.score : s), 0) };
    })
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 || scored[0].score === 0) return null;
  return scored.length === 1 || scored[0].score > scored[1].score ? scored[0].d : null;
}
