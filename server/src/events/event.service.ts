import { randomInt } from 'node:crypto';
import type { Event, EventSession } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { Errors } from '../middleware/errors.js';
import { broadcast } from '../realtime/hub.js';

// One persistent Event container per deployment; gameplay happens in sessions.
export async function getEvent(): Promise<Event | null> {
  return prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
}

export async function ensureEvent(): Promise<Event> {
  const existing = await getEvent();
  if (existing) return existing;
  return prisma.event.create({ data: { name: config.eventName } });
}

export async function requireEvent(): Promise<Event> {
  const event = await getEvent();
  if (!event) throw Errors.notFound('No CTF event exists');
  return event;
}

// The current LIVE session for the event, or null if none is running.
export async function getCurrentSession(): Promise<EventSession | null> {
  const event = await getEvent();
  if (!event) return null;
  return prisma.eventSession.findFirst({
    where: { eventId: event.id, status: 'LIVE' },
    orderBy: { sessionNumber: 'desc' },
  });
}

// For gameplay endpoints: require a LIVE session or reject.
export async function requireLiveSession(): Promise<EventSession> {
  const session = await refreshHiddenActivation();
  if (!session) throw Errors.eventNotLive();
  return session;
}

// ── Event/session view (status derived from sessions) ───────
export interface EventView {
  id: string;
  name: string;
  status: 'NOT_STARTED' | 'LIVE' | 'COMPLETED';
  session: {
    id: string;
    sessionNumber: number;
    status: 'LIVE' | 'COMPLETED';
    startedAt: Date;
    completedAt: Date | null;
  } | null;
  serverTime: string;
  hidden: { activated: boolean; activatedAt: Date | null };
}

export async function getEventView(includeHiddenSchedule = false): Promise<EventView> {
  const event = await requireEvent();
  // Flip hidden activation lazily for the live session (if any).
  await refreshHiddenActivation();

  const live = await prisma.eventSession.findFirst({
    where: { eventId: event.id, status: 'LIVE' },
    orderBy: { sessionNumber: 'desc' },
  });
  const session =
    live ??
    (await prisma.eventSession.findFirst({
      where: { eventId: event.id },
      orderBy: { sessionNumber: 'desc' },
    }));

  const status: EventView['status'] = live ? 'LIVE' : session ? 'COMPLETED' : 'NOT_STARTED';

  return {
    id: event.id,
    name: event.name,
    status,
    session: session
      ? {
          id: session.id,
          sessionNumber: session.sessionNumber,
          status: session.status,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
        }
      : null,
    serverTime: new Date().toISOString(),
    hidden: {
      activated: live?.hiddenActivated ?? false,
      activatedAt: live?.hiddenActivated
        ? live.hiddenActivationAt
        : includeHiddenSchedule
          ? (live?.hiddenActivationAt ?? null)
          : null,
    },
  };
}

// ── START: always create a NEW session (never reopen) ───────
export async function startSession(): Promise<EventSession> {
  const event = await requireEvent();

  // Idempotent: if a session is already LIVE, return it.
  const existingLive = await prisma.eventSession.findFirst({
    where: { eventId: event.id, status: 'LIVE' },
  });
  if (existingLive) return existingLive;

  const now = new Date();
  const hiddenActivationAt = new Date(now.getTime() + config.hidden.delayMinutes * 60_000);
  const last = await prisma.eventSession.findFirst({
    where: { eventId: event.id },
    orderBy: { sessionNumber: 'desc' },
  });
  const sessionNumber = (last?.sessionNumber ?? 0) + 1;

  try {
    const created = await prisma.eventSession.create({
      data: {
        eventId: event.id,
        sessionNumber,
        status: 'LIVE',
        startedAt: now,
        hiddenActivationAt,
        hiddenActivated: false,
      },
    });
    broadcast({ type: 'CTF_STARTED', payload: { sessionId: created.id, sessionNumber } });
    return created;
  } catch (e) {
    // Lost a race (partial-unique one-LIVE index, or sessionNumber unique) →
    // return the session that won.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const live = await prisma.eventSession.findFirst({
        where: { eventId: event.id, status: 'LIVE' },
      });
      if (live) return live;
    }
    throw e;
  }
}

// ── STOP: complete the current LIVE session (archive it) ────
export async function stopSession(): Promise<EventSession> {
  const event = await requireEvent();
  const live = await prisma.eventSession.findFirst({
    where: { eventId: event.id, status: 'LIVE' },
    orderBy: { sessionNumber: 'desc' },
  });

  if (!live) {
    // Idempotent if a prior session exists; invalid if nothing ever started.
    const anySession = await prisma.eventSession.findFirst({
      where: { eventId: event.id },
      orderBy: { sessionNumber: 'desc' },
    });
    if (anySession) return anySession; // already completed — safe no-op
    throw Errors.conflict('No session is running');
  }

  const updated = await prisma.eventSession.update({
    where: { id: live.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  broadcast({ type: 'CTF_CLOSED', payload: { sessionId: updated.id, sessionNumber: updated.sessionNumber } });
  return updated;
}

// Lazily flip hidden activation for the LIVE session when its scheduled time
// passes. Returns the LIVE session (post-update) or null if none is live.
export async function refreshHiddenActivation(): Promise<EventSession | null> {
  const event = await getEvent();
  if (!event) return null;
  const live = await prisma.eventSession.findFirst({
    where: { eventId: event.id, status: 'LIVE' },
    orderBy: { sessionNumber: 'desc' },
  });
  if (!live) return null;

  if (!live.hiddenActivated && live.hiddenActivationAt && Date.now() >= live.hiddenActivationAt.getTime()) {
    const updated = await prisma.eventSession.update({
      where: { id: live.id },
      data: { hiddenActivated: true },
    });
    await assignHiddenLevelMembers(updated.id);
    broadcast({ type: 'HIDDEN_LEVEL_ACTIVATED', payload: { sessionId: updated.id, activatedAt: updated.hiddenActivationAt } });
    return updated;
  }
  return live;
}

/**
 * Select exactly ONE active member per team for THIS session using a secure
 * RNG. Scoped to sessionId → a fresh selection every session. Idempotent via
 * `@@unique([sessionId, teamId])` + existence check.
 */
export async function assignHiddenLevelMembers(sessionId: string): Promise<void> {
  const teams = await prisma.team.findMany({
    where: { active: true },
    include: {
      memberships: { select: { userId: true } },
      hiddenAssignments: { where: { sessionId }, select: { id: true } },
    },
  });

  for (const team of teams) {
    if (team.hiddenAssignments.length > 0) continue; // already assigned this session
    const memberIds = team.memberships.map((m) => m.userId);
    if (memberIds.length === 0) continue;
    const selectedUserId = memberIds[randomInt(0, memberIds.length)];
    try {
      await prisma.hiddenLevelAssignment.create({ data: { sessionId, teamId: team.id, selectedUserId } });
      broadcast({ type: 'HIDDEN_LEVEL_ACTIVATED', payload: { sessionId, teamId: team.id, selectedUserId } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
  }
}
