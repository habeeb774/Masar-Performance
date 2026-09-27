/**
 * Weekly batches («الدفعات») from the store's Notion workflow: every product row
 * carries a batch number, an image-approval stage and a store-upload stage.
 * Pure: the server loads synced items/stages/events, this derives what people see.
 *
 * Image cycle: قيد العمل → يحتاج إلى اعتماد → (معتمد | تحتاج إلى تحسين → تم التعديل → …) → معتمد
 * Store cycle: … → تم الإضافة (the product's final achievement)
 */
import { normalizeLabel } from "./auto-map";
import { bucketOf, type SystemStatus } from "./status";
import { isoToLocalDateKey } from "./progress";

export interface StageState {
  status: SystemStatus;
  changedAt: string; // ISO
}

export interface StageEvent {
  toStatus: SystemStatus;
  occurredAt: string; // ISO
}

export interface CycleItem {
  id: string;
  title: string;
  url: string | null;
  batch: string | null;
  batchNumber: number | null;
  createdTime: string;
  itemDate: string | null;
  employeeId: string | null;
  images: StageState | null;
  store: StageState | null;
  /** image-stage history, oldest first */
  imageEvents: StageEvent[];
  note: string | null;
}

export interface ItemQuality {
  /** times sent for approval (first request + every resubmission after edits) */
  submissions: number;
  /** times sent back for improvement */
  rejections: number;
  firstRequestAt: string | null;
  lastApprovedAt: string | null;
  /** approved without any improvement request; null while not approved */
  firstPass: boolean | null;
}

export interface BatchSummary {
  key: string;
  label: string;
  number: number | null;
  /** products that count towards the batch (excluded ones — merged/not required per the admin's mapping — are not) */
  total: number;
  excluded: number;
  images: { approved: number; waiting: number; edited: number; needsImprovement: number; inProgress: number; notStarted: number; unknown: number };
  store: { added: number };
  /** images approved but not yet added to the store */
  readyToAdd: number;
  /** anchor day used to place the batch in a week / month (median product date) */
  anchorDate: string;
  firstDate: string;
  lastDate: string;
  stale: { waitingTooLong: number; improvementNotDone: number; approvedNotAdded: number };
  quality: { approved: number; firstPass: number; firstPassRate: number | null; reworked: number; rejections: number };
}

/** A batch entered by hand (no Notion): aggregate counts only, no per-product history. */
export interface ManualBatchRow {
  id: string;
  number: number;
  total: number;
  weekStart: string;
  imagesApproved: number;
  added: number;
  needsImprovement: number;
  waiting: number;
}

export function manualBatchSummary(b: ManualBatchRow): BatchSummary & { manualId: string } {
  const other = Math.max(b.total - b.imagesApproved - b.needsImprovement - b.waiting, 0);
  return {
    manualId: b.id,
    key: String(b.number),
    label: `دفعة ${b.number}`,
    number: b.number,
    total: b.total,
    excluded: 0,
    images: { approved: b.imagesApproved, waiting: b.waiting, edited: 0, needsImprovement: b.needsImprovement, inProgress: other, notStarted: 0, unknown: 0 },
    store: { added: b.added },
    readyToAdd: Math.max(b.imagesApproved - b.added, 0),
    anchorDate: b.weekStart,
    firstDate: b.weekStart,
    lastDate: b.weekStart,
    stale: { waitingTooLong: 0, improvementNotDone: 0, approvedNotAdded: 0 },
    quality: { approved: 0, firstPass: 0, firstPassRate: null, reworked: 0, rejections: 0 },
  };
}

/** Notion batches win over a manual batch with the same number; newest first. */
export function mergeManualBatches<T extends BatchSummary>(notion: T[], manual: (BatchSummary & { manualId: string })[]): (T | (BatchSummary & { manualId: string }))[] {
  const keys = new Set(notion.map((b) => b.key));
  return [...notion, ...manual.filter((m) => !keys.has(m.key))].sort((a, b) => (b.number ?? -Infinity) - (a.number ?? -Infinity) || b.anchorDate.localeCompare(a.anchorDate));
}

export const STALE_DAYS = 2;
const DAY = 86_400_000;

/** Pick the image-approval and store-upload stages among a data source's status fields. */
export function resolveCycleStages(stages: { stageKey: string; label: string }[]) {
  const find = (key: string, words: string[]) =>
    stages.find((s) => s.stageKey === key)?.stageKey ?? stages.find((s) => words.some((w) => normalizeLabel(s.label).includes(w)))?.stageKey ?? null;
  return {
    images: find("images", ["صور", "صوره", "image", "photo"]),
    store: find("store", ["متجر", "store", "upload", "رفع"]),
  };
}

export function itemQuality(events: StageEvent[]): ItemQuality {
  let submissions = 0;
  let rejections = 0;
  let firstRequestAt: string | null = null;
  let lastApprovedAt: string | null = null;
  for (const e of events) {
    if (e.toStatus === "PENDING_APPROVAL" || e.toStatus === "IN_PROGRESS_AFTER_REVISION") {
      submissions++;
      firstRequestAt ??= e.occurredAt;
    }
    if (e.toStatus === "NEEDS_REVISION") rejections++;
    if (e.toStatus === "COMPLETED") lastApprovedAt = e.occurredAt;
  }
  return { submissions, rejections, firstRequestAt, lastApprovedAt, firstPass: lastApprovedAt ? rejections === 0 : null };
}

