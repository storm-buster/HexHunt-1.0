import type { PrismaClient } from '@prisma/client';
import { disconnectPlayers } from '../realtime/hub.js';

// ============================================================
// Legacy pre-archive cleanup (one-time production bootstrap)
// ------------------------------------------------------------
// Establishes a clean "pre-first-session" state by removing ONLY legacy
// participant/gameplay data left over from the old (pre-SessionArchive)
// architecture:
//   - stale NON-LIVE EventSession rows with NO corresponding SessionArchive
//     (+ their cascaded Solve/Submission/HiddenLevel* rows)
//   - all PLAYER users, Teams, and TeamMemberships
//
// PRESERVES (never touched): ADMIN users, Challenge definitions, the Event
// container, and ALL SessionArchive rows (immutable history).
//
// Refuses to run while a session is LIVE (use STOP, not cleanup, during a run).
// This is a config-free CORE function; the CLI wrapper adds the confirmation
// flag and the production-only database guard.
// ============================================================

export interface CleanupCounts {
  playerUsers: number;
  adminUsers: number;
  teams: number;
  memberships: number;
  eventSessions: number;
  liveSessions: number;
  solves: number;
  submissions: number;
  hiddenAssignments: number;
  hiddenResults: number;
  sessionArchives: number;
  challenges: number;
  events: number;
}

export interface CleanupResult {
  before: CleanupCounts;
  after: CleanupCounts;
  deletedLegacySessions: number;
}

async function counts(prisma: PrismaClient): Promise<CleanupCounts> {
  const [
    playerUsers, adminUsers, teams, memberships, eventSessions, liveSessions,
    solves, submissions, hiddenAssignments, hiddenResults, sessionArchives, challenges, events,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'PLAYER' } }),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.team.count(),
    prisma.teamMembership.count(),
    prisma.eventSession.count(),
    prisma.eventSession.count({ where: { status: 'LIVE' } }),
    prisma.solve.count(),
    prisma.submission.count(),
    prisma.hiddenLevelAssignment.count(),
    prisma.hiddenLevelResult.count(),
    prisma.sessionArchive.count(),
    prisma.challenge.count(),
    prisma.event.count(),
  ]);
  return {
    playerUsers, adminUsers, teams, memberships, eventSessions, liveSessions,
    solves, submissions, hiddenAssignments, hiddenResults, sessionArchives, challenges, events,
  };
}

export async function cleanupLegacyPreArchiveState(prisma: PrismaClient): Promise<CleanupResult> {
  // Never wipe participants out from under a running competition.
  const live = await prisma.eventSession.findFirst({ where: { status: 'LIVE' } });
  if (live) {
    throw new Error('A LIVE session exists — refusing cleanup. Use STOP to finish/archive it first.');
  }

  const before = await counts(prisma);

  // Legacy EventSession rows = NON-LIVE rows whose number is NOT archived.
  const archived = await prisma.sessionArchive.findMany({ select: { sessionNumber: true } });
  const archivedNumbers = archived.map((a) => a.sessionNumber);
  const legacySessions = await prisma.eventSession.findMany({
    where: {
      status: { not: 'LIVE' },
      ...(archivedNumbers.length > 0 ? { sessionNumber: { notIn: archivedNumbers } } : {}),
    },
    select: { id: true },
  });

  // Interactive transaction — the caller injects the Prisma client; the CLI
  // connects it via DIRECT_DATABASE_URL (non-pooled) so this runs on a
  // session-pinned connection (pooled endpoints break interactive transactions).
  await prisma.$transaction(async (tx) => {
    // Remove legacy session rows (cascades their Solve/Submission/Hidden* rows).
    if (legacySessions.length > 0) {
      await tx.eventSession.deleteMany({ where: { id: { in: legacySessions.map((s) => s.id) } } });
    }
    // Defensive sweep of any remaining pre-archive gameplay/participants. There
    // is no LIVE session (guarded above) and SessionArchive is a separate,
    // untouched table, so this cannot affect a running session or history.
    await tx.challengeStepProgress.deleteMany({});
    await tx.challengeInstance.deleteMany({});
    await tx.antiCheatEvent.deleteMany({});
    await tx.hiddenLevelAssignment.deleteMany({});
    await tx.hiddenLevelResult.deleteMany({});
    await tx.submission.deleteMany({});
    await tx.solve.deleteMany({});
    await tx.teamMembership.deleteMany({});
    await tx.team.deleteMany({});
    await tx.user.deleteMany({ where: { role: 'PLAYER' } });
    // NOT touched: SessionArchive, ADMIN users, Challenge, Event.
  });

  disconnectPlayers();

  const after = await counts(prisma);
  return { before, after, deletedLegacySessions: legacySessions.length };
}
