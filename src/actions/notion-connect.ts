"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Client } from "@notionhq/client";
import { runAction, UserError } from "@/server/action";
import { actionPermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { decryptSecret } from "@/server/crypto";
import { PERMISSIONS } from "@/lib/permissions";
import { idSchema, nameSchema } from "@/lib/validation";
import { SYSTEM_STATUSES } from "@/lib/notion/status";
import { stageKeyFor, suggestMappings, type FieldSuggestion } from "@/lib/notion/auto-map";
import { classifyNotionError, getNotionClient, isUnauthorized, type NotionErrorKind } from "@/server/notion/client";
import { checkOAuthCredentials, oauthConfig, refreshOAuthToken, revokeOAuthToken } from "@/server/notion/oauth";
import { discoverDataSources, fetchDataSourceSchema, sampleObservedValues, type DiscoveredDataSource } from "@/server/notion/schema";
import { rebuildStages } from "@/server/notion/sync";

export type NotionFailure = { kind: NotionErrorKind; message: string };
type WithFailure<T> = ({ failure: null } & T) | { failure: NotionFailure };

/**
 * Run a Notion call for a connection; renews an expired OAuth token once and
 * turns every Notion error into a friendly { kind, message } the UI can act on.
 */
async function withNotion<T>(connectionId: string, fn: (client: Client) => Promise<T>): Promise<WithFailure<{ value: T }>> {
  try {
    try {
      return { failure: null, value: await fn(await getNotionClient(connectionId)) };
    } catch (e) {
      if (!isUnauthorized(e) || !(await refreshOAuthToken(connectionId).catch(() => null))) throw e;
      return { failure: null, value: await fn(await getNotionClient(connectionId)) };
    }
  } catch (e) {
    const failure = classifyNotionError(e);
    if (failure.kind === "reconnect") {
      await db.notionConnection.updateMany({
        where: { id: connectionId, isActive: true },
        data: { status: "FAILED", lastError: failure.message, lastTestedAt: new Date() },
      });
    } else if (failure.kind === "temporary") {
      console.error("[notion-connect]", e instanceof Error ? e.message : e);
    }
    return { failure };
  }
}

export interface DatabaseListItem extends DiscoveredDataSource {
  addedId: string | null;
}

export async function listNotionDatabasesAction(connectionId: string) {
  return runAction(async (): Promise<WithFailure<{ databases: DatabaseListItem[] }>> => {
    await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const id = idSchema.parse(connectionId);
    const res = await withNotion(id, (client) => discoverDataSources(client));
    if (res.failure) return { failure: res.failure };
    const added = await db.notionDataSource.findMany({ where: { connectionId: id }, select: { id: true, notionDataSourceId: true } });
    const byNotionId = new Map(added.map((a) => [a.notionDataSourceId.replace(/-/g, ""), a.id]));
    await db.notionConnection.update({ where: { id }, data: { status: "CONNECTED", lastError: null, lastTestedAt: new Date() } });
    return {
      failure: null,
      databases: res.value.map((d) => ({ ...d, addedId: byNotionId.get(d.id.replace(/-/g, "")) ?? null })),
    };
  });
}

export interface DatabaseAnalysis {
  name: string;
  fields: FieldSuggestion[];
  sampled: number;
}

export async function analyzeNotionDatabaseAction(connectionId: string, notionDataSourceId: string, name: string) {
  return runAction(async (): Promise<WithFailure<{ analysis: DatabaseAnalysis }>> => {
    await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const id = idSchema.parse(connectionId);
    const dsId = z.string().min(8).max(64).parse(notionDataSourceId);
    const res = await withNotion(id, async (client) => {
      const schema = await fetchDataSourceSchema(client, dsId);
      const { observed, sampled } = await sampleObservedValues(client, dsId, schema);
      return { fields: suggestMappings(schema, observed), sampled };
    });
    if (res.failure) return { failure: res.failure };
    return { failure: null, analysis: { name: z.string().max(200).parse(name), ...res.value } };
  });
}

const confirmSchema = z.object({
  connectionId: idSchema,
  notionDataSourceId: z.string().min(8).max(64),
  notionDatabaseId: z.string().min(8).max(64),
  name: nameSchema,
  defaultEmployeeId: z.string().nullable(),
  fields: z
    .array(
      z.object({
        property: z.string().min(1).max(200),
        propertyType: z.string().min(1).max(40),
        role: z.enum(["TITLE", "STATUS", "DATE", "BATCH", "PRODUCT_CODE", "EMPLOYEE", "TASK_TYPE", "TEXT", "NUMBER", "NOTES"]).nullable(),
        stageKey: z.string().max(40).nullable(),
        label: z.string().min(1).max(200),
        ownerEmployeeId: z.string().nullable(),
        statuses: z.array(z.object({ value: z.string().min(1).max(200), status: z.enum(SYSTEM_STATUSES).nullable() })).max(200),
      }),
    )
    .max(200),
});

/** Save the reviewed mapping and create the data source. The client then starts the first sync. */
export async function confirmNotionDatabaseAction(input: z.input<typeof confirmSchema>) {
  return runAction(async (): Promise<WithFailure<{ dataSourceId: string }>> => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const data = confirmSchema.parse(input);

    const exists = await db.notionDataSource.findUnique({
      where: { connectionId_notionDataSourceId: { connectionId: data.connectionId, notionDataSourceId: data.notionDataSourceId } },
      select: { id: true },
    });
    if (exists) throw new UserError("هذه القاعدة مربوطة مسبقًا");

    const res = await withNotion(data.connectionId, (client) => fetchDataSourceSchema(client, data.notionDataSourceId));
    if (res.failure) return { failure: res.failure };
    const schema = res.value;
    const known = new Map(schema.map((p) => [p.name, p.type]));

    const employeeIds = new Set((await db.employee.findMany({ select: { id: true } })).map((e) => e.id));
    const validEmployee = (v: string | null) => (v && employeeIds.has(v) ? v : null);

    const used = new Set<string>();
    const singleRoles = new Set<string>();
    const mappings = data.fields
      .filter((f) => f.role && known.has(f.property))
      .filter((f) => f.role === "STATUS" || (!singleRoles.has(f.role!) && singleRoles.add(f.role!)))
      .map((f, i) => {
        let stageKey: string | null = null;
        if (f.role === "STATUS") {
          stageKey = f.stageKey && /^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(f.stageKey) && !used.has(f.stageKey) ? f.stageKey : stageKeyFor(f.label, used);
          used.add(stageKey);
        }
        return {
          role: f.role!,
          notionProperty: f.property,
          notionPropertyType: known.get(f.property)!,
          stageKey,
          label: f.label,
          ownerEmployeeId: f.role === "STATUS" ? validEmployee(f.ownerEmployeeId) : null,
          sortOrder: i,
          statuses: f.role === "STATUS" ? f.statuses.filter((s) => s.status).map((s) => ({ notionValue: s.value, systemStatus: s.status! })) : [],
        };
      });

    const created = await db.$transaction(async (tx) => {
      const ds = await tx.notionDataSource.create({
        data: {
          connectionId: data.connectionId,
          name: data.name,
          notionDatabaseId: data.notionDatabaseId,
          notionDataSourceId: data.notionDataSourceId,
          defaultEmployeeId: validEmployee(data.defaultEmployeeId),
          schemaCache: schema as unknown as object,
          schemaFetchedAt: new Date(),
        },
      });
      for (const { statuses, ...m } of mappings) {
        await tx.notionFieldMapping.create({
          data: { ...m, dataSourceId: ds.id, statusMappings: statuses.length ? { create: statuses } : undefined },
        });
      }
      return ds;
    });

    await audit({
      user,
      action: "notion.data_source.create",
      entityType: "NotionDataSource",
      entityId: created.id,
      after: {
        name: data.name,
        via: "connect-wizard",
        fields: mappings.map((m) => ({ role: m.role, property: m.notionProperty, stage: m.stageKey, statuses: m.statuses.length })),
      },
    });
    await rebuildStages(created.id);
    revalidatePath("/", "layout");
    return { failure: null, dataSourceId: created.id };
  });
}

