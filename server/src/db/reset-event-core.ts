import type { PrismaClient } from '@prisma/client';

// Config-free (no dotenv). Resets ONLY the current event's lifecycle back to
// NOT_STARTED for a controlled rehearsal, and clears that event's hidden-level
// ATTEMPT state (assignments + results), which only exists after activation and
// is clearly event-owned (FK eventId). It does NOT touch users, teams,
// memberships, challenge definitions, normal Solves, or Submissions, and it does
// NOT delete or recreate the Event row.

export interface ResetEventResult {
  eventId: string;
  name: string;
  previousStatus: 'NOT_STARTED' | 'LIVE' | 'CLOSED';
  clearedHiddenAssignments: number;
  clearedHiddenResults: number;
}

export async function resetEventLifecycle(
  prisma: PrismaClient,
): Promise<ResetEventResult | null> {
  const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!event) return null;

  const cleared = await prisma.$transaction(async (tx) => {
    // Event-owned hidden-level attempt state (post-activation only).
    const results = await tx.hiddenLevelResult.deleteMany({ where: { eventId: event.id } });
    const assignments = await tx.hiddenLevelAssignment.deleteMany({ where: { eventId: event.id } });
    // Lifecycle fields → NOT_STARTED (server regenerates hidden activation on next start).
    await tx.event.update({
      where: { id: event.id },
      data: {
        status: 'NOT_STARTED',
        startedAt: null,
        closedAt: null,
        hiddenActivationAt: null,
        hiddenActivated: false,
      },
    });
    return { assignments: assignments.count, results: results.count };
  });

  return {
    eventId: event.id,
    name: event.name,
    previousStatus: event.status,
    clearedHiddenAssignments: cleared.assignments,
    clearedHiddenResults: cleared.results,
  };
}
