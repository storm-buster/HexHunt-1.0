import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, loginAdmin, startEventAsAdmin, prisma,
} from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

const WV01_FLAG = 'DOOM{a3f19c2b}';

function submit(cookie: string, challengeId: string, flag: string) {
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag } });
}
async function adminStart(cookie: string) {
  return app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie } });
}
async function adminStop(cookie: string) {
  return app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie } });
}

describe('session lifecycle (independent sessions with full reset)', () => {
  it('admin can START an empty session #1; participants cannot start/stop', async () => {
    const admin = await loginAdmin(app);
    const ok = await adminStart(admin);
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.body);
    expect(body.session.status).toBe('LIVE');
    expect(body.session.sessionNumber).toBe(1);

    // A participant (registered now that it is LIVE) cannot control the event.
    const player = await registerPlayer(app, 'P', 'ev-p@x.com');
    expect((await adminStart(player)).statusCode).toBe(403);
    expect((await adminStop(player)).statusCode).toBe(403);
  });

  it('accepts a correct submission while LIVE', async () => {
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'P', 'ev2@x.com');
    await createTeam(app, p, 'Team Ev2');
    const res = await submit(p, 'wv-01', WV01_FLAG);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('correct');
  });

  it('STOP archives the session then WIPES all live participant/gameplay state', async () => {
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'P', 'ev3@x.com');
    await createTeam(app, p, 'Team Ev3');
    await submit(p, 'wv-01', WV01_FLAG);

    const admin = await loginAdmin(app);
    const closed = await adminStop(admin);
    expect(closed.statusCode).toBe(200);
    const stopped = JSON.parse(closed.body).stopped;
    expect(stopped.sessionNumber).toBe(1);
    expect(stopped.alreadyStopped).toBe(false);
    expect(stopped.archiveId).toBeTruthy();

    expect(await prisma.user.count({ where: { role: 'PLAYER' } })).toBe(0);
    expect(await prisma.team.count()).toBe(0);
    expect(await prisma.teamMembership.count()).toBe(0);
    expect(await prisma.solve.count()).toBe(0);
    expect(await prisma.submission.count()).toBe(0);
    expect(await prisma.eventSession.count()).toBe(0);
    expect(await prisma.sessionArchive.count()).toBe(1);
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('a player account from a stopped session can no longer authenticate', async () => {
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'Ghost', 'ghost@x.com');
    await createTeam(app, p, 'Ghosts');
    const admin = await loginAdmin(app);
    await adminStop(admin);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: p } });
    expect(me.statusCode).toBe(401);
  });

  it('rejects STOP before any session ever started', async () => {
    const admin = await loginAdmin(app);
    const res = await adminStop(admin);
    expect(res.statusCode).toBe(409);
  });

  it('START is idempotent while LIVE (same session, no new one)', async () => {
    const admin = await loginAdmin(app);
    const first = JSON.parse((await adminStart(admin)).body).session;
    const second = JSON.parse((await adminStart(admin)).body).session;
    expect(second.id).toBe(first.id);
    expect(second.sessionNumber).toBe(1);
  });

  it('STOP is a safe no-op when already stopped (no duplicate archive)', async () => {
    const admin = await loginAdmin(app);
    await adminStart(admin);
    await adminStop(admin);
    const again = await adminStop(admin);
    expect(again.statusCode).toBe(200);
    expect(JSON.parse(again.body).stopped.alreadyStopped).toBe(true);
    expect(await prisma.sessionArchive.count()).toBe(1);
  });

  it('each START after STOP creates a NEW incrementing session number', async () => {
    const admin = await loginAdmin(app);
    const s1 = JSON.parse((await adminStart(admin)).body).session; await adminStop(admin);
    const s2 = JSON.parse((await adminStart(admin)).body).session; await adminStop(admin);
    const s3 = JSON.parse((await adminStart(admin)).body).session;
    expect([s1.sessionNumber, s2.sessionNumber, s3.sessionNumber]).toEqual([1, 2, 3]);
    expect(await prisma.sessionArchive.count()).toBe(2);
  });

  it('/api/event shows LIVE while running and NOT_STARTED once stopped', async () => {
    const ev0 = JSON.parse((await app.inject({ method: 'GET', url: '/api/event' })).body).event;
    expect(ev0.status).toBe('NOT_STARTED');

    await startEventAsAdmin(app);
    const live = JSON.parse((await app.inject({ method: 'GET', url: '/api/event' })).body).event;
    expect(live.status).toBe('LIVE');
    expect(live.session.sessionNumber).toBe(1);

    const admin = await loginAdmin(app);
    await adminStop(admin);
    const done = JSON.parse((await app.inject({ method: 'GET', url: '/api/event' })).body).event;
    expect(done.status).toBe('NOT_STARTED');
  });
});
