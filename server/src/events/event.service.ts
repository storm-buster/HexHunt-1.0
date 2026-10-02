import { randomInt } from 'node:crypto';
import type { Event, EventSession } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma, txPrisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { Errors } from '../middleware/errors.js';
import { broadcast, disconnectPlayers } from '../realtime/hub.js';
import { buildSessionSnapshot, nextSessionNumber } from '../admin/archive.service.js';

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

// Is a session currently LIVE? (used to gate participant registration/login/teams)
export async function isSessionLive(): Promise<boolean> {
  return (await getCurrentSession()) !== null;
}

// Participant-facing gate: registration, player login, and team create/join are
// only permitted while a session is LIVE. Between STOP and START the live
// participant state must stay empty, so these are rejected with a generic
// "CTF session is not active" response. (Admin login bypasses this.)
export async function requireParticipantSession(): Promise<void> {
  if (!(await isSessionLive())) throw Errors.sessionNotActive();
}

// ── Event/session view (status derived from the single live session) ──
export interface EventView {
  id: string;
  name: string;
  status: 'NOT_STARTED' | 'LIVE';
  session: {
    id: string;
    sessionNumber: number;
    status: 'LIVE';
    startedAt: Date;
  } | null;
  serverTime: string;
  hidden: { activated: boolean; activatedAt: Date | null };
}

