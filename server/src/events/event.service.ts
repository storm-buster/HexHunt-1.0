import { randomInt } from 'node:crypto';
import type { Event } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { Errors } from '../middleware/errors.js';
import { broadcast } from '../realtime/hub.js';

// This project runs a single active CTF event. The schema supports many; we
// always operate on the most recently created one.
export async function getActiveEvent(): Promise<Event | null> {
  return prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
}

export async function ensureEvent(): Promise<Event> {
  const existing = await getActiveEvent();
  if (existing) return existing;
  return prisma.event.create({ data: { name: config.eventName, status: 'NOT_STARTED' } });
}

export async function requireEvent(): Promise<Event> {
  const event = await getActiveEvent();
  if (!event) throw Errors.notFound('No CTF event exists');
  return event;
}

// Player/admin-safe event view. Server time is authoritative and always sent
// so clients never rely on their local clock.
export interface EventView {
  id: string;
  name: string;
  status: 'NOT_STARTED' | 'LIVE' | 'CLOSED';
  startedAt: Date | null;
  closedAt: Date | null;
  serverTime: string;
  hidden: {
    activated: boolean;
    // Activation timestamp is NEVER exposed to players before it fires.
    activatedAt: Date | null;
  };
}

export async function getEventView(includeHiddenSchedule = false): Promise<EventView> {
  const event = await refreshHiddenActivation();
  return {
    id: event.id,
    name: event.name,
    status: event.status,
    startedAt: event.startedAt,
    closedAt: event.closedAt,
    serverTime: new Date().toISOString(),
    hidden: {
      activated: event.hiddenActivated,
      activatedAt: event.hiddenActivated
        ? event.hiddenActivationAt
        : includeHiddenSchedule
          ? event.hiddenActivationAt
          : null,
    },
  };
}

export async function startEvent(): Promise<Event> {
  const event = await requireEvent();
  if (event.status === 'LIVE') return event; // idempotent: already live

  const now = new Date();

  if (event.status === 'NOT_STARTED') {
    // First start: set the authoritative start time and schedule hidden
    // activation exactly HIDDEN_LEVEL_DELAY_MINUTES later (default T+30).
    const hiddenActivationAt = new Date(now.getTime() + config.hidden.delayMinutes * 60_000);
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { status: 'LIVE', startedAt: now, hiddenActivationAt, hiddenActivated: false },
    });
    broadcast({ type: 'CTF_STARTED', payload: { startedAt: updated.startedAt } });
    return updated;
  }

  // CLOSED -> LIVE: reopen the SAME run (not a destructive reset, not a new
  // event). Preserve startedAt, hiddenActivationAt and hiddenActivated so
  // time-decay scoring and hidden-level timing keep using the ORIGINAL start.
  // Only clear closedAt and flip status back to LIVE. Already-activated hidden
  // assignments are intentionally left intact (never re-randomized).
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { status: 'LIVE', closedAt: null },
  });
  broadcast({ type: 'CTF_STARTED', payload: { startedAt: updated.startedAt, reopened: true } });
  return updated;
}

export async function closeEvent(): Promise<Event> {
  const event = await requireEvent();
  if (event.status === 'CLOSED') return event;
  if (event.status !== 'LIVE') {
    throw Errors.conflict(`Cannot close event from status ${event.status}`);
  }
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
  broadcast({ type: 'CTF_CLOSED', payload: { closedAt: updated.closedAt } });
  return updated;
}

// Lazily flip hidden activation when the scheduled time is reached (only while
// LIVE). Called on relevant reads and by a periodic interval in the app.
export async function refreshHiddenActivation(): Promise<Event> {
  const event = await requireEvent();
  if (
    event.status === 'LIVE' &&
    !event.hiddenActivated &&
    event.hiddenActivationAt &&
    Date.now() >= event.hiddenActivationAt.getTime()
  ) {
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { hiddenActivated: true },
    });
    // At activation, select exactly one random member per active team.
    await assignHiddenLevelMembers(updated.id);
    broadcast({
      type: 'HIDDEN_LEVEL_ACTIVATED',
      payload: { activatedAt: updated.hiddenActivationAt },
    });
    return updated;
  }
  return event;
}

/**
 * For every active team with at least one member, select exactly ONE member
 * using a cryptographically secure RNG (crypto.randomInt) and persist the
 * choice in HiddenLevelAssignment. Idempotent: the `@@unique([teamId, eventId])`
 * constraint plus an existence check guarantee the selection is made once and
 * never re-rolled on subsequent calls. Broadcasts a per-team activation event
 * (admin-only channel) with the selected member.
 */
export async function assignHiddenLevelMembers(eventId: string): Promise<void> {
  const teams = await prisma.team.findMany({
    where: { active: true },
    include: { memberships: { select: { userId: true } }, hiddenAssignments: true },
  });

  for (const team of teams) {
    if (team.hiddenAssignments.some((a) => a.eventId === eventId)) continue; // never re-roll
    const memberIds = team.memberships.map((m) => m.userId);
    if (memberIds.length === 0) continue;

    // Cryptographically secure uniform selection (not index-from-id/timestamp).
    const selectedUserId = memberIds[randomInt(0, memberIds.length)];

    try {
      await prisma.hiddenLevelAssignment.create({
        data: { eventId, teamId: team.id, selectedUserId },
      });
      broadcast({
        type: 'HIDDEN_LEVEL_ACTIVATED',
        payload: { teamId: team.id, selectedUserId },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      // Concurrent activation already created it — fine.
    }
  }
}

export function assertLive(event: Event): void {
  if (event.status !== 'LIVE') throw Errors.eventNotLive();
}
