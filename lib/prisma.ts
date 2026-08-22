import { PrismaClient } from "@prisma/client";

// Reuse the client across hot reloads in dev to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // "query" logging writes every SQL statement to stdout (~15-18 per
    // dashboard load) — synchronous console I/O that adds noise and jitter to
    // the dev loop. Keep warn/error; opt into query logging via PRISMA_QUERY_LOG.
    log:
      process.env["NODE_ENV"] === "development"
        ? process.env["PRISMA_QUERY_LOG"] === "true"
          ? ["query", "warn", "error"]
          : ["warn", "error"]
        : ["error"],
  });

if (process.env["NODE_ENV"] !== "production") globalForPrisma.prisma = prisma;
