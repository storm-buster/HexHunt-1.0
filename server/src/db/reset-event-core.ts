import type { PrismaClient } from '@prisma/client';

// Config-free operator/test tool. Removes the CURRENT LIVE session (and its
// gameplay, via FK cascade) so a fresh rehearsal can START a new session.
// It NEVER touches COMPLETED (historical) sessions, users, teams, memberships,
// or challenge definitions, and never deletes/recreates the Event container.

export interface ResetEventResult {
  eventId: string;
  deletedLiveSession: boolean;
  sessionNumber: number | null;
  clearedSolves: number;
  clearedSubmissions: number;
  clearedHiddenAssignments: number;
  clearedHiddenResults: number;
}

export async function resetEventLifecycle(
  prisma: PrismaClient,
): Promise<ResetEventResult | null> {
  const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!event) return null;

  const live = await prisma.eventSession.findFirst({
    where: { eventId: event.id, status: 'LIVE' },
    orderBy: { sessionNumber: 'desc' },
  });

  if (!live) {
    return {
      eventId: event.id, deletedLiveSession: false, sessionNumber: null,
      clearedSolves: 0, clearedSubmissions: 0, clearedHiddenAssignments: 0, clearedHiddenResults: 0,
    };
  }

  const [solves, submissions, assignments, results] = await Promise.all([
    prisma.solve.count({ where: { sessionId: live.id } }),
    prisma.submission.count({ where: { sessionId: live.id } }),
    prisma.hiddenLevelAssignment.count({ where: { sessionId: live.id } }),
    prisma.hiddenLevelResult.count({ where: { sessionId: live.id } }),
  ]);

  // Deleting the live session cascades to its solves/submissions/hidden rows.
  await prisma.eventSession.delete({ where: { id: live.id } });

  return {
    eventId: event.id,
    deletedLiveSession: true,
    sessionNumber: live.sessionNumber,
    clearedSolves: solves,
    clearedSubmissions: submissions,
    clearedHiddenAssignments: assignments,
    clearedHiddenResults: results,
  };
}
