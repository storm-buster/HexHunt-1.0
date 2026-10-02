import type { PrismaClient } from '@prisma/client';
import { disconnectPlayers } from '../realtime/hub.js';

// Operator/test tool. Performs the LIVE-state wipe WITHOUT archiving — a hard
// discard of the current competition's participant/gameplay data so a fresh
// rehearsal can START cleanly.
//
// Deletes: the live session (+cascaded solves/submissions/hidden), all teams
// (+cascaded memberships), and all PLAYER users.
// PRESERVES: admin accounts, challenge definitions, the Event container, and —
// critically — ALL completed-session archives (SessionArchive is never touched).

export interface ResetEventResult {
  eventId: string | null;
  deletedLiveSession: boolean;
  sessionNumber: number | null;
  clearedUsers: number;
  clearedTeams: number;
  clearedMemberships: number;
  clearedSolves: number;
  clearedSubmissions: number;
  clearedHiddenAssignments: number;
  clearedHiddenResults: number;
  preservedArchives: number;
}

export async function resetEventLifecycle(prisma: PrismaClient): Promise<ResetEventResult> {
  const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });

  const live = event
    ? await prisma.eventSession.findFirst({ where: { eventId: event.id, status: 'LIVE' }, orderBy: { sessionNumber: 'desc' } })
    : null;

  // Count live state (for the operator report) before deleting.
  const [users, teams, memberships, solves, submissions, assignments, results, archives] = await Promise.all([
    prisma.user.count({ where: { role: 'PLAYER' } }),
    prisma.team.count(),
    prisma.teamMembership.count(),
    prisma.solve.count(),
    prisma.submission.count(),
    prisma.hiddenLevelAssignment.count(),
    prisma.hiddenLevelResult.count(),
    prisma.sessionArchive.count(),
  ]);

  // Interactive transaction — the caller injects the Prisma client; the CLI
  // connects it via DIRECT_DATABASE_URL (non-pooled) so this runs on a
  // session-pinned connection (pooled endpoints break interactive transactions).
  await prisma.$transaction(async (tx) => {
    if (live) await tx.eventSession.delete({ where: { id: live.id } }); // cascades gameplay
    // Defensive: clear any orphan gameplay rows not tied to the live session.
    await tx.hiddenLevelAssignment.deleteMany({});
    await tx.hiddenLevelResult.deleteMany({});
    await tx.submission.deleteMany({});
    await tx.solve.deleteMany({});
    await tx.eventSession.deleteMany({}); // remove any other (non-live) session rows
    await tx.teamMembership.deleteMany({});
    await tx.team.deleteMany({});
    await tx.user.deleteMany({ where: { role: 'PLAYER' } });
    // NOTE: prisma.sessionArchive is intentionally NOT touched.
  });

  disconnectPlayers();

  return {
    eventId: event?.id ?? null,
    deletedLiveSession: !!live,
    sessionNumber: live?.sessionNumber ?? null,
    clearedUsers: users,
    clearedTeams: teams,
    clearedMemberships: memberships,
    clearedSolves: solves,
    clearedSubmissions: submissions,
    clearedHiddenAssignments: assignments,
    clearedHiddenResults: results,
    preservedArchives: archives,
  };
}
