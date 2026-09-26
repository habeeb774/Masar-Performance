import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/crypto";
import { runDailyJobs, runScheduledSync } from "@/server/services/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Job = "sync" | "daily" | "all";
const JOBS: Job[] = ["sync", "daily", "all"];
const noStore = { "Cache-Control": "no-store" };

/**
 * Scheduled jobs entry point.
 *   GET|POST /api/cron/run?job=sync|daily|all   (default: all)
 *   Authorization: Bearer <CRON_SECRET>
 * Vercel Cron sends the header automatically when CRON_SECRET is set; external
 * schedulers (cron-job.org, GitHub Actions…) must send it explicitly.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set");
    return NextResponse.json({ ok: false, error: "cron_not_configured" }, { status: 500, headers: noStore });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !safeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
  }

  const requested = (request.nextUrl.searchParams.get("job") ?? "all") as Job;
  if (!JOBS.includes(requested)) {
    return NextResponse.json({ ok: false, error: "invalid_job", allowed: JOBS }, { status: 400, headers: noStore });
  }

  const startedAt = new Date();
  const result: {
    ok: boolean;
    job: Job;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    sync?: Awaited<ReturnType<typeof runScheduledSync>>;
    daily?: Awaited<ReturnType<typeof runDailyJobs>>;
    errors: { job: "sync" | "daily"; message: string }[];
  } = { ok: true, job: requested, startedAt: startedAt.toISOString(), errors: [] };

  // run each job independently so one failure does not block the other
  if (requested === "sync" || requested === "all") {
    try {
      result.sync = await runScheduledSync();
    } catch (e) {
      console.error("[cron] sync failed", e);
      result.errors.push({ job: "sync", message: e instanceof Error ? e.message : "sync failed" });
    }
  }
  if (requested === "daily" || requested === "all") {
    try {
      result.daily = await runDailyJobs();
    } catch (e) {
      console.error("[cron] daily jobs failed", e);
      result.errors.push({ job: "daily", message: e instanceof Error ? e.message : "daily jobs failed" });
    }
  }

  const finishedAt = new Date();
  result.finishedAt = finishedAt.toISOString();
  result.durationMs = finishedAt.getTime() - startedAt.getTime();
  result.ok = result.errors.length === 0;
  return NextResponse.json(result, { status: result.ok ? 200 : 500, headers: noStore });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
