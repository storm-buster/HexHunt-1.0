import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, loginAdmin, startEventAsAdmin,
} from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

const WV01_FLAG = 'DOOM{a3f19c2b}';

async function submit(cookie: string, challengeId: string, flag: string) {
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag } });
}

describe('event lifecycle', () => {
  it('only admin can start/close the event', async () => {
    const player = await registerPlayer(app, 'P', 'ev-p@x.com');
    const denied = await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: player } });
    expect(denied.statusCode).toBe(403);

    const admin = await loginAdmin(app);
    const ok = await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).event.status).toBe('LIVE');
  });

  it('rejects submissions before start', async () => {
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

  it('rejects submissions after close and keeps leaderboard available', async () => {
    const p = await registerPlayer(app, 'P', 'ev3@x.com');
    await createTeam(app, p, 'Team Ev3');
    await startEventAsAdmin(app);
    const admin = await loginAdmin(app);
    const closed = await app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie: admin } });
    expect(JSON.parse(closed.body).event.status).toBe('CLOSED');

    const res = await submit(p, 'wv-01', WV01_FLAG);
    expect(res.statusCode).toBe(409);

    const lb = await app.inject({ method: 'GET', url: '/api/leaderboard', headers: { cookie: p } });
    expect(lb.statusCode).toBe(200);
  });

  it('rejects invalid transition (close before start)', async () => {
    const admin = await loginAdmin(app);
    const res = await app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie: admin } });
    expect(res.statusCode).toBe(409);
  });

  it('exposes authoritative server time on /api/event', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/event' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).event.serverTime).toBeTruthy();
  });
});
