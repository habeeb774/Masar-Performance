"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { NotionFieldRole, NotionSystemStatus } from "@/generated/prisma/enums";
import { runAction, UserError } from "@/server/action";
import { actionPermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { encryptSecret } from "@/server/crypto";
import { PERMISSIONS } from "@/lib/permissions";
import { fieldMappingsSchema, idSchema, notionConnectionSchema, notionDataSourceSchema, statusMappingsSchema } from "@/lib/validation";
import { notionFilterRuleSchema } from "@/lib/notion/filter-rule";
import { matchPreset } from "@/lib/notion/presets";
import { computeBreakdown } from "@/lib/notion/progress";
import { getNotionClient, isUnauthorized, notionErrorMessage, probeToken } from "@/server/notion/client";
import { refreshOAuthToken } from "@/server/notion/oauth";
import { fetchDataSourceSchema, readSchemaCache, refreshSchemaCache, resolveNotionTarget } from "@/server/notion/schema";
import { rebuildStages, syncDataSource } from "@/server/notion/sync";
import { loadEvalItems, recomputeForDataSource } from "@/server/services/progress";
import { notifyRevisions } from "@/server/services/jobs";

const refresh = () => revalidatePath("/", "layout");

// ---- connections --------------------------------------------------------------------

export async function saveConnectionAction(id: string | null, input: z.input<typeof notionConnectionSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const data = notionConnectionSchema.parse(input);
    let tokenFields = {};
    let probe: Awaited<ReturnType<typeof probeToken>> | null = null;
    if (data.token) {
      try {
        probe = await probeToken(data.token);
      } catch (e) {
        // the OAuth "client secret" also starts with secret_ but is not an API token
        if (isUnauthorized(e) && data.token.startsWith("secret_")) {
          throw new UserError("رفض Notion هذا الرمز. إن كان «Client Secret» من ربط OAuth فهو ليس رمز وصول — استخدم زر «ربط عبر Notion (OAuth)» بدلًا من لصقه.");
        }
        throw new UserError(notionErrorMessage(e));
      }
      tokenFields = {
        tokenEncrypted: encryptSecret(data.token),
        tokenHint: data.token.slice(-4),
        botName: probe.botName,
        workspaceName: probe.workspaceName,
        status: "CONNECTED" as const,
        lastTestedAt: new Date(),
        lastError: null,
      };
    } else if (!id) {
      throw new UserError("رمز التكامل مطلوب");
    }
    if (id) {
      await db.notionConnection.update({ where: { id }, data: { name: data.name, isActive: data.isActive, ...tokenFields } });
      await audit({ user, action: "notion.connection.update", entityType: "NotionConnection", entityId: id, after: { name: data.name, isActive: data.isActive, tokenChanged: !!data.token } });
    } else {
      const created = await db.notionConnection.create({
        data: { name: data.name, isActive: data.isActive, createdById: user.id, ...(tokenFields as { tokenEncrypted: string; tokenHint: string }) },
      });
      await audit({ user, action: "notion.connection.create", entityType: "NotionConnection", entityId: created.id, after: { name: data.name } });
    }
    refresh();
  }, "تم حفظ الاتصال والتحقق من الرمز");
}

export async function testConnectionAction(id: string) {
  return runAction(async () => {
    await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const probe = async () => (await getNotionClient(idSchema.parse(id))).users.me({});
    try {
      try {
        await probe();
      } catch (e) {
        // expired OAuth access token → renew with the refresh token and retry once
        if (!isUnauthorized(e) || !(await refreshOAuthToken(id).catch(() => null))) throw e;
        await probe();
      }
      await db.notionConnection.update({ where: { id }, data: { status: "CONNECTED", lastTestedAt: new Date(), lastError: null } });
    } catch (e) {
      const message = notionErrorMessage(e);
      await db.notionConnection.update({ where: { id }, data: { status: "FAILED", lastTestedAt: new Date(), lastError: message } });
      refresh();
      throw new UserError(message);
    }
    refresh();
  }, "الاتصال يعمل بنجاح");
}

export async function deleteConnectionAction(id: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const before = await db.notionConnection.findUniqueOrThrow({ where: { id: idSchema.parse(id) }, select: { id: true, name: true } });
    await db.notionConnection.delete({ where: { id } });
    await audit({ user, action: "notion.connection.delete", entityType: "NotionConnection", entityId: id, before });
    refresh();
  }, "تم حذف الاتصال");
}

