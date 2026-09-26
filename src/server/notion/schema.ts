import "server-only";
import type { Client } from "@notionhq/client";
import { db } from "@/server/db";
import type { StatusGroup } from "@/lib/notion/auto-map";
import { getNotionClient, parseNotionId } from "./client";

export interface NotionPropertySchema {
  id: string;
  name: string;
  type: string;
  options: { name: string; color?: string; group?: StatusGroup | null }[];
}

const GROUP_BY_NAME: Record<string, StatusGroup> = { "to-do": "to_do", "to do": "to_do", "in progress": "in_progress", complete: "complete" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPropertySchema(properties: Record<string, any>): NotionPropertySchema[] {
  return Object.values(properties).map((p) => {
    const cfg = p[p.type];
    // status options belong to Notion's fixed groups (To-do / In progress / Complete) — a strong mapping hint
    const groupOf = new Map<string, StatusGroup>();
    if (Array.isArray(cfg?.groups)) {
      for (const g of cfg.groups as { name: string; option_ids: string[] }[]) {
        const group = GROUP_BY_NAME[g.name.toLowerCase()];
        if (group) for (const id of g.option_ids) groupOf.set(id, group);
      }
    }
    const options = Array.isArray(cfg?.options)
      ? cfg.options.map((o: { id?: string; name: string; color?: string }) => ({ name: o.name, color: o.color, group: (o.id && groupOf.get(o.id)) || null }))
      : [];
    return { id: p.id, name: p.name, type: p.type, options };
  });
}

export interface DiscoveredDataSource {
  id: string;
  databaseId: string;
  name: string;
  icon: string | null;
  url: string | null;
  lastEditedTime: string | null;
  propertyCount: number;
}

const plain = (rt: { plain_text: string }[] | undefined) => (rt ?? []).map((t) => t.plain_text).join("").trim();

/**
 * Every data source the connection was granted, newest first. Users never see
 * database vs data-source ids — each entry is simply a "قاعدة بيانات".
 */
export async function discoverDataSources(client: Client, limit = 300): Promise<DiscoveredDataSource[]> {
  const out: DiscoveredDataSource[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.search({
      filter: { property: "object", value: "data_source" },
      sort: { timestamp: "last_edited_time", direction: "descending" },
      page_size: 100,
      start_cursor: cursor,
    });
    for (const r of res.results) {
      if (r.object !== "data_source") continue;
      const full = "title" in r ? r : null;
      if (full?.in_trash) continue;
      const parent = full && "database_id" in full.parent ? full.parent.database_id : r.id;
      const icon = full?.icon?.type === "emoji" ? full.icon.emoji : null;
      out.push({
        id: r.id,
        databaseId: parent,
        name: plain(full?.title) || "قاعدة بدون اسم",
        icon,
        url: full?.url ?? null,
        lastEditedTime: full?.last_edited_time ?? null,
        propertyCount: Object.keys(r.properties ?? {}).length,
      });
    }
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor && out.length < limit);
  return out;
}

/** Option values actually used by the most recent items: { property: { value: count } }. */
export async function sampleObservedValues(client: Client, dataSourceId: string, schema: NotionPropertySchema[]) {
  const stageProps = schema.filter((p) => p.type === "status" || p.type === "select" || p.type === "multi_select");
  const observed: Record<string, Record<string, number>> = {};
  if (stageProps.length === 0) return { observed, sampled: 0 };
  const res = await client.dataSources.query({
    data_source_id: dataSourceId,
    page_size: 100,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  let sampled = 0;
  for (const page of res.results) {
    if (page.object !== "page" || !("properties" in page)) continue;
    sampled++;
    for (const p of stageProps) {
      const prop = page.properties[p.name];
      if (!prop) continue;
      const values =
        prop.type === "status" ? [prop.status?.name] : prop.type === "select" ? [prop.select?.name] : prop.type === "multi_select" ? prop.multi_select.map((o) => o.name) : [];
      for (const v of values) if (v) (observed[p.name] ??= {})[v] = (observed[p.name]?.[v] ?? 0) + 1;
    }
  }
  return { observed, sampled };
}

/**
 * Resolve a database URL/id (or a data source id) into its data sources.
 * Notion API 2025-09-03: a database is a container of one or more data sources.
 */
export async function resolveNotionTarget(client: Client, input: string) {
  const id = parseNotionId(input);
  if (!id) throw new Error("رابط أو معرّف Notion غير صالح");
  try {
    const database = await client.databases.retrieve({ database_id: id });
    const title = "title" in database ? database.title.map((t) => t.plain_text).join("") : "";
    const sources = "data_sources" in database ? database.data_sources : [];
    return { databaseId: id, title, dataSources: sources.map((s) => ({ id: s.id, name: s.name })) };
  } catch (e) {
    // maybe the id is a data source id
    try {
      const ds = await client.dataSources.retrieve({ data_source_id: id });
      const parent = "parent" in ds && ds.parent && "database_id" in ds.parent ? ds.parent.database_id : id;
      const name = "title" in ds ? ds.title.map((t) => t.plain_text).join("") : "";
      return { databaseId: parent, title: name, dataSources: [{ id, name }] };
    } catch {
      throw e;
    }
  }
}

export async function fetchDataSourceSchema(client: Client, dataSourceId: string) {
  const ds = await client.dataSources.retrieve({ data_source_id: dataSourceId });
  if (!("properties" in ds)) throw new Error("تعذر قراءة خصائص قاعدة البيانات");
  return toPropertySchema(ds.properties);
}

/** Refresh and cache the property schema of a configured data source. */
export async function refreshSchemaCache(dataSourceId: string) {
  const ds = await db.notionDataSource.findUniqueOrThrow({ where: { id: dataSourceId } });
  const client = await getNotionClient(ds.connectionId);
  const schema = await fetchDataSourceSchema(client, ds.notionDataSourceId);
  await db.notionDataSource.update({
    where: { id: dataSourceId },
    data: { schemaCache: schema as unknown as object, schemaFetchedAt: new Date() },
  });
  return schema;
}

export function readSchemaCache(value: unknown): NotionPropertySchema[] {
  return Array.isArray(value) ? (value as NotionPropertySchema[]) : [];
}
