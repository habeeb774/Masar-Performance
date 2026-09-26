import "server-only";
import { Client, isFullPage } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client";
import { db } from "@/server/db";
import { decryptSecret } from "@/server/crypto";

export { isFullPage };
export type NotionPage = PageObjectResponse;

export function createNotionClient(token: string) {
  return new Client({
    auth: token,
    timeoutMs: 30_000,
    retry: { maxRetries: 4, initialRetryDelayMs: 1000, maxRetryDelayMs: 20_000 },
  });
}

export async function getNotionClient(connectionId: string) {
  const conn = await db.notionConnection.findUnique({ where: { id: connectionId } });
  if (!conn || !conn.isActive) throw new Error("اتصال Notion غير موجود أو معطل");
  return createNotionClient(decryptSecret(conn.tokenEncrypted));
}

/** Validate a token by calling users.me — returns bot/workspace info. */
export async function probeToken(token: string) {
  const client = createNotionClient(token);
  const me = await client.users.me({});
  const bot = me.type === "bot" ? me.bot : null;
  const workspaceName = bot && "workspace_name" in bot ? (bot.workspace_name ?? null) : null;
  return { botName: me.name ?? null, workspaceName };
}

/** Extract a 32-hex Notion id from a URL or raw id and format it as a UUID. */
export function parseNotionId(input: string): string | null {
  const cleaned = input.trim();
  const matches = cleaned.replace(/-/g, "").match(/[0-9a-f]{32}/gi);
  if (!matches) return null;
  // Notion URLs put the object id last (before query params)
  const hex = matches[matches.length - 1].toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isUnauthorized(e: unknown): boolean {
  return !!e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "unauthorized";
}

export function notionErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) {
    const code = String((e as { code: unknown }).code);
    if (code === "unauthorized") return "رمز Notion غير صالح أو منتهي";
    if (code === "object_not_found") return "لم يتم العثور على القاعدة — تأكد من مشاركتها مع التكامل (Connections)";
    if (code === "restricted_resource") return "التكامل لا يملك صلاحية على هذا المورد";
    if (code === "rate_limited") return "تم تجاوز حد الطلبات في Notion، سيتم إعادة المحاولة لاحقًا";
    if (code === "validation_error") return `خطأ في الطلب: ${(e as { message?: string }).message ?? ""}`;
  }
  return e instanceof Error ? e.message : "خطأ غير معروف من Notion";
}
