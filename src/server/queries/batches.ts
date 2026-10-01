import "server-only";
import { db } from "@/server/db";
import { employeeIdScope, type AuthUser } from "@/server/auth/session";
import { getCompany } from "@/server/services/company";
import { fromDateKey, getMonthWeeks, monthEnd, monthStart, todayKey } from "@/lib/dates";
import { valueToStrings, type NormalizedValue } from "@/lib/notion/properties";
import type { SystemStatus } from "@/lib/notion/status";
import { toDateKey } from "@/lib/dates";
import {
  batchKeyOf,
  batchPace,
  itemQuality,
  manualBatchSummary,
  mergeManualBatches,
  resolveCycleStages,
  summarizeBatches,
  type BatchSummary,
  type CycleItem,
} from "@/lib/notion/batches";

/**
 * Read-only views of the store's weekly batches built from synced Notion data.
 * Notion stays the source of truth for product status; nothing here is editable.
 */

type Scope = { kind: "employee"; employeeId: string } | { kind: "team"; ids: "ALL" | string[] };

interface SourceCycle {
  id: string;
  name: string;
  images: string | null;
  store: string | null;
  notesProperty: string | null;
  owners: string[];
}

async function cycleSources(): Promise<SourceCycle[]> {
  const sources = await db.notionDataSource.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      defaultEmployeeId: true,
      fieldMappings: { where: { isActive: true }, select: { role: true, stageKey: true, label: true, notionProperty: true, ownerEmployeeId: true } },
    },
  });
  return sources
    .map((s) => {
      const stages = s.fieldMappings.filter((m) => m.role === "STATUS" && m.stageKey).map((m) => ({ stageKey: m.stageKey!, label: m.label }));
      const { images, store } = resolveCycleStages(stages);
      const owners = [
        s.defaultEmployeeId,
        ...s.fieldMappings.filter((m) => m.role === "STATUS" && (m.stageKey === images || m.stageKey === store)).map((m) => m.ownerEmployeeId),
      ].filter((x): x is string => !!x);
      const hasBatch = s.fieldMappings.some((m) => m.role === "BATCH");
      return { id: s.id, name: s.name, images, store, notesProperty: s.fieldMappings.find((m) => m.role === "NOTES")?.notionProperty ?? null, owners, hasBatch };
    })
    .filter((s) => s.hasBatch && (s.images || s.store));
}

