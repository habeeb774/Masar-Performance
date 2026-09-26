import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SyncStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { toDateKey } from "@/lib/dates";
import { num } from "@/lib/num";
import type { SystemStatus } from "@/lib/notion/status";

/** Serializable property snapshot stored in NotionDataSource.schemaCache. */
export interface SchemaProperty {
  id: string;
  name: string;
  type: string;
  options: { name: string; color?: string }[];
}

export function parseSchemaCache(value: unknown): SchemaProperty[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string")
    .map((p) => ({
      id: String(p.id ?? p.name),
      name: String(p.name),
      type: String(p.type ?? "unknown"),
      options: Array.isArray(p.options)
        ? (p.options as { name?: unknown; color?: unknown }[])
            .filter((o) => typeof o?.name === "string")
            .map((o) => ({ name: String(o.name), color: typeof o.color === "string" ? o.color : undefined }))
        : [],
    }));
}

const norm = (v: string) => v.normalize("NFC").trim().replace(/\s+/g, " ");

export type SyncErrorEntry = { pageId?: string; message: string };

export function parseSyncErrors(value: unknown): SyncErrorEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && typeof e === "object")
    .map((e) => {
      const o = e as { pageId?: unknown; message?: unknown };
      return { pageId: typeof o.pageId === "string" ? o.pageId : undefined, message: typeof o.message === "string" ? o.message : JSON.stringify(e) };
    })
    .slice(0, 200);
}

