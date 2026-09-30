import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, loginAdmin, prisma,
} from './helpers.js';
import { resetEventLifecycle } from '../src/db/reset-event-core.js';
import { startEvent, closeEvent } from '../src/events/event.service.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

const WV01 = 'DOOM{a3f19c2b}';

describe('reset:event (operator lifecycle reset)', () => {
  it('resets CLOSED → NOT_STARTED and clears lifecycle timestamps', async () => {
    await startEventAsAdmin(app);
    const adminCookie = await loginAdmin(app);
    await app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie: adminCookie } });
    let ev = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(ev!.status).toBe('CLOSED');

    const res = await resetEventLifecycle(prisma);
    expect(res!.previousStatus).toBe('CLOSED');

    ev = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(ev!.status).toBe('NOT_STARTED');
    expect(ev!.startedAt).toBeNull();
    expect(ev!.closedAt).toBeNull();
    expect(ev!.hiddenActivationAt).toBeNull();
    expect(ev!.hiddenActivated).toBe(false);
  });

  it('does NOT delete users, teams, memberships, solves, or submissions', async () => {
    const p = await registerPlayer(app, 'Keeper', 'keep@x.com');
    await createTeam(app, p, 'Keepers');
    await startEventAsAdmin(app);
    await app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie: p }, payload: { challengeId: 'wv-01', flag: WV01 } });

    const before = {
      users: await prisma.user.count(),
      teams: await prisma.team.count(),
      memberships: await prisma.teamMembership.count(),
      solves: await prisma.solve.count(),
      submissions: await prisma.submission.count(),
    };
    expect(before.solves).toBe(1);

    await resetEventLifecycle(prisma);

    expect(await prisma.user.count()).toBe(before.users);
    expect(await prisma.team.count()).toBe(before.teams);
    expect(await prisma.teamMembership.count()).toBe(before.memberships);
    expect(await prisma.solve.count()).toBe(before.solves);       // scores preserved
    expect(await prisma.submission.count()).toBe(before.submissions);
    // event row still exists (not recreated/deleted)
    expect(await prisma.event.count()).toBe(1);
  });

  it('clears the current event hidden-level attempt state', async () => {
    // seed a hidden assignment + result for the current event, then reset
    const p = await registerPlayer(app, 'Hid', 'hid@x.com');
    await createTeam(app, p, 'HidTeam');
    const ev = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    const team = await prisma.team.findFirst({ where: { name: 'HidTeam' } });
    const user = await prisma.user.findUnique({ where: { email: 'hid@x.com' } });
    await prisma.hiddenLevelAssignment.create({ data: { eventId: ev!.id, teamId: team!.id, selectedUserId: user!.id } });
    await prisma.hiddenLevelResult.create({ data: { eventId: ev!.id, teamId: team!.id, submittedByUserId: user!.id, correct: true, scoreDelta: 500 } });

    const res = await resetEventLifecycle(prisma);
    expect(res!.clearedHiddenAssignments).toBe(1);
    expect(res!.clearedHiddenResults).toBe(1);
    expect(await prisma.hiddenLevelAssignment.count()).toBe(0);
    expect(await prisma.hiddenLevelResult.count()).toBe(0);
  });

  it('allows START again after reset, and CLOSE after a subsequent start', async () => {
    await startEventAsAdmin(app);
    const adminCookie = await loginAdmin(app);
    await app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie: adminCookie } });

    await resetEventLifecycle(prisma);

    const started = await startEvent();            // must succeed again
    expect(started.status).toBe('LIVE');
    const closed = await closeEvent();             // and close again
    expect(closed.status).toBe('CLOSED');
  });

  it('is NOT reachable via any API route (players/admin cannot invoke reset)', async () => {
    const admin = await loginAdmin(app);
    for (const url of ['/api/admin/event/reset', '/api/event/reset', '/api/admin/reset']) {
      const res = await app.inject({ method: 'POST', url, headers: { cookie: admin } });
      expect(res.statusCode, url).toBe(404);
    }
  });
});
