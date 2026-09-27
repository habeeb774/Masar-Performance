import "server-only";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pool?: Pool };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // Must be a `Pool` instance, not a config object: @prisma/adapter-pg only treats a
  // passed-in Pool as the shared "external pool". Given a plain config it builds its
  // own internal pool per adapter connection and calls pool.end() on it whenever
  // Prisma disposes that adapter (e.g. an engine reconnect) — which raced with
  // in-flight queries on the same pool and surfaced as
  // "Cannot use a pool after calling end on the pool" under concurrent requests.
  const pool = new Pool({ connectionString, max: 10 });
  // Neon can drop an idle connection at any time; pg's Pool re-emits that as an
  // 'error' event, and with no listener Node treats it as an uncaught exception.
  pool.on("error", (err) => console.error("[db] idle connection error", err));
  const adapter = new PrismaPg(pool);
  // serverless Postgres adds network latency per statement — allow realistic transaction durations
  const prisma = new PrismaClient({ adapter, transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
  return { pool, prisma };
}

function client(): PrismaClient {
  // Dev only: the client survives hot reloads on globalThis, and after `prisma generate` a client built
  // from the old class lacks the new models — replace it. Never in production: bundles may carry several
  // copies of the class, and the shared client must not be swapped or closed under running requests.
  if (process.env.NODE_ENV === "development" && globalForPrisma.prisma && !(globalForPrisma.prisma instanceof PrismaClient)) {
    globalForPrisma.prisma = undefined;
    globalForPrisma.pool = undefined;
  }
  // Defensive only — nothing in this app should ever end the shared pool. If it
  // somehow did (e.g. a future bug), rebuild the singleton instead of every
  // request after it failing forever.
  if (globalForPrisma.pool?.ending) {
    globalForPrisma.prisma = undefined;
    globalForPrisma.pool = undefined;
  }
  if (!globalForPrisma.prisma) {
    const { pool, prisma } = createClient();
    globalForPrisma.pool = pool;
    globalForPrisma.prisma = prisma;
  }
  return globalForPrisma.prisma;
}

/**
 * Lazily-initialized Prisma client. Importing this module never touches the
 * environment, so `next build` can import route modules without DATABASE_URL;
 * a missing URL surfaces on the first query instead.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
