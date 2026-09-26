import "server-only";
import { NextResponse, type NextRequest } from "next/server";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Mutating requests must come from our own origin (CSRF defence in addition to SameSite cookies). */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
