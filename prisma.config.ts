import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // process.env (not env()) so `prisma generate` works without a DB URL,
    // e.g. during `npm install` on Vercel; migrate/db commands still need it.
    url: process.env.DATABASE_URL,
  },
});
