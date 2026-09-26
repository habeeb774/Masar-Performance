import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { safeEqual } from "@/server/crypto";
import { completeOAuth, oauthConfig } from "@/server/notion/oauth";
import { notionErrorMessage } from "@/server/notion/client";
import { OAUTH_STATE_COOKIE } from "@/lib/notion/oauth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Notion redirects here with ?code&state (or ?error) after the consent screen. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  const finish = (result: string) => {
    const response = NextResponse.redirect(new URL(`/notion/connections?oauth=${result}`, request.url));
    response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/api/notion/oauth", maxAge: 0 });
    return response;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/notion/connections", request.url));
  if (!hasPermission(user, PERMISSIONS.NOTION_MANAGE)) return finish("forbidden");

  const state = params.get("state") ?? "";
  if (!expected || !state || !safeEqual(state, expected)) return finish("state");
  if (params.get("error")) return finish("denied");

  const code = params.get("code");
  if (!code) return finish("state");
  if (!oauthConfig()) return finish("config");

  try {
    await completeOAuth(user, code);
    return finish("success");
  } catch (e) {
    console.error("[notion-oauth] token exchange failed:", notionErrorMessage(e));
    return finish("exchange");
  }
}
