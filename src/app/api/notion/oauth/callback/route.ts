import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { safeEqual } from "@/server/crypto";
import { completeOAuth, oauthConfig, OAuthExchangeError } from "@/server/notion/oauth";
import { CONNECT_PAGE, OAUTH_STATE_COOKIE, type OAuthResult } from "@/lib/notion/oauth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Notion redirects here with ?code&state (or ?error) after the consent screen. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  const finish = (result: OAuthResult, connectionId?: string) => {
    const url = new URL(CONNECT_PAGE, request.url);
    url.searchParams.set("oauth", result);
    if (connectionId) url.searchParams.set("connection", connectionId);
    const response = NextResponse.redirect(url);
    response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/api/notion/oauth", maxAge: 0 });
    return response;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(CONNECT_PAGE)}`, request.url));
  if (!hasPermission(user, PERMISSIONS.NOTION_MANAGE)) return finish("forbidden");

  const state = params.get("state") ?? "";
  if (!expected || !state || !safeEqual(state, expected)) return finish("state");
  // user pressed Cancel on Notion's consent screen
  if (params.get("error")) return finish("denied");

  const code = params.get("code");
  if (!code) return finish("state");
  if (!oauthConfig()) return finish("config");

  try {
    const connection = await completeOAuth(user, code);
    return finish("success", connection.id);
  } catch (e) {
    // status + OAuth error code only — never the code, secret or tokens
    if (e instanceof OAuthExchangeError) {
      console.error(`[notion-oauth] token exchange failed: status=${e.status ?? "none"} error=${e.oauthError ?? "none"} class=${e.failure}`);
      if (e.failure === "credentials") return finish("credentials");
      if (e.failure === "grant") return finish("grant");
    } else {
      console.error("[notion-oauth] saving connection failed:", e instanceof Error ? e.message : "unknown");
    }
    return finish("exchange");
  }
}
