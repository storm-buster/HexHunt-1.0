// ============================================================
// Verify production admin  (npm run verify:render-admin)
// ------------------------------------------------------------
// Read-only. Confirms the admin can authenticate against the DB WITHOUT creating
// a session or touching the API. Config-free (no dev .env). Reports PASS/FAIL
// only — never prints the password or hash.
// ============================================================
import { PrismaClient } from '@prisma/client';
import { verifyPassword } from '../src/auth/password.js';

function need(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`verify:render-admin ABORTED — ${name} is required in the environment`);
    process.exit(1);
  }
  return v.trim();
}

async function main(): Promise<void> {
  const dbUrl = need('DATABASE_URL');
  const email = need('ADMIN_EMAIL').toLowerCase();
  const password = need('ADMIN_PASSWORD');

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const admin = await prisma.user.findUnique({ where: { email } });
    const pwOk = admin ? await verifyPassword(admin.passwordHash, password) : false;
    console.log(`Admin lookup: ${admin ? 'PASS' : 'FAIL'}`);
    console.log(`Password verification: ${pwOk ? 'PASS' : 'FAIL'}`);
    console.log(`Role: ${admin?.role === 'ADMIN' ? 'ADMIN' : admin ? 'NON-ADMIN' : 'N/A'}`);
    console.log(`Active: ${admin ? (admin.active ? 'TRUE' : 'FALSE') : 'N/A'}`);
    if (!admin || !pwOk || admin.role !== 'ADMIN' || !admin.active) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('verify:render-admin error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
