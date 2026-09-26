import "server-only";
import { Client } from "@notionhq/client";
import type { AuthUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { classifyTokenError, resolveOAuthConfig, type OAuthConfig, type OAuthFailure } from "@/lib/notion/oauth";

export function oauthConfig(): OAuthConfig | null {
  return resolveOAuthConfig({
    NOTION_OAUTH_CLIENT_ID: process.env.NOTION_OAUTH_CLIENT_ID,
    NOTION_OAUTH_CLIENT_SECRET: process.env.NOTION_OAUTH_CLIENT_SECRET,
    NOTION_OAUTH_REDIRECT_URI: process.env.NOTION_OAUTH_REDIRECT_URI,
    NOTION_CLIENT_ID: process.env.NOTION_CLIENT_ID,
    NOTION_CLIENT_SECRET: process.env.NOTION_CLIENT_SECRET,
    NOTION_REDIRECT_URI: process.env.NOTION_REDIRECT_URI,
    APP_URL: process.env.APP_URL,
  });
}

export function isOAuthConfigured(): boolean {
  return oauthConfig() !== null;
}

export class OAuthExchangeError extends Error {
  constructor(
    readonly failure: OAuthFailure,
    readonly status: number | undefined,
    readonly oauthError: string | undefined,
  ) {
    super(`Notion OAuth token request failed (${failure}, status ${status ?? "none"}, error ${oauthError ?? "none"})`);
  }
}

/** Pull only the HTTP status and Notion's `error` code out of an SDK error — never the request. */
function toExchangeError(e: unknown): OAuthExchangeError {
  const status = e && typeof e === "object" && "status" in e && typeof e.status === "number" ? e.status : undefined;
  let oauthError: string | undefined;
  const body = e && typeof e === "object" && "body" in e && typeof e.body === "string" ? e.body : "";
  try {
    const parsed = JSON.parse(body) as { error?: unknown; code?: unknown };
    oauthError = typeof parsed.error === "string" ? parsed.error : typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    // non-JSON body
  }
  return new OAuthExchangeError(classifyTokenError(status, oauthError), status, oauthError);
}

type TokenArgs = { grant_type: "authorization_code"; code: string; redirect_uri: string } | { grant_type: "refresh_token"; refresh_token: string };

async function requestToken(config: OAuthConfig, args: TokenArgs) {
  try {
    return await new Client().oauth.token({ client_id: config.clientId, client_secret: config.clientSecret, ...args });
  } catch (e) {
    throw toExchangeError(e);
  }
}

/** Exchange the authorization code and store (or refresh) the connection. */
export async function completeOAuth(user: AuthUser, code: string) {
  const config = oauthConfig();
  if (!config) throw new OAuthExchangeError("credentials", undefined, "not_configured");
  const token = await requestToken(config, { grant_type: "authorization_code", code, redirect_uri: config.redirectUri });

  const ownerEmail =
    token.owner.type === "user" && "person" in token.owner.user ? (token.owner.user.person?.email ?? null) : null;
  const ownerName = token.owner.type === "user" && "name" in token.owner.user ? token.owner.user.name : null;
  const data = {
    authType: "OAUTH" as const,
    tokenEncrypted: encryptSecret(token.access_token),
    tokenHint: token.access_token.slice(-4),
    refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : null,
    notionBotId: token.bot_id,
    workspaceId: token.workspace_id,
    workspaceName: token.workspace_name,
    botName: ownerName ?? null,
    ownerEmail,
    status: "CONNECTED" as const,
    lastTestedAt: new Date(),
    lastError: null,
    isActive: true,
  };

  // re-authorizing the same workspace (reconnect / grant more pages) updates the existing row,
  // which also revives the data sources of a previously disconnected workspace
  const existing = await db.notionConnection.findFirst({
    where: { OR: [{ notionBotId: token.bot_id }, { authType: "OAUTH", workspaceId: token.workspace_id }] },
  });
  const connection = existing
    ? await db.notionConnection.update({ where: { id: existing.id }, data })
    : await db.notionConnection.create({
        data: { ...data, name: token.workspace_name ? `Notion — ${token.workspace_name}` : "Notion", createdById: user.id },
      });

  await audit({
    user,
    action: existing ? (existing.isActive ? "notion.connection.update" : "notion.connection.reconnect") : "notion.connection.create",
    entityType: "NotionConnection",
    entityId: connection.id,
    after: { authType: "OAUTH", workspaceName: token.workspace_name, ownerEmail },
  });
  return connection;
}

/**
 * Refresh an OAuth access token with the stored refresh token.
 * Returns the new access token, or null when refreshing is not possible.
 */
export async function refreshOAuthToken(connectionId: string): Promise<string | null> {
  const config = oauthConfig();
  const conn = await db.notionConnection.findUnique({ where: { id: connectionId } });
  if (!config || !conn || !conn.isActive || conn.authType !== "OAUTH" || !conn.refreshTokenEncrypted) return null;
  const token = await requestToken(config, { grant_type: "refresh_token", refresh_token: decryptSecret(conn.refreshTokenEncrypted) });
  await db.notionConnection.update({
    where: { id: connectionId },
    data: {
      tokenEncrypted: encryptSecret(token.access_token),
      tokenHint: token.access_token.slice(-4),
      refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : conn.refreshTokenEncrypted,
      status: "CONNECTED",
      lastError: null,
      lastTestedAt: new Date(),
    },
  });
  return token.access_token;
}

export type CredentialCheck = "ok" | "credentials" | "not_configured" | "unreachable";

/**
 * Verify the Client ID/Secret pair without a real authorization: Notion answers
 * a dummy code with 400 invalid_grant when the credentials are valid and
 * 401 invalid_client when they are not.
 */
export async function checkOAuthCredentials(): Promise<CredentialCheck> {
  const config = oauthConfig();
  if (!config) return "not_configured";
  try {
    await requestToken(config, { grant_type: "authorization_code", code: "masar-credential-check", redirect_uri: config.redirectUri });
    return "ok";
  } catch (e) {
    if (!(e instanceof OAuthExchangeError)) return "unreachable";
    if (e.failure === "credentials") return "credentials";
    if (e.failure === "grant") return "ok";
    return "unreachable";
  }
}

/** Ask Notion to revoke an OAuth access token. Best effort — local credentials are wiped regardless. */
export async function revokeOAuthToken(accessToken: string): Promise<boolean> {
  const config = oauthConfig();
  if (!config) return false;
  try {
    await new Client().oauth.revoke({ client_id: config.clientId, client_secret: config.clientSecret, token: accessToken });
    return true;
  } catch {
    return false;
  }
}
