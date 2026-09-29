import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

// Single shared Prisma client instance for the process.
export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  log: config.isProd ? ['error'] : ['error', 'warn'],
});

export async function connectDb(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
