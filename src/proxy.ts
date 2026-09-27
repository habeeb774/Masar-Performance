import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "sph_session";
const PUBLIC_PATHS = ["/login", "/setup", "/api/cron", "/api/health"];

// The canonical production hostname (must match APP_URL). Vercel always keeps its
// auto-generated aliases working alongside a custom domain — redirect the ones people
// can stumble onto (an old bookmark, Vercel's own dashboard "Visit" button) to it, so
// a visitor never ends up signed in on the wrong origin (session cookies are host-only).
// Deliberately NOT a wildcard: unique-per-deploy preview URLs (*-<hash>-...vercel.app)
// must keep working untouched for previewing branches before they reach main.
const CANONICAL_HOST = "m.leanpix.site";
const LEGACY_HOSTS = new Set([
  "masar-performance.vercel.app",
  "masar-performance-habrrbs-projects.vercel.app",
  "masar-performance-git-main-habrrbs-projects.vercel.app",
]);

/**
 * Optimistic auth gate: redirects visitors without a session cookie to /login.
 * The real session validation + authorization happens server-side on every
 * page, action and route handler.
 *
 * This must never redirect *away from* /login based on cookie presence alone
 * (a cookie can exist but no longer resolve to a valid session — expired,
 * revoked, user deactivated). Middleware has no database access to tell the
 * difference; only /login's own render does (getCurrentUser(), the same
 * source the (app) layout uses to guard private routes). Doing that decision
 * in two places, one of them unverified, is exactly what causes a redirect
 * loop: middleware bounces /login → /dashboard on a stale cookie, the layout's
 * real check finds no session and bounces straight back to /login.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // request.nextUrl.hostname does not reliably reflect the domain the visitor
  // actually requested when several domains alias to one deployment — verified
  // against a close-to-production run, where it stayed the deployment's internal
  // hostname regardless of which alias was requested. The incoming Host header
  // (what the browser's address bar actually shows) is the reliable source.
  const requestHost = (request.headers.get("host") ?? "").split(":")[0];

  if (LEGACY_HOSTS.has(requestHost)) {
    const url = request.nextUrl.clone();
    url.hostname = CANONICAL_HOST;
    url.port = "";
    url.protocol = "https";
    return NextResponse.redirect(url, 308);
  }

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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
