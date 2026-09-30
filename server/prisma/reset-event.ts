// ============================================================
// Reset event lifecycle  (npm run reset:event)
// ------------------------------------------------------------
// Operator-only, LOCAL command. Returns the current event to NOT_STARTED so the
// organizer can rehearse START/CLOSE again. Config-free (no dev .env auto-load);
// DATABASE_URL comes from the environment. Requires explicit confirmation.
//
// Preserves: users, teams, memberships, challenge definitions, Solves,
// Submissions, and the Event row. Clears only the current event's hidden-level
// attempt state (assignments + results). Not reachable via API or players.
//
// NEVER prints DATABASE_URL or credentials.
// ============================================================
import { PrismaClient } from '@prisma/client';
import { resetEventLifecycle } from '../src/db/reset-event-core.js';

function abort(msg: string): never {
  console.error(`reset:event ABORTED — ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.env.RESET_EVENT_CONFIRM !== 'YES') {
    abort('set RESET_EVENT_CONFIRM=YES to confirm you intend to reset the event lifecycle');
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.trim()) abort('DATABASE_URL is required in the environment');

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.trim() } } });
  try {
    const before = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!before) abort('no event row found — nothing to reset');
    console.log(`Event reset target: "${before!.name}" — current status: ${before!.status}`);

    const result = await resetEventLifecycle(prisma);
    if (!result) abort('event disappeared during reset');

    console.log(`Cleared hidden-level assignments: ${result!.clearedHiddenAssignments}`);
    console.log(`Cleared hidden-level results: ${result!.clearedHiddenResults}`);
    console.log('Preserved: users, teams, memberships, challenges, solves, submissions.');

    // Verify (no full row dump).
    const after = await prisma.event.findUnique({ where: { id: result!.eventId } });
    const ok =
      after?.status === 'NOT_STARTED' &&
      after.startedAt === null &&
      after.closedAt === null &&
      after.hiddenActivationAt === null &&
      after.hiddenActivated === false;
    console.log(`status=${after?.status} startedAt=${after?.startedAt === null ? 'null' : 'set'} ` +
      `closedAt=${after?.closedAt === null ? 'null' : 'set'} ` +
      `hiddenActivated=${after?.hiddenActivated}`);
    console.log(`Event reset: ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('reset:event error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
