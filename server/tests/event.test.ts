import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, loginAdmin, startEventAsAdmin, stopEventAsAdmin,
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

describe('session lifecycle', () => {
  it('only admin can start/stop; START creates a LIVE session', async () => {
    const player = await registerPlayer(app, 'P', 'ev-p@x.com');
    const denied = await adminStart(player);
    expect(denied.statusCode).toBe(403);

    const admin = await loginAdmin(app);
    const ok = await adminStart(admin);
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.body);
    expect(body.session.status).toBe('LIVE');
    expect(body.session.sessionNumber).toBe(1);
  });

  it('rejects submissions before any session starts', async () => {
    const p = await registerPlayer(app, 'P', 'ev1@x.com');
    await createTeam(app, p, 'Team Ev1');
    const res = await submit(p, 'wv-01', WV01_FLAG);
    expect(res.statusCode).toBe(409); // EVENT_NOT_LIVE
    expect(JSON.parse(res.body).error.code).toBe('EVENT_NOT_LIVE');
  });

  it('accepts a correct submission while LIVE', async () => {
    const p = await registerPlayer(app, 'P', 'ev2@x.com');
    await createTeam(app, p, 'Team Ev2');
    await startEventAsAdmin(app);
    const res = await submit(p, 'wv-01', WV01_FLAG);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('correct');
  });

  it('STOP completes the session; rejects submissions after; leaderboard stays available', async () => {
    const p = await registerPlayer(app, 'P', 'ev3@x.com');
    await createTeam(app, p, 'Team Ev3');
    await startEventAsAdmin(app);
    const admin = await loginAdmin(app);
    const closed = await adminStop(admin);
    expect(closed.statusCode).toBe(200);
    expect(JSON.parse(closed.body).session.status).toBe('COMPLETED');

    const res = await submit(p, 'wv-01', WV01_FLAG);
    expect(res.statusCode).toBe(409);

    const lb = await app.inject({ method: 'GET', url: '/api/leaderboard', headers: { cookie: p } });
    expect(lb.statusCode).toBe(200);
  });

  it('rejects STOP before any session ever started', async () => {
    const admin = await loginAdmin(app);
    const res = await adminStop(admin);
    expect(res.statusCode).toBe(409);
  });

  it('START is idempotent while LIVE (same session returned, no new session)', async () => {
    const admin = await loginAdmin(app);
    const first = JSON.parse((await adminStart(admin)).body).session;
    const second = JSON.parse((await adminStart(admin)).body).session;
    expect(second.id).toBe(first.id);
    expect(second.sessionNumber).toBe(1);
  });

  it('STOP is a safe no-op when already completed', async () => {
    const admin = await loginAdmin(app);
    await adminStart(admin);
    await adminStop(admin);
    const again = await adminStop(admin);
    expect(again.statusCode).toBe(200);
    expect(JSON.parse(again.body).session.status).toBe('COMPLETED');
  });

  it('each START after a STOP creates a NEW incrementing session', async () => {
    const admin = await loginAdmin(app);
    const s1 = JSON.parse((await adminStart(admin)).body).session;
    await adminStop(admin);
    const s2 = JSON.parse((await adminStart(admin)).body).session;
    await adminStop(admin);
    const s3 = JSON.parse((await adminStart(admin)).body).session;
    expect([s1.sessionNumber, s2.sessionNumber, s3.sessionNumber]).toEqual([1, 2, 3]);
    expect(new Set([s1.id, s2.id, s3.id]).size).toBe(3);
  });

  it('/api/event exposes status + session + authoritative server time', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/event' });
    expect(res.statusCode).toBe(200);
    const ev = JSON.parse(res.body).event;
    expect(ev.serverTime).toBeTruthy();
    expect(ev.status).toBe('NOT_STARTED');

    await startEventAsAdmin(app);
    const live = JSON.parse((await app.inject({ method: 'GET', url: '/api/event' })).body).event;
    expect(live.status).toBe('LIVE');
    expect(live.session.sessionNumber).toBe(1);

    await stopEventAsAdmin(app);
    const done = JSON.parse((await app.inject({ method: 'GET', url: '/api/event' })).body).event;
    expect(done.status).toBe('COMPLETED');
  });
});