export async function employeeOptions() {
  const rows = await db.employee.findMany({
    where: { status: { not: "TERMINATED" } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return rows.map((e) => ({ value: e.id, label: e.fullName }));
}

// ---- raw value aggregation ------------------------------------------------------------

interface RawValueRow {
  dataSourceId: string;
  stageKey: string;
  value: string;
  count: bigint | number;
  unmapped: bigint | number;
}

/** Distinct raw option values seen per (data source, stage) in synced items. */
async function rawValueCounts(dataSourceId?: string, limit = 1000) {
  const rows = await db.$queryRaw<RawValueRow[]>`
    SELECT i."dataSourceId" AS "dataSourceId", s."stageKey" AS "stageKey", v AS "value",
           COUNT(*) AS "count",
           COUNT(*) FILTER (WHERE s."systemStatus" = 'UNMAPPED') AS "unmapped"
    FROM "NotionItemStage" s
    JOIN "NotionSyncedItem" i ON i."id" = s."itemId"
    CROSS JOIN LATERAL unnest(s."rawValues") AS v
    WHERE i."isArchived" = false
      AND (${dataSourceId ?? null}::text IS NULL OR i."dataSourceId" = ${dataSourceId ?? null}::text)
    GROUP BY 1, 2, 3
    ORDER BY 4 DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ dataSourceId: r.dataSourceId, stageKey: r.stageKey, value: r.value, count: Number(r.count), unmapped: Number(r.unmapped) }));
}

// ---- overview -------------------------------------------------------------------------

export async function getNotionOverview() {
  const [connections, sources, itemsTotal, stageGroups, recentLogs, successfulSyncs, rawValues] = await Promise.all([
    db.notionConnection.findMany({ select: { id: true, name: true, status: true, isActive: true } }),
    db.notionDataSource.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        connection: { select: { name: true, isActive: true, status: true } },
        fieldMappings: { select: { id: true, role: true, stageKey: true, label: true, notionProperty: true, isActive: true, statusMappings: { select: { notionValue: true } } } },
        syncLogs: { orderBy: { startTime: "desc" }, take: 1, select: { status: true, startTime: true, endTime: true, errorCount: true } },
        _count: { select: { items: { where: { isArchived: false } } } },
      },
    }),
    db.notionSyncedItem.count({ where: { isArchived: false } }),
    db.notionItemStage.groupBy({ by: ["systemStatus"], where: { item: { isArchived: false } }, _count: { _all: true } }),
    db.notionSyncLog.findMany({
      orderBy: { startTime: "desc" },
      take: 5,
      include: { dataSource: { select: { name: true } } },
    }),
    db.notionSyncLog.count({ where: { status: { in: ["SUCCESS", "PARTIAL"] } } }),
    rawValueCounts(undefined, 2000),
  ]);

  const statusFields = sources.flatMap((s) => s.fieldMappings.filter((m) => m.role === "STATUS"));
  const onboarding = {
    connection: connections.length > 0,
    connectionOk: connections.some((c) => c.status === "CONNECTED" && c.isActive),
    dataSource: sources.length > 0,
    fields: sources.some((s) => s.fieldMappings.some((m) => m.role === "TITLE") && s.fieldMappings.some((m) => m.role === "STATUS")),
    statuses: statusFields.length > 0 && statusFields.every((f) => f.statusMappings.length > 0),
    firstSync: successfulSyncs > 0,
  };

  // unmapped raw values (values that have no status mapping on their stage field)
  const unmapped: { dataSourceId: string; dataSourceName: string; stageKey: string; stageLabel: string; value: string; count: number }[] = [];
  for (const r of rawValues) {
    const ds = sources.find((s) => s.id === r.dataSourceId);
    if (!ds) continue;
    const field = ds.fieldMappings.find((m) => m.role === "STATUS" && m.stageKey === r.stageKey);
    const mapped = field?.statusMappings.some((sm) => norm(sm.notionValue) === norm(r.value));
    if (mapped) continue;
    unmapped.push({ dataSourceId: ds.id, dataSourceName: ds.name, stageKey: r.stageKey, stageLabel: field?.label ?? r.stageKey, value: r.value, count: r.count });
  }

  const byStatus = Object.fromEntries(stageGroups.map((g) => [g.systemStatus, g._count._all])) as Partial<Record<SystemStatus, number>>;

  return {
    onboarding,
    connectionsCount: connections.length,
    itemsTotal,
    byStatus,
    unmapped: unmapped.slice(0, 40),
    unmappedTotal: unmapped.length,
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      purpose: s.purpose,
      connectionName: s.connection.name,
      connectionActive: s.connection.isActive,
      isActive: s.isActive,
      syncEnabled: s.syncEnabled,
      syncIntervalMinutes: s.syncIntervalMinutes,
      lastSyncedAt: s.lastSyncedAt,
      lastLog: s.syncLogs[0] ?? null,
      itemsCount: s._count.items,
      stagesCount: s.fieldMappings.filter((m) => m.role === "STATUS" && m.isActive).length,
      mappingsCount: s.fieldMappings.length,
    })),
    recentLogs: recentLogs.map((l) => ({
      id: l.id,
      dataSourceName: l.dataSource.name,
      trigger: l.trigger,
      status: l.status,
      startTime: l.startTime,
      endTime: l.endTime,
      recordsScanned: l.recordsScanned,
      recordsCreated: l.recordsCreated,
      recordsUpdated: l.recordsUpdated,
      errorCount: l.errorCount,
    })),
  };
}

// ---- connections ----------------------------------------------------------------------

/** Never selects tokenEncrypted — only the 4-char hint leaves the server. */
export async function listConnections() {
  const rows = await db.notionConnection.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      tokenHint: true,
      workspaceName: true,
      botName: true,
      status: true,
      lastTestedAt: true,
      lastError: true,
      isActive: true,
      createdAt: true,
      _count: { select: { dataSources: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    tokenHint: c.tokenHint,
    workspaceName: c.workspaceName,
    botName: c.botName,
    status: c.status,
    lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
    lastError: c.lastError,
    isActive: c.isActive,
    dataSourcesCount: c._count.dataSources,
  }));
}

// ---- data sources ---------------------------------------------------------------------

export async function listDataSources() {
  const rows = await db.notionDataSource.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      connection: { select: { id: true, name: true } },
      defaultEmployee: { select: { id: true, fullName: true } },
      _count: { select: { items: { where: { isArchived: false } }, fieldMappings: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    purpose: s.purpose,
    connectionId: s.connectionId,
    connectionName: s.connection.name,
    notionDatabaseId: s.notionDatabaseId,
    notionDataSourceId: s.notionDataSourceId,
    isActive: s.isActive,
    syncEnabled: s.syncEnabled,
    syncIntervalMinutes: s.syncIntervalMinutes,
    defaultEmployeeId: s.defaultEmployeeId,
    defaultEmployeeName: s.defaultEmployee?.fullName ?? null,
    lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
    schemaFetchedAt: s.schemaFetchedAt?.toISOString() ?? null,
    itemsCount: s._count.items,
    mappingsCount: s._count.fieldMappings,
  }));
}

export async function dataSourceOptions() {
  const rows = await db.notionDataSource.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

// ---- mappings -------------------------------------------------------------------------

export async function getMappingsData(dataSourceId: string) {
  const ds = await db.notionDataSource.findUnique({
    where: { id: dataSourceId },
    include: {
      connection: { select: { name: true } },
      fieldMappings: {
        orderBy: { sortOrder: "asc" },
        include: { statusMappings: { orderBy: [{ precedence: "desc" }, { notionValue: "asc" }] } },
      },
    },
  });
  if (!ds) return null;
  const schema = parseSchemaCache(ds.schemaCache);
  const raw = await rawValueCounts(ds.id, 1000);

  const statusFields = ds.fieldMappings
    .filter((m) => m.role === "STATUS" && m.stageKey)
    .map((m) => {
      const prop = schema.find((p) => p.name === m.notionProperty);
      const seen = raw.filter((r) => r.stageKey === m.stageKey);
      const rows = new Map<string, { notionValue: string; systemStatus: SystemStatus | null; precedence: number; count: number; inSchema: boolean; color: string | null }>();
      for (const o of prop?.options ?? []) {
        rows.set(norm(o.name), { notionValue: o.name, systemStatus: null, precedence: 0, count: 0, inSchema: true, color: o.color ?? null });
      }
      for (const sm of m.statusMappings) {
        const k = norm(sm.notionValue);
        const prev = rows.get(k);
        rows.set(k, {
          notionValue: prev?.notionValue ?? sm.notionValue,
          systemStatus: sm.systemStatus,
          precedence: sm.precedence,
          count: 0,
          inSchema: prev?.inSchema ?? false,
          color: prev?.color ?? sm.color ?? null,
        });
      }
      for (const r of seen) {
        const k = norm(r.value);
        const prev = rows.get(k);
        if (prev) prev.count += r.count;
        else rows.set(k, { notionValue: r.value, systemStatus: null, precedence: 0, count: r.count, inSchema: false, color: null });
      }
      return {
        id: m.id,
        stageKey: m.stageKey as string,
        label: m.label,
        notionProperty: m.notionProperty,
        notionPropertyType: m.notionPropertyType,
        isActive: m.isActive,
        propertyMissing: schema.length > 0 && !prop,
        rows: [...rows.values()],
      };
    });

  const [items, employees] = await Promise.all([
    db.notionSyncedItem.findMany({
      where: { dataSourceId: ds.id, isArchived: false },
      orderBy: { lastSyncedAt: "desc" },
      take: 20,
      include: { employee: { select: { fullName: true } }, stages: { select: { stageKey: true, systemStatus: true, rawValues: true } } },
    }),
    employeeOptions(),
  ]);

  return {
    dataSource: {
      id: ds.id,
      name: ds.name,
      connectionName: ds.connection.name,
      schemaFetchedAt: ds.schemaFetchedAt?.toISOString() ?? null,
    },
    schema,
    employees,
    fieldMappings: ds.fieldMappings.map((m) => ({
      id: m.id,
      role: m.role,
      notionProperty: m.notionProperty,
      notionPropertyType: m.notionPropertyType,
      stageKey: m.stageKey ?? "",
      label: m.label,
      ownerEmployeeId: m.ownerEmployeeId ?? "",
      isActive: m.isActive,
    })),
    statusFields,
    stages: ds.fieldMappings.filter((m) => m.role === "STATUS" && m.stageKey).map((m) => ({ stageKey: m.stageKey as string, label: m.label })),
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      url: i.url,
      batch: i.batch,
      batchNumber: i.batchNumber === null ? null : num(i.batchNumber),
      productCode: i.productCode,
      itemDate: i.itemDate ? toDateKey(i.itemDate) : null,
      employeeName: i.employee?.fullName ?? null,
      stages: i.stages.map((s) => ({ stageKey: s.stageKey, systemStatus: s.systemStatus, rawValues: s.rawValues })),
    })),
  };
}

// ---- sync logs ------------------------------------------------------------------------

export async function listSyncLogs(filters: { dataSourceId?: string; status?: SyncStatus }, skip: number, take: number) {
  const where: Prisma.NotionSyncLogWhereInput = {
    ...(filters.dataSourceId ? { dataSourceId: filters.dataSourceId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [total, rows] = await Promise.all([
    db.notionSyncLog.count({ where }),
    db.notionSyncLog.findMany({ where, orderBy: { startTime: "desc" }, skip, take, include: { dataSource: { select: { name: true } } } }),
  ]);
  return {
    total,
    rows: rows.map((l) => ({
      id: l.id,
      dataSourceName: l.dataSource.name,
      trigger: l.trigger,
      status: l.status,
      startTime: l.startTime.toISOString(),
      endTime: l.endTime?.toISOString() ?? null,
      durationMs: l.endTime ? l.endTime.getTime() - l.startTime.getTime() : null,
      cursorFrom: l.cursorFrom?.toISOString() ?? null,
      cursorTo: l.cursorTo?.toISOString() ?? null,
      recordsScanned: l.recordsScanned,
      recordsCreated: l.recordsCreated,
      recordsUpdated: l.recordsUpdated,
      recordsSkipped: l.recordsSkipped,
      errorCount: l.errorCount,
      errors: parseSyncErrors(l.errors),
      isRetry: !!l.retryOfId,
    })),
  };
}
