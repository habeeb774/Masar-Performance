import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { NotionSystemStatus, SyncTrigger } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { normalizeProperties } from "@/lib/notion/properties";
import { mapNotionItem, rawTitle, type FieldMappingConfig } from "@/lib/notion/item-mapper";
import { getNotionClient, isFullPage, isUnauthorized, notionErrorMessage, type NotionPage } from "./client";
import { refreshOAuthToken } from "./oauth";
import { fromDateKey } from "@/lib/dates";

const PAGE_SIZE = 100;
/** stop processing after this long so serverless invocations never time out */
const TIME_BUDGET_MS = 45_000;
/** Notion rounds last_edited_time to the minute — re-read a small overlap */
const CURSOR_OVERLAP_MS = 2 * 60 * 1000;

export interface SyncResult {
  logId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { pageId?: string; message: string }[];
  newRevisionItemIds: string[];
}

async function loadMappings(dataSourceId: string): Promise<FieldMappingConfig[]> {
  const rows = await db.notionFieldMapping.findMany({
    where: { dataSourceId, isActive: true },
    include: { statusMappings: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => ({
    role: r.role,
    notionProperty: r.notionProperty,
    stageKey: r.stageKey,
    ownerEmployeeId: r.ownerEmployeeId,
    statusMappings: r.statusMappings.map((s) => ({
      notionValue: s.notionValue,
      systemStatus: s.systemStatus,
      precedence: s.precedence,
    })),
  }));
}

async function loadEmployees() {
  return db.employee.findMany({
    where: { status: { not: "TERMINATED" } },
    select: { id: true, fullName: true, notionUserId: true, notionAlias: true },
  });
}

type ExistingItem = Prisma.NotionSyncedItemGetPayload<{ include: { stages: true } }>;

/**
 * Upsert one batch of Notion pages. Everything for a batch happens in one
 * transaction so a failure never leaves half-written stages behind.
 */
async function processPages(
  pages: NotionPage[],
  ctx: {
    dataSourceId: string;
    notionDatabaseId: string;
    defaultEmployeeId: string | null;
    mappings: FieldMappingConfig[];
    employees: Awaited<ReturnType<typeof loadEmployees>>;
    force: boolean;
  },
  result: SyncResult,
) {
  const existing = await db.notionSyncedItem.findMany({
    where: { dataSourceId: ctx.dataSourceId, notionPageId: { in: pages.map((p) => p.id) } },
    include: { stages: true },
  });
  const byPage = new Map<string, ExistingItem>(existing.map((e) => [e.notionPageId, e]));

  for (const page of pages) {
    result.scanned += 1;
    try {
      const lastEdited = new Date(page.last_edited_time);
      const prev = byPage.get(page.id);
      if (prev && !ctx.force && prev.lastEditedTime.getTime() >= lastEdited.getTime()) {
        result.skipped += 1;
        continue;
      }
      const properties = normalizeProperties(page.properties as Record<string, never>);
      const mapped = mapNotionItem(properties, ctx.mappings, ctx.employees, {
        fallbackTitle: rawTitle(page.properties),
        defaultEmployeeId: ctx.defaultEmployeeId,
      });
      const archived = Boolean((page as { in_trash?: boolean }).in_trash || page.archived);
      const data = {
        sourceDatabaseId: ctx.notionDatabaseId,
        title: mapped.title.slice(0, 500),
        url: page.url,
        batch: mapped.batch,
        batchNumber: mapped.batchNumber,
        productCode: mapped.productCode,
        taskType: mapped.taskType,
        itemDate: mapped.itemDate ? fromDateKey(mapped.itemDate) : null,
        employeeId: mapped.employeeId,
        properties: properties as Prisma.InputJsonValue,
        createdTime: new Date(page.created_time),
        lastEditedTime: lastEdited,
        lastSyncedAt: new Date(),
        isArchived: archived,
      };

      await db.$transaction(async (tx) => {
        const item = prev
          ? await tx.notionSyncedItem.update({ where: { id: prev.id }, data })
          : await tx.notionSyncedItem.create({ data: { ...data, dataSourceId: ctx.dataSourceId, notionPageId: page.id } });

        const prevStages = new Map((prev?.stages ?? []).map((s) => [s.stageKey, s]));
        for (const stage of mapped.stages) {
          const old = prevStages.get(stage.stageKey);
          const changed =
            !old || old.systemStatus !== stage.systemStatus || old.rawValues.join("|") !== stage.rawValues.join("|");
          if (!changed) continue;
          const statusChanged = !old || old.systemStatus !== stage.systemStatus;
          await tx.notionItemStage.upsert({
            where: { itemId_stageKey: { itemId: item.id, stageKey: stage.stageKey } },
            create: {
              itemId: item.id,
              stageKey: stage.stageKey,
              rawValues: stage.rawValues,
              systemStatus: stage.systemStatus as NotionSystemStatus,
              statusChangedAt: lastEdited,
            },
            update: {
              rawValues: stage.rawValues,
              systemStatus: stage.systemStatus as NotionSystemStatus,
              ...(statusChanged ? { statusChangedAt: lastEdited } : {}),
            },
          });
          if (statusChanged && (old || stage.systemStatus !== "NOT_STARTED")) {
            await tx.notionItemEvent.create({
              data: {
                itemId: item.id,
                stageKey: stage.stageKey,
                fromStatus: old?.systemStatus ?? null,
                toStatus: stage.systemStatus as NotionSystemStatus,
                fromRaw: old?.rawValues ?? [],
                toRaw: stage.rawValues,
                occurredAt: lastEdited,
              },
            });
            if (stage.systemStatus === "NEEDS_REVISION" && old) result.newRevisionItemIds.push(item.id);
          }
        }
      });
      if (prev) result.updated += 1;
      else result.created += 1;
    } catch (e) {
      result.errors.push({ pageId: page.id, message: notionErrorMessage(e) });
    }
  }
}

/**
 * Incremental sync: only pages edited since the stored cursor are fetched,
 * sorted ascending so the cursor can advance safely even on partial runs.
 */
export async function syncDataSource(
  dataSourceId: string,
  trigger: SyncTrigger,
  opts: { triggeredById?: string | null; retryOfId?: string | null; afterRefresh?: boolean } = {},
): Promise<SyncResult> {
  const ds = await db.notionDataSource.findUniqueOrThrow({ where: { id: dataSourceId } });
  const full = trigger === "FULL_RESYNC";
  const cursorFrom = full ? null : ds.syncCursor;
  const startedAt = new Date();
  const log = await db.notionSyncLog.create({
    data: {
      dataSourceId,
      trigger,
      cursorFrom,
      triggeredById: opts.triggeredById ?? null,
      retryOfId: opts.retryOfId ?? null,
    },
  });
  const result: SyncResult = {
    logId: log.id,
    status: "SUCCESS",
    scanned: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    newRevisionItemIds: [],
  };

  let maxEdited: Date | null = cursorFrom;
  let completed = false;
  try {
    const client = await getNotionClient(ds.connectionId);
    const mappings = await loadMappings(dataSourceId);
    const employees = await loadEmployees();
    const ctx = {
      dataSourceId,
      notionDatabaseId: ds.notionDatabaseId,
      defaultEmployeeId: ds.defaultEmployeeId,
      mappings,
      employees,
      force: full,
    };

    let startCursor: string | undefined;
    const deadline = Date.now() + TIME_BUDGET_MS;
    for (;;) {
      const response = await client.dataSources.query({
        data_source_id: ds.notionDataSourceId,
        page_size: PAGE_SIZE,
        start_cursor: startCursor,
        sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
        ...(cursorFrom
          ? {
              filter: {
                timestamp: "last_edited_time",
                last_edited_time: { on_or_after: new Date(cursorFrom.getTime() - CURSOR_OVERLAP_MS).toISOString() },
              },
            }
          : {}),
      });
      const pages = response.results.filter((r): r is NotionPage => r.object === "page" && isFullPage(r as NotionPage));
      await processPages(pages, ctx, result);
      for (const p of pages) {
        const t = new Date(p.last_edited_time);
        if (!maxEdited || t > maxEdited) maxEdited = t;
      }
      if (!response.has_more || !response.next_cursor) {
        completed = response.request_status?.type !== "incomplete";
        break;
      }
      startCursor = response.next_cursor;
      if (Date.now() > deadline) break;
    }

    // a complete full resync can detect pages deleted from Notion
    if (full && completed) {
      await db.notionSyncedItem.updateMany({
        where: { dataSourceId, lastSyncedAt: { lt: startedAt }, isArchived: false },
        data: { isArchived: true },
      });
    }

    result.status = result.errors.length > 0 || !completed ? "PARTIAL" : "SUCCESS";
    await db.notionDataSource.update({
      where: { id: dataSourceId },
      data: { syncCursor: maxEdited, lastSyncedAt: new Date() },
    });
  } catch (e) {
    result.status = "FAILED";
    result.errors.push({ message: notionErrorMessage(e) });
    // an expired OAuth access token can be renewed with the stored refresh token — retry once
    if (isUnauthorized(e) && !opts.afterRefresh) {
      const refreshed = await refreshOAuthToken(ds.connectionId).catch(() => null);
      if (refreshed) {
        result.errors.push({ message: "تم تجديد رمز OAuth تلقائيًا وإعادة المزامنة" });
        await finishLog(log.id, result, maxEdited);
        return syncDataSource(dataSourceId, trigger, { ...opts, retryOfId: log.id, afterRefresh: true });
      }
    }
  }

  await finishLog(log.id, result, maxEdited);
  return result;
}

async function finishLog(logId: string, result: SyncResult, cursorTo: Date | null) {
  await db.notionSyncLog.update({
    where: { id: logId },
    data: {
      status: result.status,
      endTime: new Date(),
      cursorTo,
      recordsScanned: result.scanned,
      recordsCreated: result.created,
      recordsUpdated: result.updated,
      recordsSkipped: result.skipped,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 50) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Re-derive every stage from the stored raw properties after the admin edits
 * field or status mappings — no Notion API calls needed.
 */
export async function rebuildStages(dataSourceId: string) {
  const ds = await db.notionDataSource.findUniqueOrThrow({ where: { id: dataSourceId } });
  const mappings = await loadMappings(dataSourceId);
  const employees = await loadEmployees();
  const stageKeys = mappings.filter((m) => m.role === "STATUS" && m.stageKey).map((m) => m.stageKey as string);
  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    const items = await db.notionSyncedItem.findMany({
      where: { dataSourceId },
      include: { stages: true },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (items.length === 0) break;
    for (const item of items) {
      const properties = (item.properties ?? {}) as Record<string, never>;
      const mapped = mapNotionItem(properties, mappings, employees, {
        fallbackTitle: item.title,
        defaultEmployeeId: ds.defaultEmployeeId,
      });
      const ops: Prisma.PrismaPromise<unknown>[] = [];
      const old = new Map(item.stages.map((s) => [s.stageKey, s]));
      for (const stage of mapped.stages) {
        const prev = old.get(stage.stageKey);
        if (prev && prev.systemStatus === stage.systemStatus && prev.rawValues.join("|") === stage.rawValues.join("|")) continue;
        ops.push(
          db.notionItemStage.upsert({
            where: { itemId_stageKey: { itemId: item.id, stageKey: stage.stageKey } },
            create: {
              itemId: item.id,
              stageKey: stage.stageKey,
              rawValues: stage.rawValues,
              systemStatus: stage.systemStatus as NotionSystemStatus,
              statusChangedAt: item.lastEditedTime,
            },
            update: { rawValues: stage.rawValues, systemStatus: stage.systemStatus as NotionSystemStatus },
          }),
        );
      }
      const removed = item.stages.filter((s) => !stageKeys.includes(s.stageKey)).map((s) => s.id);
      if (removed.length) ops.push(db.notionItemStage.deleteMany({ where: { id: { in: removed } } }));
      const fieldsChanged =
        mapped.title !== item.title ||
        mapped.batch !== item.batch ||
        mapped.productCode !== item.productCode ||
        mapped.taskType !== item.taskType ||
        mapped.employeeId !== item.employeeId;
      if (fieldsChanged || (mapped.itemDate ?? null) !== (item.itemDate ? item.itemDate.toISOString().slice(0, 10) : null)) {
        ops.push(
          db.notionSyncedItem.update({
            where: { id: item.id },
            data: {
              title: mapped.title,
              batch: mapped.batch,
              batchNumber: mapped.batchNumber,
              productCode: mapped.productCode,
              taskType: mapped.taskType,
              itemDate: mapped.itemDate ? fromDateKey(mapped.itemDate) : null,
              employeeId: mapped.employeeId,
            },
          }),
        );
      }
      if (ops.length) await db.$transaction(ops);
      processed += 1;
    }
    cursor = items[items.length - 1].id;
  }
  return processed;
}

/** Data sources whose schedule is due. */
export async function dueDataSources(now = new Date()) {
  const sources = await db.notionDataSource.findMany({
    where: { isActive: true, syncEnabled: true, connection: { isActive: true } },
    select: { id: true, lastSyncedAt: true, syncIntervalMinutes: true },
  });
  return sources.filter(
    (s) => !s.lastSyncedAt || now.getTime() - s.lastSyncedAt.getTime() >= s.syncIntervalMinutes * 60_000 - 30_000,
  );
}
