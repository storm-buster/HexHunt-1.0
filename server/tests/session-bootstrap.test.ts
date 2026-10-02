import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, stopEventAsAdmin, prisma,
} from './helpers.js';
import { startSession } from '../src/events/event.service.js';
import { cleanupLegacyPreArchiveState } from '../src/db/session-bootstrap-cleanup-core.js';

const WV01 = 'DOOM{a3f19c2b}';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

async function eventId(): Promise<string> {
  const e = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
  return e!.id;
}
// Simulate a legacy pre-archive EventSession row (old lifecycle left these as
// COMPLETED instead of deleting them).
async function seedLegacySession(sessionNumber: number) {
  await prisma.eventSession.create({
    data: {
      eventId: await eventId(),
      sessionNumber,
      status: 'COMPLETED',
      startedAt: new Date(Date.now() - 3_600_000),
      completedAt: new Date(Date.now() - 1_800_000),
      hiddenActivated: false,
    },
  });
}

describe('START hardening — stale/orphan EventSession reclaim', () => {
  it('reclaims a legacy COMPLETED #1 (no archive) so the first real session is #1', async () => {
    await seedLegacySession(1);
    expect(await prisma.sessionArchive.count()).toBe(0);

    const session = await startSession();
    expect(session.status).toBe('LIVE');
    expect(session.sessionNumber).toBe(1); // NOT bumped to #2
    // The orphan COMPLETED row was reclaimed; only the new LIVE #1 remains.
    expect(await prisma.eventSession.count()).toBe(1);
    expect(await prisma.eventSession.count({ where: { status: 'COMPLETED' } })).toBe(0);
    expect(await prisma.sessionArchive.count()).toBe(0);
  });

  it('reclaim cascades the orphan session legacy gameplay but leaves the new session empty', async () => {
    // Legacy #1 with a solve attached.
    await seedLegacySession(1);
    const legacy = await prisma.eventSession.findFirst({ where: { sessionNumber: 1 } });
    // a legacy team + solve bound to the stale session
    const u = await prisma.user.create({ data: { name: 'Old', email: 'old-legacy@x.com', passwordHash: 'x', role: 'PLAYER' } });
    const t = await prisma.team.create({ data: { name: 'LegacyTeam', inviteCode: 'LEGACY12' } });
    await prisma.solve.create({ data: { sessionId: legacy!.id, teamId: t.id, challengeId: 'wv-01', solvedByUserId: u.id, basePoints: 500, awardedPoints: 500, elapsedSeconds: 10 } });
    expect(await prisma.solve.count()).toBe(1);

    const session = await startSession();
    expect(session.sessionNumber).toBe(1);
    // Legacy solve cascaded away with the reclaimed session; new session has none.
    expect(await prisma.solve.count()).toBe(0);
  });

  it('START is idempotent when a LIVE session already exists (never deletes it)', async () => {
    const first = await startSession();
    const again = await startSession();
    expect(again.id).toBe(first.id);
    expect(again.sessionNumber).toBe(first.sessionNumber);
    expect(await prisma.eventSession.count({ where: { status: 'LIVE' } })).toBe(1);
  });

  it('numbering stays archive-authoritative: #1 archived → next START is #2 (no overwrite)', async () => {
    // Real session 1 → archive it.
    await startEventAsAdmin(app);
    await stopEventAsAdmin(app);
    expect(await prisma.sessionArchive.count()).toBe(1);

    const s2 = await startSession();
    expect(s2.sessionNumber).toBe(2);
    // Archive #1 is untouched.
    const archive = await prisma.sessionArchive.findUnique({ where: { sessionNumber: 1 } });
    expect(archive).not.toBeNull();
  });
});

describe('legacy cleanup core — cleanupLegacyPreArchiveState', () => {
  it('wipes legacy participants + orphan sessions, preserving admin/challenges/Event/archives', async () => {
    // Build legacy state: players, teams, gameplay, and a stale COMPLETED session.
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'Legacy', 'legacy@x.com');
    await createTeam(app, p, 'Legacy Crew');
    await app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie: p }, payload: { challengeId: 'wv-01', flag: WV01 } });
    // Archive a real session so we can prove archives are preserved.
    await stopEventAsAdmin(app);
    expect(await prisma.sessionArchive.count()).toBe(1);

    // Now simulate leftover legacy participants + a stale COMPLETED (non-archived) session #99.
    // (Created directly — registration via API is gated to a LIVE session.)
    const u = await prisma.user.create({ data: { name: 'G2', email: 'g2@x.com', passwordHash: 'x', role: 'PLAYER' } });
    const t = await prisma.team.create({ data: { name: 'GhostTeam', inviteCode: 'GHOST123' } });
    await prisma.teamMembership.create({ data: { teamId: t.id, userId: u.id, role: 'OWNER' } });
    await seedLegacySession(99);

    const adminsBefore = await prisma.user.count({ where: { role: 'ADMIN' } });
    const challengesBefore = await prisma.challenge.count();

    const result = await cleanupLegacyPreArchiveState(prisma);

    // Clean pre-first-session state.
    expect(result.after.playerUsers).toBe(0);
    expect(result.after.teams).toBe(0);
    expect(result.after.memberships).toBe(0);
    expect(result.after.eventSessions).toBe(0);
    expect(result.after.solves).toBe(0);
    expect(result.after.submissions).toBe(0);
    expect(result.after.hiddenAssignments).toBe(0);
    expect(result.after.hiddenResults).toBe(0);
    expect(result.deletedLegacySessions).toBe(1); // the #99 orphan

    // Preserved.
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(adminsBefore);
    expect(await prisma.challenge.count()).toBe(challengesBefore);
    expect(await prisma.event.count()).toBe(1);
    expect(await prisma.sessionArchive.count()).toBe(1); // history intact
  });

  it('refuses to run while a session is LIVE', async () => {
    await startEventAsAdmin(app); // a LIVE session exists
    await expect(cleanupLegacyPreArchiveState(prisma)).rejects.toThrow(/LIVE session exists/i);
    // Nothing wiped.
    expect(await prisma.eventSession.count({ where: { status: 'LIVE' } })).toBe(1);
  });

  it('after cleanup, START creates a clean Session #1', async () => {
    // Legacy stale #1 + leftover player, no archives.
    await seedLegacySession(1);
    await prisma.user.create({ data: { name: 'L', email: 'l@x.com', passwordHash: 'x', role: 'PLAYER' } });

    await cleanupLegacyPreArchiveState(prisma);
    expect(await prisma.eventSession.count()).toBe(0);
    expect(await prisma.user.count({ where: { role: 'PLAYER' } })).toBe(0);

    const s1 = await startSession();
    expect(s1.sessionNumber).toBe(1);
    expect(s1.status).toBe('LIVE');
  });
});
