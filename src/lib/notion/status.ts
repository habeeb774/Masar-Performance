/**
 * Maps raw Notion option values to system statuses using DB-configured
 * NotionStatusMapping rows. Nothing here knows Notion option names.
 */

export const SYSTEM_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "PENDING_APPROVAL",
  "NEEDS_REVISION",
  "IN_PROGRESS_AFTER_REVISION",
  "COMPLETED",
  "BLOCKED",
  "CANCELLED",
  "NOT_APPLICABLE",
  "UNMAPPED",
] as const;

export type SystemStatus = (typeof SYSTEM_STATUSES)[number];

export const SYSTEM_STATUS_LABELS: Record<SystemStatus, string> = {
  NOT_STARTED: "لم يبدأ",
  IN_PROGRESS: "قيد التنفيذ",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  NEEDS_REVISION: "يحتاج تحسين",
  IN_PROGRESS_AFTER_REVISION: "قيد التنفيذ بعد التعديل",
  COMPLETED: "مكتمل",
  BLOCKED: "معلق",
  CANCELLED: "ملغي",
  NOT_APPLICABLE: "لا ينطبق",
  UNMAPPED: "غير مربوط",
};

/**
 * Default precedence used when a multi-select holds several values and the
 * admin has not configured an explicit precedence. A later workflow step wins
 * (e.g. "تم تعديل الملاحظات" beats "يحتاج تعديل الملاحظات").
 */
export const DEFAULT_PRECEDENCE: Record<SystemStatus, number> = {
  CANCELLED: 90,
  COMPLETED: 80,
  IN_PROGRESS_AFTER_REVISION: 60,
  NEEDS_REVISION: 50,
  PENDING_APPROVAL: 40,
  BLOCKED: 35,
  IN_PROGRESS: 30,
  NOT_STARTED: 10,
  NOT_APPLICABLE: 5,
  UNMAPPED: 0,
};

export interface StatusMappingRule {
  notionValue: string;
  systemStatus: SystemStatus;
  precedence?: number | null;
}

const norm = (v: string) => v.normalize("NFC").trim().replace(/\s+/g, " ");

export function buildStatusLookup(rules: StatusMappingRule[]) {
  const map = new Map<string, { status: SystemStatus; precedence: number }>();
  for (const r of rules) {
    map.set(norm(r.notionValue), {
      status: r.systemStatus,
      precedence: r.precedence && r.precedence > 0 ? r.precedence : DEFAULT_PRECEDENCE[r.systemStatus],
    });
  }
  return map;
}

export function resolveSystemStatus(
  rawValues: string[],
  lookup: ReturnType<typeof buildStatusLookup>,
): SystemStatus {
  const values = rawValues.map(norm).filter(Boolean);
  if (values.length === 0) return "NOT_STARTED";
  let best: { status: SystemStatus; precedence: number } | null = null;
  for (const v of values) {
    const hit = lookup.get(v);
    if (hit && (!best || hit.precedence > best.precedence)) best = hit;
  }
  return best?.status ?? "UNMAPPED";
}

export type StatusBucket = "completed" | "pendingApproval" | "needsRevision" | "inProgress" | "blocked" | "notStarted" | "excluded";

export function bucketOf(status: SystemStatus): StatusBucket {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "PENDING_APPROVAL":
      return "pendingApproval";
    case "NEEDS_REVISION":
      return "needsRevision";
    case "IN_PROGRESS":
    case "IN_PROGRESS_AFTER_REVISION":
      return "inProgress";
    case "BLOCKED":
      return "blocked";
    case "NOT_STARTED":
    case "UNMAPPED":
      return "notStarted";
    default:
      return "excluded";
  }
}

export function isWorkedStatus(status: SystemStatus): boolean {
  const b = bucketOf(status);
  return b !== "notStarted" && b !== "excluded";
}