/** Revoke the OAuth token at Notion and wipe local credentials. Synced history is kept; reconnecting the same workspace resumes it. */
export async function disconnectNotionAction(connectionId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const conn = await db.notionConnection.findUniqueOrThrow({ where: { id: idSchema.parse(connectionId) } });
    let revoked = false;
    if (conn.authType === "OAUTH" && conn.tokenEncrypted) {
      revoked = await revokeOAuthToken(decryptSecret(conn.tokenEncrypted));
    }
    await db.notionConnection.update({
      where: { id: conn.id },
      data: { tokenEncrypted: "", tokenHint: "", refreshTokenEncrypted: null, isActive: false, status: "UNTESTED", lastError: null },
    });
    await audit({
      user,
      action: "notion.connection.disconnect",
      entityType: "NotionConnection",
      entityId: conn.id,
      before: { workspaceName: conn.workspaceName, ownerEmail: conn.ownerEmail },
      after: { revokedAtNotion: revoked },
    });
    revalidatePath("/", "layout");
  }, "تم قطع الاتصال بـ Notion وحذف بيانات الدخول");
}

/** Admin diagnostics: is the OAuth app configured, and does Notion accept its Client ID/Secret? */
export async function checkNotionOAuthAction() {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    if (user.roleKey !== "ADMIN") throw new UserError("هذا الفحص متاح لمسؤول النظام فقط");
    const result = await checkOAuthCredentials();
    return { result, redirectUri: oauthConfig()?.redirectUri ?? null };
  });
}