// ---- data sources -------------------------------------------------------------------

export async function discoverDatabaseAction(connectionId: string, urlOrId: string) {
  return runAction(async () => {
    await actionPermission(PERMISSIONS.NOTION_MANAGE);
    try {
      const client = await getNotionClient(idSchema.parse(connectionId));
      return await resolveNotionTarget(client, z.string().min(8).max(500).parse(urlOrId));
    } catch (e) {
      throw new UserError(notionErrorMessage(e));
    }
  });
}

export async function saveDataSourceAction(id: string | null, input: z.input<typeof notionDataSourceSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const data = notionDataSourceSchema.parse(input);
    if (id) {
      const before = await db.notionDataSource.findUniqueOrThrow({ where: { id } });
      const after = await db.notionDataSource.update({ where: { id }, data });
      await audit({ user, action: "notion.data_source.update", entityType: "NotionDataSource", entityId: id, before, after, diff: true });
      if (before.defaultEmployeeId !== after.defaultEmployeeId) await rebuildStages(id);
      refresh();
      return { id };
    }
    let schema;
    try {
      schema = await fetchDataSourceSchema(await getNotionClient(data.connectionId), data.notionDataSourceId);
    } catch (e) {
      throw new UserError(notionErrorMessage(e));
    }
    const created = await db.notionDataSource.create({ data: { ...data, schemaCache: schema as unknown as object, schemaFetchedAt: new Date() } });
    await audit({ user, action: "notion.data_source.create", entityType: "NotionDataSource", entityId: created.id, after: data });
    refresh();
    return { id: created.id };
  }, "تم حفظ قاعدة البيانات");
}

export async function deleteDataSourceAction(id: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const before = await db.notionDataSource.findUniqueOrThrow({ where: { id: idSchema.parse(id) }, select: { id: true, name: true } });
    await db.notionDataSource.delete({ where: { id } });
    await audit({ user, action: "notion.data_source.delete", entityType: "NotionDataSource", entityId: id, before });
    refresh();
  }, "تم حذف قاعدة البيانات وبياناتها المتزامنة");
}

export async function refreshSchemaAction(id: string) {
  return runAction(async () => {
    await actionPermission(PERMISSIONS.NOTION_MANAGE);
    try {
      await refreshSchemaCache(idSchema.parse(id));
    } catch (e) {
      throw new UserError(notionErrorMessage(e));
    }
    refresh();
  }, "تم تحديث خصائص القاعدة من Notion");
}

export async function applyPresetAction(dataSourceId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const ds = await db.notionDataSource.findUniqueOrThrow({ where: { id: idSchema.parse(dataSourceId) }, include: { fieldMappings: true } });
    const matched = matchPreset(readSchemaCache(ds.schemaCache));
    if (matched.length === 0) throw new UserError("لم يتم العثور على حقول مطابقة للقالب في هذه القاعدة");
    let created = 0;
    for (const [i, f] of matched.entries()) {
      const exists = ds.fieldMappings.some((m) => m.notionProperty === f.notionProperty && m.role === f.role) || (f.stageKey && ds.fieldMappings.some((m) => m.stageKey === f.stageKey));
      if (exists) continue;
      await db.notionFieldMapping.create({
        data: {
          dataSourceId: ds.id,
          role: f.role as NotionFieldRole,
          notionProperty: f.notionProperty,
          notionPropertyType: f.notionPropertyType,
          stageKey: f.stageKey ?? null,
          label: f.label,
          sortOrder: ds.fieldMappings.length + i,
          statusMappings: f.statuses?.length
            ? { create: f.statuses.map((s) => ({ notionValue: s.value, systemStatus: s.status as NotionSystemStatus, precedence: s.precedence ?? 0 })) }
            : undefined,
        },
      });
      created++;
    }
    await audit({ user, action: "notion.mapping.update", entityType: "NotionDataSource", entityId: ds.id, after: { preset: "PRODUCTS", created } });
    await rebuildStages(ds.id);
    refresh();
    return { created };
  }, "تم تطبيق الربط المقترح");
}

