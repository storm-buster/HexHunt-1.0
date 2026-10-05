import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, currentSession, prisma } from './helpers.js';
import { refreshHiddenActivation } from '../src/events/event.service.js';
import { solveChallenge, instanceAnswer, teamIdForCookie } from './instance-helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); await startEventAsAdmin(app); });

// Full challenge chain in sequential-unlock order (12 scored challenges).
const CHALLENGE_ORDER = [
  'wv-01', 'wv-02', 'wv-03',
  'os-01', 'os-02', 'os-03',
  'dn-01', 'dn-02', 'dn-03', 'dn-04', 'dn-05', 'dn-06',
];

// Portal answers are NON-instanced UX detours (static, server-validated).
const PORTAL_ANSWERS: Record<string, string> = {
  'wv-01': '0D2532', 'wv-02': '20', 'wv-03': 'MTg6NDI=',
  'os-01': 'w1dow_gh0st', 'os-02': 'AVENGER DOWN', 'os-03': 'p4per_tr4il',
  'dn-01': 'p1x3l', 'dn-02': '4c9f2081', 'dn-03': 'HIDDEN_SIGNAL',
  'dn-04': '42', 'dn-05': '4ndr01d_c0r3', 'dn-06': 'BOFF',
};

function portalCheck(cookie: string, id: string, answer: string) {
  return app.inject({ method: 'POST', url: `/api/challenges/${id}/portal-check`, headers: { cookie }, payload: { answer } });
}

describe('ANSWER KEY — every challenge is solvable via its per-team instance', () => {
  it('all 12 challenges solve (in unlock order) by deriving the per-team answer, and award points', async () => {
    const cookie = await registerPlayer(app, 'KeyChecker', 'keycheck@x.com');
    await createTeam(app, cookie, 'Key Checkers');

    for (const id of CHALLENGE_ORDER) {
      const res = await solveChallenge(app, cookie, id);
      expect(res.statusCode, `${id} HTTP`).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.result, `${id} verdict`).toBe('correct');
      expect(body.awardedPoints, `${id} points`).toBeGreaterThan(0);
    }

    const progress = JSON.parse((await app.inject({ method: 'GET', url: '/api/progress', headers: { cookie } })).body).progress;
    expect(progress.solvedCount).toBe(12);
    expect(progress.stones.length).toBe(6);

    const fb = JSON.parse((await app.inject({ method: 'GET', url: '/api/final-boss', headers: { cookie } })).body).finalBoss;
    expect(fb.unlocked).toBe(true);
    expect(fb.reveal).toBe('DOOM{f9c3a71e}');
  });

  it('a wrong flag is rejected as incorrect (control)', async () => {
    const cookie = await registerPlayer(app, 'Ctrl', 'ctrl@x.com');
    await createTeam(app, cookie, 'Control');
    await app.inject({ method: 'GET', url: '/api/challenges/wv-01', headers: { cookie } });
    const res = await app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId: 'wv-01', flag: 'DOOM{not_the_flag}' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('incorrect');
  });

  it('all 12 portal puzzle answers validate; a wrong one does not', async () => {
    const cookie = await registerPlayer(app, 'Portals', 'portals@x.com');
    await createTeam(app, cookie, 'Portalers');

    for (const [id, answer] of Object.entries(PORTAL_ANSWERS)) {
      const res = await portalCheck(cookie, id, answer);
      expect(res.statusCode, `${id} portal HTTP`).toBe(200);
      expect(JSON.parse(res.body).correct, `${id} portal answer "${answer}"`).toBe(true);
    }
    const wrong = await portalCheck(cookie, 'wv-01', 'nope');
    expect(JSON.parse(wrong.body).correct).toBe(false);
  });

  it('flags are case-insensitive and whitespace-trimmed (against the per-team answer)', async () => {
    const cookie = await registerPlayer(app, 'CaseTest', 'case@x.com');
    await createTeam(app, cookie, 'Case Team');
    await app.inject({ method: 'GET', url: '/api/challenges/wv-01', headers: { cookie } });
    const session = (await currentSession())!;
    const teamId = await teamIdForCookie(app, cookie);
    const flag = await instanceAnswer(session.id, teamId, 'wv-01');
    const res = await app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId: 'wv-01', flag: `  ${flag.toLowerCase()}  ` } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('correct');
  });

  it('hidden-level per-team beacon validates for the selected member (+500)', async () => {
    const cookie = await registerPlayer(app, 'Hidden', 'hiddenkey@x.com');
    await createTeam(app, cookie, 'Hidden Team');
    const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    const session = await prisma.eventSession.findFirst({ where: { eventId: event!.id, status: 'LIVE' }, orderBy: { sessionNumber: 'desc' } });
    await prisma.eventSession.update({ where: { id: session!.id }, data: { hiddenActivationAt: new Date(Date.now() - 1000), hiddenActivated: false } });
    await refreshHiddenActivation();

    const state = JSON.parse((await app.inject({ method: 'GET', url: '/api/hidden-level', headers: { cookie } })).body).hidden;
    expect(state.available).toBe(true);

    const teamId = await teamIdForCookie(app, cookie);
    const answer = await instanceAnswer(session!.id, teamId, 'hidden-01');
    const res = await app.inject({ method: 'POST', url: '/api/hidden-level/submit', headers: { cookie }, payload: { answer } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.result).toBe('correct');
    expect(body.scoreDelta).toBe(500);
  });
});
