import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, prisma,
} from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

const FLAGS: Record<string, string> = {
  'wv-01': 'DOOM{a3f19c2b}',
  'wv-02': 'DOOM{7d4e0a91}',
};

function submit(cookie: string, challengeId: string, flag: string) {
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag } });
}
function joinTeam(cookie: string, inviteCode: string) {
  return app.inject({ method: 'POST', url: '/api/teams/join', headers: { cookie }, payload: { inviteCode } });
}

describe('submissions & challenge access', () => {
  it('accepts a correct flag and rejects an incorrect one (generic response)', async () => {
    const p = await registerPlayer(app, 'P', 's1@x.com');
    await createTeam(app, p, 'S1');
    await startEventAsAdmin(app);

    const good = await submit(p, 'wv-01', FLAGS['wv-01']);
    expect(good.statusCode).toBe(200);
    expect(JSON.parse(good.body).result).toBe('correct');

    const badTeam = await registerPlayer(app, 'Q', 's1b@x.com');
    await createTeam(app, badTeam, 'S1B');
    const bad = await submit(badTeam, 'wv-01', 'DOOM{wrong}');
    expect(bad.statusCode).toBe(200);
    const body = JSON.parse(bad.body);
    expect(body.result).toBe('incorrect');
    expect(body).not.toHaveProperty('flag');
    expect(body).not.toHaveProperty('expected');
  });

  it('denies access/submission to a locked challenge (server-side gating)', async () => {
    const p = await registerPlayer(app, 'P', 's2@x.com');
    await createTeam(app, p, 'S2');
    await startEventAsAdmin(app);

    // wv-02 is locked until wv-01 is solved
    const view = await app.inject({ method: 'GET', url: '/api/challenges/wv-02', headers: { cookie: p } });
    expect(view.statusCode).toBe(403);
    const sub = await submit(p, 'wv-02', FLAGS['wv-02']);
    expect(sub.statusCode).toBe(403);

    // unlock by solving wv-01
    await submit(p, 'wv-01', FLAGS['wv-01']);
    const view2 = await app.inject({ method: 'GET', url: '/api/challenges/wv-02', headers: { cookie: p } });
    expect(view2.statusCode).toBe(200);
    const sub2 = await submit(p, 'wv-02', FLAGS['wv-02']);
    expect(sub2.statusCode).toBe(200);
  });

  it('is team-wide: any member solves; points awarded once; teammate cannot re-earn', async () => {
    const owner = await registerPlayer(app, 'Avinash', 'tw-o@x.com');
    const code = await createTeam(app, owner, 'Team Doom');
    const rahul = await registerPlayer(app, 'Rahul', 'tw-r@x.com');
    await joinTeam(rahul, code);
    await startEventAsAdmin(app);

    // Rahul solves wv-01
    const solve = await submit(rahul, 'wv-01', FLAGS['wv-01']);
    expect(solve.statusCode).toBe(200);

    // Avinash sees it as solved
    const list = await app.inject({ method: 'GET', url: '/api/challenges', headers: { cookie: owner } });
    const wv01 = JSON.parse(list.body).challenges.find((c: any) => c.id === 'wv-01');
    expect(wv01.solved).toBe(true);

    // Avinash cannot earn the same points again
    const again = await submit(owner, 'wv-01', FLAGS['wv-01']);
    expect(again.statusCode).toBe(409); // ALREADY_SOLVED

    const solves = await prisma.solve.count({ where: { challengeId: 'wv-01' } });
    expect(solves).toBe(1);
  });

  it('does not double-award under simultaneous correct submissions', async () => {
    const owner = await registerPlayer(app, 'A', 'race-o@x.com');
    const code = await createTeam(app, owner, 'Race');
    const mate = await registerPlayer(app, 'B', 'race-b@x.com');
    await joinTeam(mate, code);
    await startEventAsAdmin(app);

    const [r1, r2] = await Promise.all([
      submit(owner, 'wv-01', FLAGS['wv-01']),
      submit(mate, 'wv-01', FLAGS['wv-01']),
    ]);
    const statuses = [r1.statusCode, r2.statusCode].sort();
    // Exactly one 200 (correct) and one 409 (already solved)
    expect(statuses).toEqual([200, 409]);

    const solves = await prisma.solve.count({ where: { challengeId: 'wv-01' } });
    expect(solves).toBe(1);
  });

  it('records submissions in the audit log', async () => {
    const p = await registerPlayer(app, 'P', 'audit@x.com');
    await createTeam(app, p, 'Audit');
    await startEventAsAdmin(app);
    const r1 = await submit(p, 'wv-01', 'DOOM{nope}');
    const r2 = await submit(p, 'wv-01', FLAGS['wv-01']);
    expect(r1.statusCode, `incorrect submit: ${r1.body}`).toBe(200);
    expect(r2.statusCode, `correct submit: ${r2.body}`).toBe(200);
    const subs = await prisma.submission.count();
    expect(subs).toBeGreaterThanOrEqual(2);
  });
});
