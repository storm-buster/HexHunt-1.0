import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); await startEventAsAdmin(app); });

const ALL_FLAGS = [
  'DOOM{a3f19c2b}', 'DOOM{7d4e0a91}', 'DOOM{2f8b6c05}',
  'DOOM{c1e94a7f}', 'DOOM{5b2d8e63}', 'DOOM{9a0f4c18}',
  'DOOM{e63b1d7a}', 'DOOM{4c9f2081}', 'DOOM{b7e5304c}',
  'DOOM{1f8a6d29}', 'DOOM{3d0c7b94}', 'DOOM{8e2145af}',
  'DOOM{d00d5f3a}', 'DOOM{f9c3a71e}',
];

describe('security & authorization', () => {
  it('players cannot call admin APIs', async () => {
    const p = await registerPlayer(app, 'P', 'sec1@x.com');
    for (const url of ['/api/admin/event', '/api/admin/teams', '/api/admin/users', '/api/admin/submissions', '/api/admin/statistics', '/api/admin/leaderboard', '/api/admin/hidden-level']) {
      const res = await app.inject({ method: 'GET', url, headers: { cookie: p } });
      expect(res.statusCode).toBe(403);
    }
    const start = await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: p } });
    expect(start.statusCode).toBe(403);
  });

  it('unauthenticated requests to admin APIs are rejected', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/statistics' });
    expect(res.statusCode).toBe(401);
  });

  it('a forged role in the request body is ignored (role comes from signed token)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { name: 'Hacker', email: 'hacker@x.com', password: 'Password123', role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).user.role).toBe('PLAYER');
  });

  it('never returns flags/answers via the challenge API', async () => {
    const p = await registerPlayer(app, 'P', 'sec2@x.com');
    await createTeam(app, p, 'Sec2');
    await startEventAsAdmin(app);

    const list = await app.inject({ method: 'GET', url: '/api/challenges', headers: { cookie: p } });
    const listBody = list.body;
    for (const flag of ALL_FLAGS) expect(listBody).not.toContain(flag);
    const parsed = JSON.parse(listBody).challenges;
    for (const c of parsed) {
      expect(c).not.toHaveProperty('flag');
      expect(c).not.toHaveProperty('flagHash');
      expect(c).not.toHaveProperty('portalAnswerHash');
      expect(JSON.stringify(c.portalPuzzle ?? {})).not.toContain('puzzleAnswer');
    }

    const one = await app.inject({ method: 'GET', url: '/api/challenges/wv-01', headers: { cookie: p } });
    for (const flag of ALL_FLAGS) expect(one.body).not.toContain(flag);
  });

  it('final-boss reveal is withheld until the team qualifies', async () => {
    const p = await registerPlayer(app, 'P', 'sec3@x.com');
    await createTeam(app, p, 'Sec3');
    await startEventAsAdmin(app);
    const res = await app.inject({ method: 'GET', url: '/api/final-boss', headers: { cookie: p } });
    const fb = JSON.parse(res.body).finalBoss;
    expect(fb.unlocked).toBe(false);
    expect(fb.reveal).toBeNull();
    expect(res.body).not.toContain('DOOM{f1n4l_b0ss_r1ddl3}');
  });

  it('requires a team before accessing challenges', async () => {
    const p = await registerPlayer(app, 'Loner', 'sec4@x.com');
    const res = await app.inject({ method: 'GET', url: '/api/challenges', headers: { cookie: p } });
    expect(res.statusCode).toBe(403);
  });
});
