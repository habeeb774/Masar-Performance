import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString, max: 10 });
  // serverless Postgres adds network latency per statement — allow realistic transaction durations
  return new PrismaClient({ adapter, transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
}

function client(): PrismaClient {
  // in dev the client survives hot reloads on globalThis; after `prisma generate` the class changes
  // (new models), so a client built from the old class is replaced instead of missing the new tables
  if (!(globalForPrisma.prisma instanceof PrismaClient)) {
    void globalForPrisma.prisma?.$disconnect().catch(() => {});
    globalForPrisma.prisma = createClient();
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
