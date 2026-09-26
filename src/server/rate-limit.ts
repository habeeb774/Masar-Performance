import "server-only";
import { db } from "@/server/db";

/**
 * Fixed-window rate limiter persisted in Postgres so it works across
 * serverless instances. Returns whether the call is allowed.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterMs: number }> {
  const now = new Date();
  const windowStartMin = new Date(now.getTime() - windowMs);
  const rows = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < ${windowStartMin} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${windowStartMin} THEN ${now} ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"
  `;
  const row = rows[0];
  const ok = row.count <= limit;
  const retryAfterMs = ok ? 0 : Math.max(0, row.windowStart.getTime() + windowMs - now.getTime());
  return { ok, retryAfterMs };
}

export async function resetRateLimit(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}
