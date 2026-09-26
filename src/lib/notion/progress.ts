import type { FilterCondition, NotionFilterRule } from "./filter-rule";
import type { NormalizedValue } from "./properties";
import { valueToNumber, valueToStrings } from "./properties";
import { bucketOf, type SystemStatus } from "./status";

/** Minimal projection of a synced item needed for progress evaluation. */
export interface EvalItem {
  id: string;
  batch: string | null;
  batchNumber: number | null;
  productCode: string | null;
  taskType: string | null;
  employeeId: string | null;
  itemDate: string | null; // DateKey
  createdTime: string; // ISO
  lastEditedTime: string; // ISO
  properties: Record<string, NormalizedValue>;
  stage: { rawValues: string[]; systemStatus: SystemStatus; statusChangedAt: string } | null;
  /** ISO timestamps when this item entered NEEDS_REVISION on the rule's stage */
  revisionEvents: string[];
}

export interface EvalContext {
  /** inclusive DateKey range; null = no date restriction */
  start: string | null;
  end: string | null;
  employeeId: string | null;
  tz?: string;
}

export interface ProgressBreakdown {
  target: number;
  matched: number;
  worked: number;
  completed: number;
  pendingApproval: number;
  needsRevision: number;
  inProgress: number;
  blocked: number;
  notStarted: number;
  remaining: number;
  /** items sent back for revision at least once during the period */
  reworkCount: number;
  progressPct: number;
  approvalRate: number | null;
  revisionRate: number | null;
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Calendar day of an ISO timestamp in Asia/Riyadh (UTC+3, no DST). */
export function isoToLocalDateKey(iso: string, offsetMs = RIYADH_OFFSET_MS): string {
  return new Date(new Date(iso).getTime() + offsetMs).toISOString().slice(0, 10);
}

function inRange(key: string | null, ctx: EvalContext): boolean {
  if (!ctx.start && !ctx.end) return true;
  if (!key) return false;
  if (ctx.start && key < ctx.start) return false;
  if (ctx.end && key > ctx.end) return false;
  return true;
}

function fieldValues(item: EvalItem, c: FilterCondition): string[] {
  switch (c.field) {
    case "batch":
      return item.batch ? [item.batch] : [];
    case "productCode":
      return item.productCode ? [item.productCode] : [];
    case "taskType":
      return item.taskType ? [item.taskType] : [];
    case "property":
      return c.property ? valueToStrings(item.properties[c.property]) : [];
  }
}

function fieldNumber(item: EvalItem, c: FilterCondition): number | null {
  if (c.field === "batch") return item.batchNumber ?? valueToNumber(item.batch ?? undefined);
  if (c.field === "property" && c.property) return valueToNumber(item.properties[c.property]);
  const v = fieldValues(item, c)[0];
  return v === undefined ? null : valueToNumber(v);
}

const eqValue = (a: string, b: string | number) => {
  const na = Number(a);
  const nb = Number(b);
  if (a.trim() !== "" && Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return a.trim() === String(b).trim();
};

export function matchesCondition(item: EvalItem, c: FilterCondition): boolean {
  const values = fieldValues(item, c);
  const list = Array.isArray(c.value) ? c.value : c.value === undefined ? [] : [c.value];
  switch (c.op) {
    case "is_empty":
      return values.length === 0;
    case "not_empty":
      return values.length > 0;
    case "eq":
      return list.length > 0 && values.some((v) => eqValue(v, list[0]));
    case "neq":
      return list.length === 0 || !values.some((v) => eqValue(v, list[0]));
    case "in":
      return values.some((v) => list.some((x) => eqValue(v, x)));
    case "not_in":
      return !values.some((v) => list.some((x) => eqValue(v, x)));
    case "contains":
      return list.length > 0 && values.some((v) => v.includes(String(list[0])));
    case "gte": {
      const n = fieldNumber(item, c);
      return n !== null && list.length > 0 && n >= Number(list[0]);
    }
    case "lte": {
      const n = fieldNumber(item, c);
      return n !== null && list.length > 0 && n <= Number(list[0]);
    }
  }
}

function itemPeriodKey(item: EvalItem, rule: NotionFilterRule): string | null {
  switch (rule.dateBasis) {
    case "STAGE_CHANGED":
      return item.stage ? isoToLocalDateKey(item.stage.statusChangedAt) : null;
    case "ITEM_DATE":
      return item.itemDate ?? (item.stage ? isoToLocalDateKey(item.stage.statusChangedAt) : null);
    case "CREATED":
      return isoToLocalDateKey(item.createdTime);
    case "LAST_EDITED":
      return isoToLocalDateKey(item.lastEditedTime);
    case "NONE":
      return null;
  }
}

export function isCompleted(item: EvalItem, rule: NotionFilterRule): boolean {
  if (!item.stage) return false;
  if (rule.completedRawValues.length > 0) {
    return item.stage.rawValues.some((v) => rule.completedRawValues.some((x) => x.trim() === v.trim()));
  }
  return rule.completedStatuses.includes(item.stage.systemStatus);
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 10000) / 100 : null);

/**
 * Compute a goal's progress breakdown from synced Notion items.
 * Completed items are what count towards the target; quality ratios are kept
 * separate so volume never masks rework.
 */
export function computeBreakdown(
  items: EvalItem[],
  rule: NotionFilterRule,
  ctx: EvalContext,
  target: number,
): ProgressBreakdown {
  const b: ProgressBreakdown = {
    target,
    matched: 0,
    worked: 0,
    completed: 0,
    pendingApproval: 0,
    needsRevision: 0,
    inProgress: 0,
    blocked: 0,
    notStarted: 0,
    remaining: 0,
    reworkCount: 0,
    progressPct: 0,
    approvalRate: null,
    revisionRate: null,
  };
  const usePeriod = rule.dateBasis !== "NONE" && (ctx.start !== null || ctx.end !== null);

  for (const item of items) {
    if (rule.matchEmployee && ctx.employeeId && item.employeeId !== ctx.employeeId) continue;
    if (!rule.conditions.every((c) => matchesCondition(item, c))) continue;

    const reworkedInPeriod = item.revisionEvents.some((iso) => !usePeriod || inRange(isoToLocalDateKey(iso), ctx));
    if (usePeriod && !inRange(itemPeriodKey(item, rule), ctx)) {
      // an item can leave the period (status changed later) yet still have been reworked inside it
      if (reworkedInPeriod) b.reworkCount += 1;
      continue;
    }
    if (reworkedInPeriod) b.reworkCount += 1;

    b.matched += 1;
    if (isCompleted(item, rule)) {
      b.completed += 1;
      continue;
    }
    const bucket = item.stage ? bucketOf(item.stage.systemStatus) : "notStarted";
    switch (bucket) {
      case "completed":
        // completed by status but not counted by an explicit raw-value rule
        b.inProgress += 1;
        break;
      case "pendingApproval":
        b.pendingApproval += 1;
        break;
      case "needsRevision":
        b.needsRevision += 1;
        break;
      case "inProgress":
        b.inProgress += 1;
        break;
      case "blocked":
        b.blocked += 1;
        break;
      case "notStarted":
        b.notStarted += 1;
        break;
      case "excluded":
        b.matched -= 1;
        break;
    }
  }

  b.worked = b.completed + b.pendingApproval + b.needsRevision + b.inProgress + b.blocked;
  b.remaining = Math.max(target - b.completed, 0);
  b.progressPct = target > 0 ? Math.round((b.completed / target) * 10000) / 100 : b.completed > 0 ? 100 : 0;
  const reviewed = b.completed + b.needsRevision;
  b.approvalRate = pct(b.completed, reviewed);
  b.revisionRate = pct(Math.max(b.reworkCount, b.needsRevision), b.worked);
  return b;
}
