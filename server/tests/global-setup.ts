import 'dotenv/config';
import { execSync } from 'node:child_process';

// Runs once before the whole suite: prepare the TEST database schema + seed.
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL must be set to run tests');

  const env = { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' };

  // Apply migrations then seed challenges + admin into the test DB.
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', env });
}
