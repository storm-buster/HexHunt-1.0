import 'dotenv/config';
import { execSync } from 'node:child_process';

// Runs once before the whole suite: prepare the TEST database schema + seed.
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL must be set to run tests');

  // DIRECT_DATABASE_URL is required by the schema's directUrl for Migrate. The
  // test Postgres is localhost (no pooler), so force it to the TEST database —
  // never the dev DIRECT_DATABASE_URL that may be present in .env.
  const env = {
    ...process.env,
    DATABASE_URL: testUrl,
    DIRECT_DATABASE_URL: testUrl,
    NODE_ENV: 'test',
  };

  // Apply migrations then seed challenges + admin into the test DB.
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', env });
}