const excludedStatus = (s: StageState | null) => !!s && bucketOf(s.status) === "excluded";
const olderThan = (iso: string, now: number, days: number) => now - new Date(iso).getTime() > days * DAY;
export const batchKeyOf = (item: Pick<CycleItem, "batch" | "batchNumber">) =>
  item.batchNumber !== null && Number.isFinite(item.batchNumber) ? String(item.batchNumber) : item.batch?.trim() || null;

export function summarizeBatch(key: string, items: CycleItem[], now: Date = new Date()): BatchSummary {
  const t = now.getTime();
  const images = { approved: 0, waiting: 0, edited: 0, needsImprovement: 0, inProgress: 0, notStarted: 0, unknown: 0 };
  const stale = { waitingTooLong: 0, improvementNotDone: 0, approvedNotAdded: 0 };
  const quality = { approved: 0, firstPass: 0, firstPassRate: null as number | null, reworked: 0, rejections: 0 };
  let excluded = 0;
  let added = 0;
  let readyToAdd = 0;
  const dates: string[] = [];

  for (const item of items) {
    dates.push(item.itemDate ?? isoToLocalDateKey(item.createdTime));
    if (excludedStatus(item.store) || excludedStatus(item.images)) {
      excluded++;
      continue;
    }
    const img = item.images?.status ?? "NOT_STARTED";
    switch (img) {
      case "COMPLETED":
        images.approved++;
        break;
      case "PENDING_APPROVAL":
        images.waiting++;
        break;
      case "IN_PROGRESS_AFTER_REVISION":
        images.edited++;
        break;
      case "NEEDS_REVISION":
        images.needsImprovement++;
        break;
      case "IN_PROGRESS":
      case "BLOCKED":
        images.inProgress++;
        break;
      case "UNMAPPED":
        images.unknown++;
        break;
      default:
        images.notStarted++;
    }
    const isAdded = item.store?.status === "COMPLETED";
    if (isAdded) added++;
    if (img === "COMPLETED" && !isAdded) {
      readyToAdd++;
      if (item.images && olderThan(item.images.changedAt, t, STALE_DAYS)) stale.approvedNotAdded++;
    }
    if ((img === "PENDING_APPROVAL" || img === "IN_PROGRESS_AFTER_REVISION") && item.images && olderThan(item.images.changedAt, t, STALE_DAYS)) stale.waitingTooLong++;
    if (img === "NEEDS_REVISION" && item.images && olderThan(item.images.changedAt, t, 1)) stale.improvementNotDone++;

    const q = itemQuality(item.imageEvents);
    if (q.firstPass !== null) {
      quality.approved++;
      if (q.firstPass) quality.firstPass++;
    }
    if (q.rejections > 0) quality.reworked++;
    quality.rejections += q.rejections;
  }
  quality.firstPassRate = quality.approved > 0 ? Math.round((quality.firstPass / quality.approved) * 10000) / 100 : null;

  const sorted = dates.sort();
  const number = Number(key);
  return {
    key,
    label: `دفعة ${key}`,
    number: Number.isFinite(number) ? number : null,
    total: items.length - excluded,
    excluded,
    images,
    store: { added },
    readyToAdd,
    anchorDate: sorted[Math.floor((sorted.length - 1) / 2)] ?? isoToLocalDateKey(now.toISOString()),
    firstDate: sorted[0] ?? "",
    lastDate: sorted[sorted.length - 1] ?? "",
    stale,
    quality,
  };
}

/** Group items into batches, newest (highest number / latest date) first; items without a batch are left out. */
export function summarizeBatches(items: CycleItem[], now: Date = new Date()): BatchSummary[] {
  const groups = new Map<string, CycleItem[]>();
  for (const item of items) {
    const key = batchKeyOf(item);
    if (key) groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups]
    .map(([key, list]) => summarizeBatch(key, list, now))
    .sort((a, b) => (b.number ?? -Infinity) - (a.number ?? -Infinity) || b.anchorDate.localeCompare(a.anchorDate));
}

/** Rough pace check for a running batch: added products vs. the share of its week already elapsed. */
export function batchPace(summary: BatchSummary, weekStart: string, weekEnd: string, today: string): "ahead" | "on_track" | "behind" | "done" {
  if (summary.total > 0 && summary.store.added >= summary.total) return "done";
  const days = Math.max(1, (new Date(weekEnd).getTime() - new Date(weekStart).getTime()) / DAY + 1);
  const elapsed = Math.min(days, Math.max(0, (new Date(today).getTime() - new Date(weekStart).getTime()) / DAY + 1));
  const expected = (summary.total * elapsed) / days;
  if (summary.store.added >= expected * 1.1) return "ahead";
  return summary.store.added >= expected * 0.8 ? "on_track" : "behind";
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
