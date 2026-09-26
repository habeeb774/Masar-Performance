import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "sph_session";
const PUBLIC_PATHS = ["/login", "/api/cron", "/api/health"];

/**
 * Optimistic auth gate: redirects visitors without a session cookie to /login.
 * The real session validation + authorization happens server-side on every
 * page, action and route handler.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!isPublic && !hasSession) {
    // browser-navigated API routes (OAuth) go to the login page; other APIs get JSON
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/notion/oauth/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(url);
  }
  if (pathname === "/login" && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