export async function getEventView(includeHiddenSchedule = false): Promise<EventView> {
  const event = await requireEvent();
  // Flip hidden activation lazily for the live session (if any).
  const live = await refreshHiddenActivation();

  // Players only ever see the current LIVE session. Completed sessions are
  // archived (admin-only) and the live tables are empty between sessions.
  const status: EventView['status'] = live ? 'LIVE' : 'NOT_STARTED';

  return {
    id: event.id,
    name: event.name,
    status,
    session: live
      ? {
          id: live.id,
          sessionNumber: live.sessionNumber,
          status: 'LIVE',
          startedAt: live.startedAt,
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

// ── START: always a NEW, EMPTY session (never reopen) ───────
// The live tables are already empty (wiped at the previous STOP / reset / fresh
// deploy), so a session simply begins with fresh timers. The session number is
// derived from the immutable archives, so it keeps counting up forever.
export async function startSession(): Promise<EventSession> {
  const event = await requireEvent();

  // Idempotent: if a session is already LIVE, return it.
  const existingLive = await prisma.eventSession.findFirst({
    where: { eventId: event.id, status: 'LIVE' },
  });
  if (existingLive) return existingLive;

  // Authoritative numbering comes ONLY from the immutable archives, so the
  // first real session is #1 even if a legacy pre-archive EventSession row
  // lingers. createLiveSession() reclaims such an orphan row if it collides.
  const sessionNumber = await nextSessionNumber(); // (max archived #) + 1
  return createLiveSession(event.id, sessionNumber, true);
}

async function createLiveSession(
  eventId: string,
  sessionNumber: number,
  allowOrphanReclaim: boolean,
): Promise<EventSession> {
  const now = new Date();
  const hiddenActivationAt = new Date(now.getTime() + config.hidden.delayMinutes * 60_000);

  try {
    const created = await prisma.eventSession.create({
      data: {
        eventId,
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
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // (a) A LIVE session won a start race (one-LIVE-per-event index) →
      //     idempotent: return the live session, never delete it.
      const live = await prisma.eventSession.findFirst({
        where: { eventId, status: 'LIVE' },
      });
      if (live) return live;

      // (b) The collision is a stale NON-LIVE orphan on this sessionNumber left
      //     by the pre-archive architecture. Reclaim it (once) so the first real
      //     session keeps its intended number instead of being bumped to #2.
      if (allowOrphanReclaim && (await reclaimOrphanSessionRow(eventId, sessionNumber))) {
        return createLiveSession(eventId, sessionNumber, false); // retry once, no further reclaim
      }
    }
    throw e;
  }
}

/**
 * Explicit, tightly-scoped reclaim of an ORPHAN session number: a NON-LIVE
 * `EventSession` row (left by the old pre-archive lifecycle) whose number has NO
 * corresponding `SessionArchive`. Deleting it cascades its legacy
 * solves/submissions/hidden rows and frees the number for the first real
 * session. Returns true if a row was reclaimed.
 *
 * Safety invariants:
 *  - NEVER touches a LIVE session (status filtered to non-LIVE).
 *  - NEVER overwrites archived history (refuses if the number is in SessionArchive).
 */
async function reclaimOrphanSessionRow(eventId: string, sessionNumber: number): Promise<boolean> {
  // Never overwrite a completed, archived session.
  const archived = await prisma.sessionArchive.findUnique({ where: { sessionNumber } });
  if (archived) return false;

  const stale = await prisma.eventSession.findFirst({
    where: { eventId, sessionNumber, status: { not: 'LIVE' } },
  });
  if (!stale) return false;

  // Cascades the orphan session's legacy Solve/Submission/HiddenLevel* rows.
  await prisma.eventSession.delete({ where: { id: stale.id } });
  return true;
}

export interface StopResult {
  sessionNumber: number;
  archiveId: string | null;
  alreadyStopped: boolean;
}

// ── STOP: finalize → archive → WIPE all live participant/gameplay state ──
// 1) Snapshot the entire live session (read-only).
// 2) In one transaction: persist the immutable SessionArchive, then delete the
//    live session (cascades solves/submissions/hidden), all teams (cascades
//    memberships) and all PLAYER users. The admin account and challenge
//    definitions are preserved. Historical archives are never touched.
// 3) Disconnect player sockets. There is NO reopen.
export async function stopSession(): Promise<StopResult> {
  const event = await requireEvent();
  const live = await prisma.eventSession.findFirst({
    where: { eventId: event.id, status: 'LIVE' },
    orderBy: { sessionNumber: 'desc' },
  });

  if (!live) {
    // Safe no-op if at least one session has already completed (archived);
    // reject only if nothing has ever started.
    const archivedCount = await prisma.sessionArchive.count();
    if (archivedCount > 0) {
      const top = await prisma.sessionArchive.findFirst({ orderBy: { sessionNumber: 'desc' } });
      return { sessionNumber: top!.sessionNumber, archiveId: top!.id, alreadyStopped: true };
    }
    throw Errors.conflict('No session is running');
  }

  // Mark completedAt on the in-memory copy for an accurate archive timestamp.
  const completedAt = new Date();
  const sessionForSnapshot: EventSession = { ...live, status: 'COMPLETED', completedAt };

  // 1) Build the full immutable snapshot BEFORE any deletion.
  const built = await buildSessionSnapshot(sessionForSnapshot, event.name);

  // 2) Archive + wipe atomically (direct client — interactive transaction needs
  //    a session-pinned connection; the pooled endpoint breaks it).
  const archive = await txPrisma.$transaction(async (tx) => {
    const created = await tx.sessionArchive.create({
      data: {
        sessionNumber: built.scalars.sessionNumber,
        eventName: built.scalars.eventName,
        startedAt: built.scalars.startedAt,
        completedAt: built.scalars.completedAt,
        durationSeconds: built.scalars.durationSeconds,
        numberOfUsers: built.scalars.numberOfUsers,
        numberOfTeams: built.scalars.numberOfTeams,
        totalSolves: built.scalars.totalSolves,
        totalSubmissions: built.scalars.totalSubmissions,
        highestScore: built.scalars.highestScore,
        hiddenAttempts: built.scalars.hiddenAttempts,
        hiddenCorrect: built.scalars.hiddenCorrect,
        hiddenIncorrect: built.scalars.hiddenIncorrect,
        data: built.snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    // Deleting the live session cascades Solve/Submission/HiddenLevelResult/
    // HiddenLevelAssignment for the session.
    await tx.eventSession.delete({ where: { id: live.id } });
    // Deleting teams cascades their memberships; then remove player accounts.
    await tx.teamMembership.deleteMany({});
    await tx.team.deleteMany({});
    await tx.user.deleteMany({ where: { role: 'PLAYER' } });

    return created;
  });

  // 3) Kick stale player sockets; notify admins.
  disconnectPlayers();
  broadcast({ type: 'CTF_CLOSED', payload: { sessionNumber: built.scalars.sessionNumber, archiveId: archive.id } });

  return { sessionNumber: built.scalars.sessionNumber, archiveId: archive.id, alreadyStopped: false };
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
