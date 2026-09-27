import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const SESSION_COOKIE = "sph_session";

function req(path: string, opts: { cookie?: string; host?: string } = {}) {
  const host = opts.host ?? "app.example";
  const headers = new Headers({ host });
  if (opts.cookie) headers.set("cookie", `${SESSION_COOKIE}=${opts.cookie}`);
  // proxy() reads the Host header, not request.nextUrl.hostname — see the comment
  // in src/proxy.ts. The URL's own host is deliberately different here so a test
  // that only patched nextUrl (not the header) would fail, matching production.
  return new NextRequest(new URL(path, `https://ignored-request-url-host.example`), { headers });
}

describe("proxy (auth middleware)", () => {
  it("unauthenticated: /login renders (no redirect)", () => {
    const res = proxy(req("/login"));
    expect(res.status).toBe(200); // NextResponse.next()
    expect(res.headers.get("location")).toBeNull();
  });

  it("unauthenticated: /dashboard redirects to /login", () => {
    const res = proxy(req("/dashboard"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });

  it("a session cookie never causes /login itself to redirect — only the page's real, DB-validated check may do that", () => {
    // Regression test: this used to redirect to /dashboard purely because a
    // cookie was present, with no way to tell a valid session from a stale
    // one — the exact cause of the /login <-> /dashboard redirect loop.
    const res = proxy(req("/login", { cookie: "stale-or-valid-token" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("a present cookie lets a protected route through to the page's real session check", () => {
    const res = proxy(req("/dashboard", { cookie: "some-token" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("public paths never redirect regardless of session state", () => {
    for (const path of ["/login", "/setup", "/api/cron/run", "/api/health"]) {
      expect(proxy(req(path)).status).toBe(200);
    }
  });

  it("an unauthenticated API request (other than Notion OAuth) gets a JSON 401, not a redirect", async () => {
    const res = proxy(req("/api/notifications"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("an unauthenticated browser navigation to the Notion OAuth route goes to /login instead of a JSON 401", () => {
    const res = proxy(req("/api/notion/oauth/start"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  describe("legacy Vercel-assigned hostnames redirect to the canonical custom domain", () => {
    const legacyHosts = [
      "masar-performance.vercel.app",
      "masar-performance-habrrbs-projects.vercel.app",
      "masar-performance-git-main-habrrbs-projects.vercel.app",
    ];

    it.each(legacyHosts)("%s -> m.leanpix.site, preserving path and query, before any auth check", (host) => {
      const res = proxy(req("/notion/connect?foo=bar", { host }));
      expect(res.status).toBe(308);
      const location = new URL(res.headers.get("location")!);
      expect(location.hostname).toBe("m.leanpix.site");
      expect(location.pathname).toBe("/notion/connect");
      expect(location.searchParams.get("foo")).toBe("bar");
    });

    it("the canonical host itself is never redirected", () => {
      const res = proxy(req("/dashboard", { host: "m.leanpix.site", cookie: "x" }));
      expect(res.headers.get("location")).toBeNull();
    });

    it("a unique per-deploy preview URL is left untouched (still previewable)", () => {
      const res = proxy(req("/dashboard", { host: "masar-performance-3m77eta3o-habrrbs-projects.vercel.app", cookie: "x" }));
      expect(res.headers.get("location")).toBeNull();
    });
  });
});
