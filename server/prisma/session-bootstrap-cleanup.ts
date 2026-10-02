// ============================================================
// Session bootstrap cleanup  (npm run cleanup:sessions)
// ------------------------------------------------------------
// Operator-only, ONE-TIME command to clear legacy pre-archive participant/
// gameplay data so the FIRST real session under the archive architecture starts
// from a clean slate (and START creates Session #1).
//
// Deletes ONLY: stale NON-LIVE EventSession rows with no SessionArchive (+ their
// cascaded gameplay), all PLAYER users, Teams, TeamMemberships.
// PRESERVES: ADMIN users, Challenge definitions, Event, and ALL SessionArchive
// rows. Refuses while a session is LIVE.
//
// Guards:
//   - requires SESSION_BOOTSTRAP_CLEANUP_CONFIRM=YES
//   - refuses dev/test databases (doomsday_ctf / doomsday_ctf_test)
//   - refuses localhost/127.0.0.1 UNLESS SESSION_BOOTSTRAP_ALLOW_LOCAL=YES
//     (only for testing against a disposable local DB)
// NEVER prints DATABASE_URL or credentials.
// ============================================================
import { PrismaClient } from '@prisma/client';
import { cleanupLegacyPreArchiveState } from '../src/db/session-bootstrap-cleanup-core.js';

function abort(msg: string): never {
  console.error(`cleanup:sessions ABORTED — ${msg}`);
  process.exit(1);
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
  if (process.env.SESSION_BOOTSTRAP_CLEANUP_CONFIRM !== 'YES') {
    abort('set SESSION_BOOTSTRAP_CLEANUP_CONFIRM=YES to confirm the one-time legacy cleanup');
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.trim()) abort('DATABASE_URL is required in the environment');

  const lower = dbUrl.toLowerCase();
  // Always refuse known dev/test databases.
  if (lower.includes('doomsday_ctf_test') || /\/doomsday_ctf(\?|$)/.test(lower)) {
    abort('DATABASE_URL points at a known development/test database — refusing');
  }
  // Refuse localhost unless explicitly allowed for disposable-DB testing.
  const isLocal = lower.includes('localhost') || lower.includes('127.0.0.1');
  if (isLocal && process.env.SESSION_BOOTSTRAP_ALLOW_LOCAL !== 'YES') {
    abort('DATABASE_URL looks like localhost — refusing (set SESSION_BOOTSTRAP_ALLOW_LOCAL=YES only to test against a disposable local DB)');
  }

  console.log(`cleanup:sessions → target DB: ${maskHost(dbUrl)}`);

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.trim() } } });
  try {
    const result = await cleanupLegacyPreArchiveState(prisma);

    const b = result.before;
    const a = result.after;
    console.log('\n── BEFORE ──');
    console.log(`  playerUsers=${b.playerUsers} teams=${b.teams} memberships=${b.memberships}`);
    console.log(`  eventSessions=${b.eventSessions} (live=${b.liveSessions}) solves=${b.solves} submissions=${b.submissions}`);
    console.log(`  hiddenAssignments=${b.hiddenAssignments} hiddenResults=${b.hiddenResults}`);
    console.log(`  [preserved] adminUsers=${b.adminUsers} challenges=${b.challenges} events=${b.events} sessionArchives=${b.sessionArchives}`);
    console.log(`\nDeleted legacy (non-archived, non-LIVE) EventSession rows: ${result.deletedLegacySessions}`);
    console.log('\n── AFTER ──');
    console.log(`  playerUsers=${a.playerUsers} teams=${a.teams} memberships=${a.memberships}`);
    console.log(`  eventSessions=${a.eventSessions} (live=${a.liveSessions}) solves=${a.solves} submissions=${a.submissions}`);
    console.log(`  hiddenAssignments=${a.hiddenAssignments} hiddenResults=${a.hiddenResults}`);
    console.log(`  [preserved] adminUsers=${a.adminUsers} challenges=${a.challenges} events=${a.events} sessionArchives=${a.sessionArchives}`);

    // Verify the intended clean pre-first-session state + that nothing preserved was lost.
    const cleanLive =
      a.playerUsers === 0 && a.teams === 0 && a.memberships === 0 &&
      a.eventSessions === 0 && a.solves === 0 && a.submissions === 0 &&
      a.hiddenAssignments === 0 && a.hiddenResults === 0;
    const preserved =
      a.adminUsers === b.adminUsers && a.challenges === b.challenges &&
      a.events === b.events && a.sessionArchives === b.sessionArchives;
    const ok = cleanLive && preserved;
    console.log(`\ncleanup:sessions ${ok ? 'COMPLETE ✓' : 'FINISHED WITH UNEXPECTED STATE ✗'}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('cleanup:sessions error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
