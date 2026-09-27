/** Helpers for reading Next.js async searchParams / params. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type IdParams = Promise<{ id: string }>;

export function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim().slice(0, 200) : undefined;
}

export function int(v: string | string[] | undefined, fallback: number, min = -Infinity, max = Infinity): number {
  const n = Number.parseInt(str(v) ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

export function pageParams(sp: Record<string, string | string[] | undefined>, pageSize = 20) {
  const page = int(sp.page, 1, 1, 10_000);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** A `?next=` redirect target must be an in-app relative path — never an absolute URL or protocol-relative one. */
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}