async function loadCycleItems(scope: Scope, since: Date): Promise<(CycleItem & { sourceId: string })[]> {
  const sources = await cycleSources();
  if (sources.length === 0) return [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  const rows = await db.notionSyncedItem.findMany({
    where: { dataSourceId: { in: sources.map((s) => s.id) }, isArchived: false, createdTime: { gte: since } },
    select: {
      id: true,
      dataSourceId: true,
      title: true,
      url: true,
      batch: true,
      batchNumber: true,
      createdTime: true,
      itemDate: true,
      employeeId: true,
      properties: true,
      stages: { select: { stageKey: true, systemStatus: true, statusChangedAt: true } },
      events: { select: { stageKey: true, toStatus: true, occurredAt: true }, orderBy: { occurredAt: "asc" } },
    },
  });

  const visible = (sourceId: string, employeeId: string | null) => {
    const owners = byId.get(sourceId)?.owners ?? [];
    if (scope.kind === "employee") return employeeId ? employeeId === scope.employeeId : owners.includes(scope.employeeId);
    if (scope.ids === "ALL") return true;
    const ids = scope.ids;
    return employeeId ? ids.includes(employeeId) : owners.some((o) => ids.includes(o));
  };

  return rows
    .filter((r) => visible(r.dataSourceId, r.employeeId))
    .map((r) => {
      const src = byId.get(r.dataSourceId)!;
      const stage = (key: string | null) => {
        const s = key ? r.stages.find((x) => x.stageKey === key) : null;
        return s ? { status: s.systemStatus as SystemStatus, changedAt: s.statusChangedAt.toISOString() } : null;
      };
      const props = (r.properties ?? {}) as Record<string, NormalizedValue>;
      const note = src.notesProperty ? valueToStrings(props[src.notesProperty]).join(" ").trim() || null : null;
      return {
        sourceId: r.dataSourceId,
        id: r.id,
        title: r.title,
        url: r.url,
        batch: r.batch,
        batchNumber: r.batchNumber === null ? null : Number(r.batchNumber),
        createdTime: r.createdTime.toISOString(),
        itemDate: r.itemDate ? r.itemDate.toISOString().slice(0, 10) : null,
        employeeId: r.employeeId,
        images: stage(src.images),
        store: stage(src.store),
        imageEvents: r.events.filter((e) => e.stageKey === src.images).map((e) => ({ toStatus: e.toStatus as SystemStatus, occurredAt: e.occurredAt.toISOString() })),
        note,
      };
    });
}

async function weekOf(dateKey: string) {
  const company = await getCompany();
  const [y, m] = [+dateKey.slice(0, 4), +dateKey.slice(5, 7)];
  const week = getMonthWeeks(y, m, company.weekStartDay, company.workDays).find((w) => dateKey >= w.start && dateKey <= w.end);
  return week ? { start: week.start, end: week.end } : { start: dateKey, end: dateKey };
}

const DAY = 86_400_000;

type Summary = BatchSummary & { manualId?: string };

/** Batches entered by hand (no Notion workflow) for some employees since a date. */
async function manualBatches(employeeIds: "ALL" | string[], since: Date) {
  const rows = await db.manualBatch.findMany({
    where: { weekStart: { gte: since }, ...(employeeIds === "ALL" ? {} : { employeeId: { in: employeeIds } }) },
    orderBy: { number: "desc" },
  });
  return rows.map((r) => ({ employeeId: r.employeeId, summary: manualBatchSummary({ ...r, weekStart: toDateKey(r.weekStart) }) }));
}

/** Does this employee have a Notion product workflow? Without one, batches are entered by hand. */
async function hasNotionWorkflow(employeeId: string) {
  const sources = await cycleSources();
  if (sources.some((s) => s.owners.includes(employeeId))) return true;
  return (await db.notionSyncedItem.count({ where: { employeeId, dataSourceId: { in: sources.map((s) => s.id) } }, take: 1 })) > 0;
}
const lookback = (days: number) => new Date(Date.now() - days * DAY);

export type ProductNeedingWork = { id: string; title: string; url: string | null; batch: string; note: string | null; since: string };

/** «دفعتي»: the employee's current batch, the month's batches and what needs their action now. */
export async function getEmployeeBatches(employeeId: string, year: number, month: number, execution?: { start: string; end: string }) {
  const since = new Date(fromDateKey(execution?.start ?? monthStart(year, month)).getTime() - 21 * DAY);
  const from = since < lookback(60) ? since : lookback(60);
  const [items, manual, notion] = await Promise.all([loadCycleItems({ kind: "employee", employeeId }, from), manualBatches([employeeId], from), hasNotionWorkflow(employeeId)]);
  const batches: Summary[] = mergeManualBatches(summarizeBatches(items), manual.map((m) => m.summary));
  if (batches.length === 0 && notion) return null;
  const [start, end] = [execution?.start ?? monthStart(year, month), execution?.end ?? monthEnd(year, month)];
  const current = batches[0] ?? null;
  const open = items.filter((i) => batchKeyOf(i));
  const needsImprovement: ProductNeedingWork[] = open
    .filter((i) => i.images?.status === "NEEDS_REVISION")
    .map((i) => ({ id: i.id, title: i.title, url: i.url, batch: batchKeyOf(i)!, note: i.note, since: i.images!.changedAt }))
    .sort((a, b) => a.since.localeCompare(b.since));
  const readyToAdd = open.filter((i) => i.images?.status === "COMPLETED" && i.store?.status !== "COMPLETED" && i.store?.status !== "NOT_APPLICABLE" && i.store?.status !== "CANCELLED").length;
  const quality = items
    .filter((i) => i.imageEvents.length > 0 && batchKeyOf(i))
    .map((i) => ({ title: i.title, batch: batchKeyOf(i)!, ...itemQuality(i.imageEvents) }))
    .filter((q) => q.submissions > 0);
  return {
    current,
    currentWeek: current ? await weekOf(current.anchorDate) : null,
    month: batches.filter((b) => b.anchorDate >= start && b.anchorDate <= end).sort((a, b) => a.anchorDate.localeCompare(b.anchorDate)),
    needsImprovement,
    readyToAdd: readyToAdd + (current?.manualId ? current.readyToAdd : 0),
    quality,
    /** no Notion workflow → the employee / manager enters batches by hand */
    manual: !notion,
  };
}

/** Manager overview: the latest batch of each workflow source, its pace and bottlenecks. */
export async function getTeamBatchOverview(user: AuthUser) {
  const scope = employeeIdScope(user);
  const [items, manual] = await Promise.all([loadCycleItems({ kind: "team", ids: scope }, lookback(45)), manualBatches(scope, lookback(45))]);
  if (items.length === 0 && manual.length === 0) return [];
  const company = await getCompany();
  const today = todayKey(company.timezone);
  const bySource = new Map<string, typeof items>();
  for (const i of items) bySource.set(i.sourceId, [...(bySource.get(i.sourceId) ?? []), i]);
  const out: { batch: Summary; pace: ReturnType<typeof batchPace>; week: { start: string; end: string }; previousStale: BatchSummary["stale"] }[] = [];
  for (const list of bySource.values()) {
    const batches = summarizeBatches(list);
    const [latest, ...older] = batches;
    if (!latest) continue;
    const week = await weekOf(latest.anchorDate);
    const previousStale = older.reduce(
      (a, b) => ({ waitingTooLong: a.waitingTooLong + b.stale.waitingTooLong, improvementNotDone: a.improvementNotDone + b.stale.improvementNotDone, approvedNotAdded: a.approvedNotAdded + b.stale.approvedNotAdded }),
      { waitingTooLong: 0, improvementNotDone: 0, approvedNotAdded: 0 },
    );
    out.push({ batch: latest, pace: batchPace(latest, week.start, week.end, today), week, previousStale });
  }
  // employees working without Notion: their latest manual batch
  const latestManual = new Map<string, Summary>();
  for (const m of manual) if (!latestManual.has(m.employeeId)) latestManual.set(m.employeeId, m.summary);
  for (const batch of latestManual.values()) {
    const week = await weekOf(batch.anchorDate);
    out.push({ batch, pace: batchPace(batch, week.start, week.end, today), week, previousStale: { waitingTooLong: 0, improvementNotDone: 0, approvedNotAdded: 0 } });
  }
  return out;
}

/** Bottleneck alerts per batch (only when something is actually stuck). */
export async function getBatchAlerts(user: AuthUser) {
  const items = await loadCycleItems({ kind: "team", ids: employeeIdScope(user) }, lookback(45));
  return summarizeBatches(items).filter((b) => b.stale.waitingTooLong + b.stale.improvementNotDone + b.stale.approvedNotAdded > 0);
}

export type ReviewProduct = { id: string; title: string; url: string | null; since: string; note: string | null };

/** What waits for the manager's decision in Notion, grouped by batch. */
export async function getBatchReviewQueue(user: AuthUser) {
  const items = await loadCycleItems({ kind: "team", ids: employeeIdScope(user) }, lookback(60));
  const groups = new Map<string, { label: string; number: number | null; waiting: ReviewProduct[]; edited: ReviewProduct[] }>();
  for (const i of items) {
    const key = batchKeyOf(i);
    const status = i.images?.status;
    if (!key || (status !== "PENDING_APPROVAL" && status !== "IN_PROGRESS_AFTER_REVISION")) continue;
    const g = groups.get(key) ?? { label: `دفعة ${key}`, number: Number.isFinite(Number(key)) ? Number(key) : null, waiting: [], edited: [] };
    const p = { id: i.id, title: i.title, url: i.url, since: i.images!.changedAt, note: i.note };
    (status === "PENDING_APPROVAL" ? g.waiting : g.edited).push(p);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, waiting: g.waiting.sort((a, b) => a.since.localeCompare(b.since)), edited: g.edited.sort((a, b) => a.since.localeCompare(b.since)) }))
    .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
}

/** Batches of an employee whose anchor day falls inside a period (reports). */
export async function batchesForPeriod(employeeId: string, start: string, end: string) {
  const since = new Date(fromDateKey(start).getTime() - 21 * DAY);
  const [items, manual] = await Promise.all([loadCycleItems({ kind: "employee", employeeId }, since), manualBatches([employeeId], since)]);
  return mergeManualBatches(summarizeBatches(items), manual.map((m) => m.summary))
    .filter((b) => b.anchorDate >= start && b.anchorDate <= end)
    .sort((a, b) => a.anchorDate.localeCompare(b.anchorDate));
}