export async function saveFieldMappingsAction(input: z.input<typeof fieldMappingsSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const data = fieldMappingsSchema.parse(input);
    const before = await db.notionFieldMapping.findMany({ where: { dataSourceId: data.dataSourceId } });
    const keep = new Set(data.mappings.map((m) => m.id).filter(Boolean));
    await db.$transaction(async (tx) => {
      await tx.notionFieldMapping.deleteMany({ where: { dataSourceId: data.dataSourceId, id: { notIn: [...keep] as string[] } } });
      for (const [i, m] of data.mappings.entries()) {
        const row = {
          role: m.role,
          notionProperty: m.notionProperty,
          notionPropertyType: m.notionPropertyType,
          stageKey: m.role === "STATUS" ? m.stageKey || null : null,
          label: m.label,
          ownerEmployeeId: m.ownerEmployeeId,
          isActive: m.isActive,
          sortOrder: i,
        };
        if (m.id) await tx.notionFieldMapping.update({ where: { id: m.id }, data: row });
        else await tx.notionFieldMapping.create({ data: { ...row, dataSourceId: data.dataSourceId } });
      }
    });
    await audit({ user, action: "notion.mapping.update", entityType: "NotionDataSource", entityId: data.dataSourceId, before, after: data.mappings });
    await rebuildStages(data.dataSourceId);
    await recomputeForDataSource(data.dataSourceId);
    refresh();
  }, "تم حفظ ربط الحقول وإعادة احتساب الحالات");
}

export async function saveStatusMappingsAction(input: z.input<typeof statusMappingsSchema>) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_MANAGE);
    const data = statusMappingsSchema.parse(input);
    const field = await db.notionFieldMapping.findUniqueOrThrow({ where: { id: data.fieldMappingId }, include: { statusMappings: true } });
    await db.$transaction([
      db.notionStatusMapping.deleteMany({ where: { fieldMappingId: field.id } }),
      db.notionStatusMapping.createMany({ data: data.rows.map((r) => ({ fieldMappingId: field.id, notionValue: r.notionValue, systemStatus: r.systemStatus, precedence: r.precedence })) }),
    ]);
    await audit({
      user,
      action: "notion.status_mapping.update",
      entityType: "NotionFieldMapping",
      entityId: field.id,
      before: field.statusMappings.map((s) => ({ value: s.notionValue, status: s.systemStatus })),
      after: data.rows.map((r) => ({ value: r.notionValue, status: r.systemStatus })),
    });
    await rebuildStages(field.dataSourceId);
    await recomputeForDataSource(field.dataSourceId);
    refresh();
  }, "تم حفظ ربط الحالات وإعادة احتساب الإنجاز");
}

// ---- sync ------------------------------------------------------------------------------

export async function syncNowAction(dataSourceId: string, full = false) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_SYNC);
    const id = idSchema.parse(dataSourceId);
    const result = await syncDataSource(id, full ? "FULL_RESYNC" : "MANUAL", { triggeredById: user.id });
    await audit({ user, action: "notion.sync", entityType: "NotionDataSource", entityId: id, after: { status: result.status, scanned: result.scanned, full } });
    await notifyRevisions(result.newRevisionItemIds);
    await recomputeForDataSource(id);
    refresh();
    if (result.status === "FAILED") throw new UserError(`فشلت المزامنة: ${result.errors[0]?.message ?? ""}`);
    return result;
  });
}

export async function retrySyncAction(logId: string) {
  return runAction(async () => {
    const user = await actionPermission(PERMISSIONS.NOTION_SYNC);
    const log = await db.notionSyncLog.findUniqueOrThrow({ where: { id: idSchema.parse(logId) } });
    const result = await syncDataSource(log.dataSourceId, "RETRY", { triggeredById: user.id, retryOfId: log.id });
    await notifyRevisions(result.newRevisionItemIds);
    await recomputeForDataSource(log.dataSourceId);
    refresh();
    if (result.status === "FAILED") throw new UserError(`فشلت إعادة المحاولة: ${result.errors[0]?.message ?? ""}`);
    return result;
  });
}

/** Dry-run a goal filter rule against synced items (used by the goal editor). */
export async function testFilterRuleAction(input: { dataSourceId: string; rule: unknown; start: string | null; end: string | null; employeeId: string | null; target: number }) {
  return runAction(async () => {
    await actionPermission(PERMISSIONS.PLANS_MANAGE, PERMISSIONS.GOAL_TEMPLATES_MANAGE, PERMISSIONS.PLANS_DISTRIBUTE_OWN);
    const rule = notionFilterRuleSchema.parse(input.rule);
    const items = await loadEvalItems(idSchema.parse(input.dataSourceId), rule.stageKey);
    return computeBreakdown(items, rule, { start: input.start, end: input.end, employeeId: input.employeeId }, Number(input.target) || 0);
  });
}
