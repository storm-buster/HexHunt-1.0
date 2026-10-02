import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

// Pooled client — normal runtime queries (high concurrency). In production this
// uses Neon's …-pooler endpoint (PgBouncer transaction pooling).
export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  log: config.isProd ? ['error'] : ['error', 'warn'],
});

// Transaction client — used ONLY for interactive $transaction(async tx => …)
// operations, which need a session-pinned connection. Bound to the DIRECT
// (non-pooled) connection in production. When no separate direct URL is
// configured (local/dev/test, or any non-pooled Postgres) we reuse the pooled
// client to avoid a second, redundant connection pool. Created once per process
// and reused — never per request.
export const txPrisma: PrismaClient =
  config.directDatabaseUrl === config.databaseUrl
    ? prisma
    : new PrismaClient({
        datasources: { db: { url: config.directDatabaseUrl } },
        log: config.isProd ? ['error'] : ['error', 'warn'],
      });

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  if (txPrisma !== prisma) await txPrisma.$connect();
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  if (txPrisma !== prisma) await txPrisma.$disconnect();
}
