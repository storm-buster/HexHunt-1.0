import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, stopEventAsAdmin, loginAdmin, prisma,
} from './helpers.js';
import { resetEventLifecycle } from '../src/db/reset-event-core.js';
import { startSession, stopSession } from '../src/events/event.service.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

const WV01 = 'DOOM{a3f19c2b}';

describe('reset:event (operator session reset)', () => {
  it('deletes the current LIVE session and its gameplay, leaving no live session', async () => {
    const p = await registerPlayer(app, 'Keeper', 'keep@x.com');
    await createTeam(app, p, 'Keepers');
    await startEventAsAdmin(app);
    await app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie: p }, payload: { challengeId: 'wv-01', flag: WV01 } });
    expect(await prisma.solve.count()).toBe(1);

    const res = await resetEventLifecycle(prisma);
    expect(res!.deletedLiveSession).toBe(true);
    expect(res!.clearedSolves).toBe(1);

    // No LIVE session remains; its gameplay is gone (cascade).
    expect(await prisma.eventSession.count({ where: { status: 'LIVE' } })).toBe(0);
    expect(await prisma.solve.count()).toBe(0);
    expect(await prisma.submission.count()).toBe(0);
  });

  it('preserves users, teams, memberships, challenges, event, and COMPLETED sessions', async () => {
    const p = await registerPlayer(app, 'Keeper', 'keep2@x.com');
    await createTeam(app, p, 'Keepers2');
    // Session 1: play then complete (becomes historical).
    await startEventAsAdmin(app);
    await app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie: p }, payload: { challengeId: 'wv-01', flag: WV01 } });
    await stopEventAsAdmin(app);
    const completedSolves = await prisma.solve.count();
    expect(completedSolves).toBe(1);

    // Session 2: live, then reset.
    await startEventAsAdmin(app);
    const before = {
      users: await prisma.user.count(),
      teams: await prisma.team.count(),
      memberships: await prisma.teamMembership.count(),
    };

    await resetEventLifecycle(prisma);

    expect(await prisma.user.count()).toBe(before.users);
    expect(await prisma.team.count()).toBe(before.teams);
    expect(await prisma.teamMembership.count()).toBe(before.memberships);
    expect(await prisma.event.count()).toBe(1);
    // Historical COMPLETED session + its solves survive.
    expect(await prisma.eventSession.count({ where: { status: 'COMPLETED' } })).toBe(1);
    expect(await prisma.solve.count()).toBe(completedSolves);
  });

  it('is a safe no-op when there is no live session', async () => {
    const res = await resetEventLifecycle(prisma);
    expect(res!.deletedLiveSession).toBe(false);
    expect(res!.sessionNumber).toBeNull();
  });

  it('allows START again after reset (fresh new session number)', async () => {
    await startEventAsAdmin(app);  // session 1
    await resetEventLifecycle(prisma); // delete session 1
    const started = await startSession(); // becomes session 1 again (max was deleted)
    expect(started.status).toBe('LIVE');
    const closed = await stopSession();
    expect(closed.status).toBe('COMPLETED');
  });

  it('is NOT reachable via any API route', async () => {
    const admin = await loginAdmin(app);
    for (const url of ['/api/admin/event/reset', '/api/event/reset', '/api/admin/reset']) {
      const res = await app.inject({ method: 'POST', url, headers: { cookie: admin } });
      expect(res.statusCode, url).toBe(404);
    }
  });
});
