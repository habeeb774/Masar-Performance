import "server-only";
import { Client } from "@notionhq/client";
import type { AuthUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { resolveOAuthConfig, type OAuthConfig } from "@/lib/notion/oauth";

export function oauthConfig(): OAuthConfig | null {
  return resolveOAuthConfig({
    NOTION_OAUTH_CLIENT_ID: process.env.NOTION_OAUTH_CLIENT_ID,
    NOTION_OAUTH_CLIENT_SECRET: process.env.NOTION_OAUTH_CLIENT_SECRET,
    NOTION_OAUTH_REDIRECT_URI: process.env.NOTION_OAUTH_REDIRECT_URI,
    APP_URL: process.env.APP_URL,
  });
}

export function isOAuthConfigured(): boolean {
  return oauthConfig() !== null;
}

/** Exchange the authorization code and store (or refresh) the connection. */
export async function completeOAuth(user: AuthUser, code: string) {
  const config = oauthConfig();
  if (!config) throw new Error("OAuth is not configured");
  const token = await new Client().oauth.token({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

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
    botName: ownerName ? `OAuth — ${ownerName}` : "OAuth",
    ownerEmail,
    status: "CONNECTED" as const,
    lastTestedAt: new Date(),
    lastError: null,
    isActive: true,
  };

  // re-authorizing the same workspace replaces the token instead of duplicating the connection
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
    action: existing ? "notion.connection.update" : "notion.connection.create",
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
  if (!config || !conn || conn.authType !== "OAUTH" || !conn.refreshTokenEncrypted) return null;
  const token = await new Client().oauth.token({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: decryptSecret(conn.refreshTokenEncrypted),
  });
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
