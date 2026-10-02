// ============================================================
// Reset current session  (npm run reset:event)
// ------------------------------------------------------------
// Operator-only, LOCAL rehearsal/test tool. Removes the CURRENT LIVE session
// (and its gameplay, via FK cascade) so a fresh START creates a new session.
// Config-free (no dev .env auto-load); DATABASE_URL comes from the environment.
// Requires explicit confirmation.
//
// Preserves: users, teams, memberships, challenge definitions, the Event
// container, and ALL COMPLETED (historical) sessions. Not reachable via API or
// players. NEVER prints DATABASE_URL or credentials.
// ============================================================
import { PrismaClient } from '@prisma/client';
import { resetEventLifecycle } from '../src/db/reset-event-core.js';

function abort(msg: string): never {
  console.error(`reset:event ABORTED — ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.env.RESET_EVENT_CONFIRM !== 'YES') {
    abort('set RESET_EVENT_CONFIRM=YES to confirm you intend to reset the current live session');
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.trim()) abort('DATABASE_URL is required in the environment');

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.trim() } } });
  try {
    const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!event) abort('no event row found — nothing to reset');
    const live = await prisma.eventSession.findFirst({
      where: { eventId: event!.id, status: 'LIVE' },
      orderBy: { sessionNumber: 'desc' },
    });
    console.log(`Event: "${event!.name}" — live session: ${live ? `#${live.sessionNumber}` : 'none'}`);

    const result = await resetEventLifecycle(prisma);
    if (!result) abort('event disappeared during reset');

    if (!result!.deletedLiveSession) {
      console.log('No LIVE session to reset — historical sessions left untouched.');
    } else {
      console.log(`Deleted LIVE session #${result!.sessionNumber} (gameplay cleared via cascade):`);
      console.log(`  solves=${result!.clearedSolves} submissions=${result!.clearedSubmissions} ` +
        `hiddenAssignments=${result!.clearedHiddenAssignments} hiddenResults=${result!.clearedHiddenResults}`);
    }
    console.log('Preserved: users, teams, memberships, challenges, and all COMPLETED sessions.');

    const stillLive = await prisma.eventSession.findFirst({ where: { eventId: event!.id, status: 'LIVE' } });
    const ok = stillLive === null;
    console.log(`Live session remaining: ${stillLive ? `#${stillLive.sessionNumber}` : 'none'}`);
    console.log(`Reset: ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('reset:event error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
