import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, stopEventAsAdmin, loginAdmin, prisma,
} from './helpers.js';
import { resetEventLifecycle } from '../src/db/reset-event-core.js';
import { startSession } from '../src/events/event.service.js';
import { solveChallenge } from './instance-helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

const WV01 = 'DOOM{a3f19c2b}';

describe('reset:event (operator LIVE-state wipe, never archives)', () => {
  it('wipes all live participant/gameplay state (no archive created)', async () => {
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'Keeper', 'keep@x.com');
    await createTeam(app, p, 'Keepers');
    await solveChallenge(app, p, 'wv-01');
    expect(await prisma.solve.count()).toBe(1);

    const res = await resetEventLifecycle(prisma);
    expect(res.deletedLiveSession).toBe(true);
    expect(res.clearedUsers).toBe(1);
    expect(res.clearedTeams).toBe(1);
    expect(res.clearedSolves).toBe(1);

    expect(await prisma.user.count({ where: { role: 'PLAYER' } })).toBe(0);
    expect(await prisma.team.count()).toBe(0);
    expect(await prisma.teamMembership.count()).toBe(0);
    expect(await prisma.solve.count()).toBe(0);
    expect(await prisma.submission.count()).toBe(0);
    expect(await prisma.eventSession.count()).toBe(0);
    // reset does NOT archive.
    expect(await prisma.sessionArchive.count()).toBe(0);
  });

  it('preserves admin, challenges, Event, and ALL completed-session archives', async () => {
    const admin = await loginAdmin(app);
    // Produce an archive (session 1 stop).
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'Hist', 'hist@x.com');
    await createTeam(app, p, 'Historians');
    await solveChallenge(app, p, 'wv-01');
    await stopEventAsAdmin(app);
    expect(await prisma.sessionArchive.count()).toBe(1);

    // Start session 2 live, then reset it.
    await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } });
    const challengesBefore = await prisma.challenge.count();

    await resetEventLifecycle(prisma);

    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
    expect(await prisma.challenge.count()).toBe(challengesBefore);
    expect(await prisma.event.count()).toBe(1);
    // Archive from session 1 is untouched.
    expect(await prisma.sessionArchive.count()).toBe(1);
    const archive = await prisma.sessionArchive.findFirst();
    expect(archive!.sessionNumber).toBe(1);
    expect(archive!.totalSolves).toBe(1);
  });

  it('is a safe no-op when there is no live session or participants', async () => {
    const res = await resetEventLifecycle(prisma);
    expect(res.deletedLiveSession).toBe(false);
    expect(res.clearedUsers).toBe(0);
    expect(res.clearedTeams).toBe(0);
  });

  it('allows START again after reset (session numbering continues from archives)', async () => {
    const admin = await loginAdmin(app);
    await startEventAsAdmin(app);          // session 1
    await stopEventAsAdmin(app);           // archive #1
    await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } }); // session 2 live
    await resetEventLifecycle(prisma);     // wipe live session 2 (not archived)
    const started = await startSession();  // next number = maxArchive(1)+1 = 2
    expect(started.status).toBe('LIVE');
    expect(started.sessionNumber).toBe(2);
  });

  it('is NOT reachable via any API route', async () => {
    const admin = await loginAdmin(app);
    for (const url of ['/api/admin/event/reset', '/api/event/reset', '/api/admin/reset']) {
      const res = await app.inject({ method: 'POST', url, headers: { cookie: admin } });
      expect(res.statusCode, url).toBe(404);
    }
  });
});
