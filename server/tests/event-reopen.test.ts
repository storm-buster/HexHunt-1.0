import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, loginAdmin, prisma,
} from './helpers.js';
import { startEvent, closeEvent, refreshHiddenActivation } from '../src/events/event.service.js';

const WV01 = 'DOOM{a3f19c2b}';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

function submit(cookie: string, challengeId: string, flag: string) {
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag } });
}
async function currentEvent() {
  return prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
}
async function adminClose() {
  const c = await loginAdmin(app);
  return app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie: c } });
}
async function adminStart() {
  const c = await loginAdmin(app);
  return app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: c } });
}

describe('event reopen (CLOSED -> LIVE)', () => {
  it('CLOSED -> LIVE works via the admin API and preserves startedAt + clears closedAt', async () => {
    await startEventAsAdmin(app);
    const started = await currentEvent();
    const startedAt = started!.startedAt!;
    expect(startedAt).not.toBeNull();

    const closeRes = await adminClose();
    expect(JSON.parse(closeRes.body).event.status).toBe('CLOSED');
    expect((await currentEvent())!.closedAt).not.toBeNull();

    const reopen = await adminStart();
    expect(reopen.statusCode).toBe(200);
    expect(JSON.parse(reopen.body).event.status).toBe('LIVE');

    const ev = await currentEvent();
    expect(ev!.status).toBe('LIVE');
    expect(ev!.startedAt!.getTime()).toBe(startedAt.getTime()); // original start preserved
    expect(ev!.closedAt).toBeNull();                            // closedAt cleared
  });

  it('reopen preserves solves and team score', async () => {
    const p = await registerPlayer(app, 'Keeper', 'reopen-k@x.com');
    await createTeam(app, p, 'Reopeners');
    await startEventAsAdmin(app);
    expect((await submit(p, 'wv-01', WV01)).statusCode).toBe(200);

    const before = {
      solves: await prisma.solve.count(),
      score: (await app.inject({ method: 'GET', url: '/api/leaderboard', headers: { cookie: p } })),
    };
    const scoreBefore = JSON.parse(before.score.body).leaderboard[0].score;

    await adminClose();
    await adminStart(); // reopen

    expect(await prisma.solve.count()).toBe(before.solves);
    const lb = await app.inject({ method: 'GET', url: '/api/leaderboard', headers: { cookie: p } });
    expect(JSON.parse(lb.body).leaderboard[0].score).toBe(scoreBefore);
  });

  it('reopen preserves hidden assignment/result and does NOT re-randomize', async () => {
    const p = await registerPlayer(app, 'Hid', 'reopen-h@x.com');
    await createTeam(app, p, 'HidReopen');
    await startEventAsAdmin(app);

    // Force hidden activation now (assigns one member per team).
    const ev = await currentEvent();
    await prisma.event.update({ where: { id: ev!.id }, data: { hiddenActivationAt: new Date(Date.now() - 1000), hiddenActivated: false } });
    await refreshHiddenActivation();

    const team = await prisma.team.findFirst({ where: { name: 'HidReopen' } });
    const a1 = await prisma.hiddenLevelAssignment.findUnique({ where: { teamId_eventId: { teamId: team!.id, eventId: ev!.id } } });
    expect(a1).not.toBeNull();
    const selected = a1!.selectedUserId;
    expect((await currentEvent())!.hiddenActivated).toBe(true);

    await adminClose();
    await adminStart();            // reopen
    await refreshHiddenActivation(); // ticker tick after reopen

    const after = await currentEvent();
    expect(after!.hiddenActivated).toBe(true);                 // still activated
    expect(await prisma.hiddenLevelAssignment.count()).toBe(1); // not regenerated
    const a2 = await prisma.hiddenLevelAssignment.findUnique({ where: { teamId_eventId: { teamId: team!.id, eventId: ev!.id } } });
    expect(a2!.selectedUserId).toBe(selected);                 // same member
  });

  it('accepts submissions again after reopen (scoring base = original start)', async () => {
    const p = await registerPlayer(app, 'P', 'reopen-s@x.com');
    await createTeam(app, p, 'ReopenSolve');
    await startEventAsAdmin(app);
    const startedAt = (await currentEvent())!.startedAt!.getTime();

    await adminClose();
    // closed → submission rejected
    expect((await submit(p, 'wv-01', WV01)).statusCode).toBe(409);

    await adminStart(); // reopen
    const res = await submit(p, 'wv-01', WV01);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('correct');
    // startedAt unchanged → time-decay keeps using the original run start
    expect((await currentEvent())!.startedAt!.getTime()).toBe(startedAt);
  });

  it('is idempotent: START on LIVE and CLOSE on CLOSED do not change state', async () => {
    await startEventAsAdmin(app);
    const startedAt = (await currentEvent())!.startedAt!.getTime();
    const liveAgain = await startEvent();            // LIVE -> START
    expect(liveAgain.status).toBe('LIVE');
    expect(liveAgain.startedAt!.getTime()).toBe(startedAt);

    await closeEvent();
    const closedAgain = await closeEvent();          // CLOSED -> CLOSE
    expect(closedAgain.status).toBe('CLOSED');
  });

  it('still rejects NOT_STARTED -> CLOSE', async () => {
    await expect(closeEvent()).rejects.toThrow();    // 409 invalid transition
    expect((await currentEvent())!.status).toBe('NOT_STARTED');
  });
});
