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
  if (!conn || !conn.isActive || !conn.tokenEncrypted) throw new NotionConnectionUnavailable();
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

export class NotionConnectionUnavailable extends Error {
  constructor() {
    super("اتصال Notion غير نشط");
  }
}

/** What the user can do about a Notion failure — drives the action button next to the message. */
export type NotionErrorKind = "reconnect" | "permission" | "rate_limited" | "temporary";

export function classifyNotionError(e: unknown): { kind: NotionErrorKind; message: string } {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  if (e instanceof NotionConnectionUnavailable || code === "unauthorized")
    return { kind: "reconnect", message: "انتهى اتصال Notion أو تم إلغاؤه." };
  if (code === "object_not_found" || code === "restricted_resource")
    return { kind: "permission", message: "هذه القاعدة غير متاحة للاتصال الحالي." };
  if (code === "rate_limited") return { kind: "rate_limited", message: "Notion مشغول حاليًا، ستُعاد المحاولة تلقائيًا بعد قليل." };
  // our own already-friendly (Arabic) messages pass through; raw technical ones do not
  if (!code && e instanceof Error && /[؀-ۿ]/.test(e.message)) return { kind: "temporary", message: e.message };
  return { kind: "temporary", message: "تعذر قراءة البيانات من Notion الآن، حاول مرة أخرى بعد قليل." };
}

export function notionErrorMessage(e: unknown): string {
  return classifyNotionError(e).message;
}
