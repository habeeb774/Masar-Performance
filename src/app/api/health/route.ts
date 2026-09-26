import { NextResponse } from "next/server";
import { db } from "@/server/db";

type Check = "ok" | "error" | "not_configured";

/**
 * Public liveness probe. Reports only coarse status strings — never
 * connection strings, error messages or counts. Notion status is read from
 * the stored connection state (no live Notion API call per request).
 */
export async function GET() {
  let database: Check = "ok";
  let notion: Check = "not_configured";

  try {
    await db.$queryRaw`SELECT 1`;
    const connections = await db.notionConnection.findMany({
      where: { isActive: true },
      select: { status: true },
    });
    if (connections.length > 0) {
      notion = connections.some((c) => c.status === "FAILED") ? "error" : "ok";
    }
  } catch {
    database = "error";
    notion = "error";
  }

  const healthy = database === "ok";
  return NextResponse.json(
    { app: "ok", database, notion },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
