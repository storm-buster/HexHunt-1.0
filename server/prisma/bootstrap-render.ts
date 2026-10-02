// ============================================================
// Production database bootstrap  (npm run bootstrap:render)
// ------------------------------------------------------------
// Operator-only, LOCAL-machine command for initialising the EXTERNAL production
// database (Neon). Render Free web services have no Shell, so this is run from
// the operator's machine against the Neon connection string.
//
// It does NOT auto-load the dev .env (no config import). All inputs come from the
// current environment. Requires explicit confirmation. It runs:
//   prisma migrate deploy   (schema, no reset/drop)
//   idempotent seed         (event + challenges + admin; never wipes data)
//   verification            (PASS/FAIL + counts only)
//
// NEVER prints DATABASE_URL, password, or hashes.
// ============================================================
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { verifyPassword } from '../src/auth/password.js';
import { seedCore } from '../src/db/seed-core.js';
import { seedChallenges } from '../src/challenges/challenge-data.js';

function abort(msg: string): never {
  console.error(`bootstrap:render ABORTED — ${msg}`);
  process.exit(1);
}
function need(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) abort(`${name} is required in the environment`);
  return v.trim();
}
function maskHost(url: string): string {
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, 'http:'));
    return `${u.hostname}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main(): Promise<void> {
  // ── Explicit confirmation ────────────────────────────────
  if (process.env.RENDER_BOOTSTRAP_CONFIRM !== 'YES') {
    abort('set RENDER_BOOTSTRAP_CONFIRM=YES to confirm you intend to bootstrap the PRODUCTION database');
  }

  const dbUrl = need('DATABASE_URL');
  const adminEmail = need('ADMIN_EMAIL');
  const adminPassword = need('ADMIN_PASSWORD');
  const allowLocal = process.env.RENDER_BOOTSTRAP_ALLOW_LOCAL === 'YES';

  // ── Safety checks ────────────────────────────────────────
  if (adminPassword.length < 8) abort('ADMIN_PASSWORD too short (min 8 characters)');
  if (adminPassword === 'ChangeMe_Admin123!') abort('refusing the insecure default ADMIN_PASSWORD');

  const lower = dbUrl.toLowerCase();
  const isLocal = lower.includes('localhost') || lower.includes('127.0.0.1');
  if (isLocal && !allowLocal) {
    abort('DATABASE_URL looks like localhost — refusing (set RENDER_BOOTSTRAP_ALLOW_LOCAL=YES only when testing the command against a disposable local DB)');
  }
  if (lower.includes('doomsday_ctf_test') || /\/doomsday_ctf(\?|$)/.test(lower)) {
    abort('DATABASE_URL points at a known development/test database — refusing');
  }

  console.log(`bootstrap:render → target DB: ${maskHost(dbUrl)}`);

  // ── 1. Migrations (deploy only; never reset/drop) ────────
  console.log('Applying migrations (prisma migrate deploy)…');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  // ── 2. Idempotent seed ───────────────────────────────────
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.$connect();
    console.log('Seeding (idempotent upserts)…');
    const res = await seedCore(prisma, {
      adminEmail,
      adminPassword,
      adminName: process.env.ADMIN_NAME ?? 'HexHunt Admin',
      eventName: process.env.EVENT_NAME ?? 'HexHunt 1.0',
    });

    // ── 3. Verification (PASS/FAIL + counts only) ──────────
    console.log('\n── Verification ──');
    const tables: [string, () => Promise<number>][] = [
      ['User', () => prisma.user.count()],
      ['Team', () => prisma.team.count()],
      ['TeamMembership', () => prisma.teamMembership.count()],
      ['Event', () => prisma.event.count()],
      ['EventSession', () => prisma.eventSession.count()],
      ['SessionArchive', () => prisma.sessionArchive.count()],
      ['Challenge', () => prisma.challenge.count()],
      ['Solve', () => prisma.solve.count()],
      ['Submission', () => prisma.submission.count()],
      ['HiddenLevelAssignment', () => prisma.hiddenLevelAssignment.count()],
      ['HiddenLevelResult', () => prisma.hiddenLevelResult.count()],
    ];
    let allTablesOk = true;
    for (const [name, count] of tables) {
      try {
        await count();
        console.log(`  table ${name}: PASS`);
      } catch {
        allTablesOk = false;
        console.log(`  table ${name}: FAIL (missing)`);
      }
    }

    const eventCount = await prisma.event.count();
    const challengeCount = await prisma.challenge.count();
    const admin = await prisma.user.findUnique({ where: { email: res.adminEmail } });
    const pwOk = admin ? await verifyPassword(admin.passwordHash, adminPassword) : false;

    console.log(`  Event count: ${eventCount} (expected 1) → ${eventCount === 1 ? 'PASS' : eventCount >= 1 ? 'PASS (>=1)' : 'FAIL'}`);
    console.log(`  Challenge count: ${challengeCount} (expected ${seedChallenges.length}) → ${challengeCount === seedChallenges.length ? 'PASS' : 'FAIL'}`);
    console.log(`  Admin exists: ${admin ? 'PASS' : 'FAIL'}`);
    console.log(`  Admin role ADMIN: ${admin?.role === 'ADMIN' ? 'PASS' : 'FAIL'}`);
    console.log(`  Admin active: ${admin?.active ? 'PASS' : 'FAIL'}`);
    console.log(`  Admin password verifies: ${pwOk ? 'PASS' : 'FAIL'}`);

    const ok = allTablesOk && eventCount >= 1 && challengeCount === seedChallenges.length && !!admin && admin.role === 'ADMIN' && admin.active && pwOk;
    console.log(`\nbootstrap:render ${ok ? 'COMPLETE ✓' : 'FINISHED WITH FAILURES ✗'}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('bootstrap:render error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
