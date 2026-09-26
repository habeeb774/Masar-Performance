import "server-only";
import type { Client } from "@notionhq/client";
import { db } from "@/server/db";
import { getNotionClient, parseNotionId } from "./client";

export interface NotionPropertySchema {
  id: string;
  name: string;
  type: string;
  options: { name: string; color?: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPropertySchema(properties: Record<string, any>): NotionPropertySchema[] {
  return Object.values(properties).map((p) => {
    const cfg = p[p.type];
    const options = Array.isArray(cfg?.options) ? cfg.options.map((o: { name: string; color?: string }) => ({ name: o.name, color: o.color })) : [];
    return { id: p.id, name: p.name, type: p.type, options };
  });
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
