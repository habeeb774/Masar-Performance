/** Pure helpers for the Notion OAuth (public integration) flow. */

export const NOTION_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
export const OAUTH_STATE_COOKIE = "sph_notion_oauth";
export const OAUTH_CALLBACK_PATH = "/api/notion/oauth/callback";

export interface OAuthEnv {
  NOTION_OAUTH_CLIENT_ID?: string;
  NOTION_OAUTH_CLIENT_SECRET?: string;
  NOTION_OAUTH_REDIRECT_URI?: string;
  APP_URL?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Resolve the OAuth configuration. The redirect URI must match, character for
 * character, the one registered on the Notion connection.
 */
export function resolveOAuthConfig(env: OAuthEnv): OAuthConfig | null {
  const clientId = env.NOTION_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.NOTION_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const explicit = env.NOTION_OAUTH_REDIRECT_URI?.trim();
  const base = env.APP_URL?.trim().replace(/\/+$/, "");
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

/** Messages shown on /notion/connections after the flow returns. */
export const OAUTH_RESULT_MESSAGES: Record<string, string> = {
  success: "تم ربط Notion بنجاح. اختر الآن قاعدة البيانات من صفحة «قواعد البيانات».",
  denied: "تم إلغاء الموافقة في Notion، لم يُحفظ أي اتصال.",
  state: "انتهت صلاحية طلب الربط أو أنه غير صالح، حاول مرة أخرى.",
  config: "إعدادات OAuth غير مكتملة على الخادم (معرّف العميل أو السر أو عنوان إعادة التوجيه).",
  exchange: "رفض Notion إتمام الربط. تأكد أن عنوان إعادة التوجيه مطابق تمامًا وأن السر صحيح.",
  forbidden: "ربط Notion يتطلب صلاحية «إعداد تكامل Notion».",
};
