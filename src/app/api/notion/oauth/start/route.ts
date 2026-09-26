import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { randomToken } from "@/server/crypto";
import { oauthConfig } from "@/server/notion/oauth";
import { buildAuthorizeUrl, OAUTH_STATE_COOKIE } from "@/lib/notion/oauth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Begin the Notion OAuth consent flow (NOTION_MANAGE only). */
export async function GET(request: NextRequest) {
  const back = (result: string) => NextResponse.redirect(new URL(`/notion/connections?oauth=${result}`, request.url));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/notion/connections", request.url));
  if (!hasPermission(user, PERMISSIONS.NOTION_MANAGE)) return back("forbidden");

  const config = oauthConfig();
  if (!config) return back("config");

  // one-time state bound to this browser — verified in the callback to prevent CSRF
  const state = randomToken(24);
  const response = NextResponse.redirect(buildAuthorizeUrl(config, state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/notion/oauth",
    maxAge: 10 * 60,
  });
  return response;
}
