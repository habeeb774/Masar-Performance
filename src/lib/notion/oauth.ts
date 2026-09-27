/** Pure helpers for the Notion OAuth (public integration) flow. */

export const NOTION_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
export const OAUTH_STATE_COOKIE = "sph_notion_oauth";
export const OAUTH_CALLBACK_PATH = "/api/notion/oauth/callback";
export const CONNECT_PAGE = "/notion/connect";

export interface OAuthEnv {
  NOTION_OAUTH_CLIENT_ID?: string;
  NOTION_OAUTH_CLIENT_SECRET?: string;
  NOTION_OAUTH_REDIRECT_URI?: string;
  NOTION_CLIENT_ID?: string;
  NOTION_CLIENT_SECRET?: string;
  NOTION_REDIRECT_URI?: string;
  APP_URL?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Trim and drop wrapping quotes — a value pasted as "secret_…" into a dashboard is a common cause of 401. */
export function cleanEnv(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  return v || undefined;
}

/**
 * Resolve the OAuth configuration. The redirect URI must match, character for
 * character, the one registered on the Notion integration — production's
 * fixed value is https://m.leanpix.site/api/notion/oauth/callback.
 *
 * NOTION_REDIRECT_URI (or the legacy NOTION_OAUTH_REDIRECT_URI alias) is the
 * one authoritative source and should be set explicitly in every environment
 * that does real OAuth. APP_URL-derivation is kept only as a safety net for
 * environments that set APP_URL but not a redirect URI — it never reads
 * VERCEL_URL, a preview deployment URL, the request's Host header, or
 * window.location: those all vary per-deployment/per-request, and Notion
 * rejects any redirect_uri that isn't byte-for-byte the registered one.
 */
export function resolveOAuthConfig(env: OAuthEnv): OAuthConfig | null {
  const clientId = cleanEnv(env.NOTION_OAUTH_CLIENT_ID) ?? cleanEnv(env.NOTION_CLIENT_ID);
  const clientSecret = cleanEnv(env.NOTION_OAUTH_CLIENT_SECRET) ?? cleanEnv(env.NOTION_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  const explicit = cleanEnv(env.NOTION_REDIRECT_URI) ?? cleanEnv(env.NOTION_OAUTH_REDIRECT_URI);
  const base = cleanEnv(env.APP_URL)?.replace(/\/+$/, "");
  const redirectUri = explicit || (base ? `${base}${OAUTH_CALLBACK_PATH}` : "");
  if (!redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(config: Pick<OAuthConfig, "clientId" | "redirectUri">, state: string): string {
  const url = new URL(NOTION_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export type OAuthFailure = "credentials" | "grant" | "network" | "unknown";

/**
 * Classify a failed token exchange from the HTTP status and Notion's OAuth
 * `error` field (RFC 6749). 401 invalid_client = Client ID/Secret rejected.
 */
export function classifyTokenError(status: number | undefined, oauthError: string | undefined): OAuthFailure {
  if (oauthError === "invalid_client" || status === 401) return "credentials";
  if (oauthError === "invalid_grant" || oauthError === "invalid_request" || status === 400) return "grant";
  if (status === undefined) return "network";
  return "unknown";
}

/** Result codes carried back to the connect page as ?oauth=… */
export type OAuthResult = "success" | "denied" | "state" | "config" | "credentials" | "grant" | "exchange" | "forbidden";

export const OAUTH_RESULT_MESSAGES: Record<OAuthResult, { ok: boolean; message: string; admin?: boolean }> = {
  success: { ok: true, message: "تم ربط Notion بنجاح. اختر الآن قاعدة البيانات التي تريد متابعتها." },
  denied: { ok: false, message: "تم إلغاء الربط من صفحة Notion، لم يتغير شيء. يمكنك المحاولة مرة أخرى متى شئت." },
  state: { ok: false, message: "انتهت مهلة طلب الربط. اضغط «ربط Notion» مرة أخرى." },
  grant: { ok: false, message: "انتهت صلاحية طلب الربط قبل إكماله. اضغط «ربط Notion» مرة أخرى." },
  config: { ok: false, message: "إعداد ربط Notion غير مكتمل. راجع مسؤول النظام لإكمال الإعداد.", admin: true },
  credentials: { ok: false, message: "تعذر إكمال اتصال Notion. إعداد الاتصال يحتاج مراجعة من مسؤول النظام.", admin: true },
  exchange: { ok: false, message: "تعذر إكمال اتصال Notion الآن. حاول مرة أخرى بعد قليل." },
  forbidden: { ok: false, message: "ربط Notion متاح لمسؤولي النظام والمديرين المخوّلين فقط." },
};

export function isOAuthResult(v: string | undefined): v is OAuthResult {
  return !!v && v in OAUTH_RESULT_MESSAGES;
}
