// ============================================================
// Reset live session state  (npm run reset:event)
// ------------------------------------------------------------
// Operator-only, LOCAL rehearsal/test tool. Performs the LIVE-state wipe WITHOUT
// archiving: deletes the current live session (+cascaded gameplay), all teams
// (+memberships) and all PLAYER users, so a fresh START begins clean.
//
// Config-free (no dev .env auto-load); DATABASE_URL comes from the environment.
// Requires explicit confirmation.
//
// PRESERVES: admin accounts, challenge definitions, the Event container, and ALL
// completed-session archives (SessionArchive is NEVER deleted). Not reachable
// via API or players. NEVER prints DATABASE_URL or credentials.
// ============================================================
import { PrismaClient } from '@prisma/client';
import { resetEventLifecycle } from '../src/db/reset-event-core.js';

function abort(msg: string): never {
  console.error(`reset:event ABORTED — ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.env.RESET_EVENT_CONFIRM !== 'YES') {
    abort('set RESET_EVENT_CONFIRM=YES to confirm you intend to wipe the current live session state');
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.trim()) abort('DATABASE_URL is required in the environment');

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.trim() } } });
  try {
    const archivesBefore = await prisma.sessionArchive.count();
    const result = await resetEventLifecycle(prisma);

    if (!result.deletedLiveSession && result.clearedUsers === 0 && result.clearedTeams === 0) {
      console.log('No live session or participant state to reset.');
    } else {
      console.log(`Wiped live state${result.sessionNumber ? ` (session #${result.sessionNumber})` : ''}:`);
      console.log(`  users=${result.clearedUsers} teams=${result.clearedTeams} memberships=${result.clearedMemberships}`);
      console.log(`  solves=${result.clearedSolves} submissions=${result.clearedSubmissions} ` +
        `hiddenAssignments=${result.clearedHiddenAssignments} hiddenResults=${result.clearedHiddenResults}`);
    }
    console.log('Preserved: admin account(s), challenge definitions, Event container.');

    // Verify: live tables empty, archives untouched.
    const [players, teams, sessions, archivesAfter] = await Promise.all([
      prisma.user.count({ where: { role: 'PLAYER' } }),
      prisma.team.count(),
      prisma.eventSession.count(),
      prisma.sessionArchive.count(),
    ]);
    const ok = players === 0 && teams === 0 && sessions === 0 && archivesAfter === archivesBefore;
    console.log(`Live after reset → players=${players} teams=${teams} sessions=${sessions}`);
    console.log(`Archives preserved → before=${archivesBefore} after=${archivesAfter}`);
    console.log(`reset:event ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('reset:event error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
