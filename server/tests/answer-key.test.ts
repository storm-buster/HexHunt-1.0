import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, prisma } from './helpers.js';
import { refreshHiddenActivation } from '../src/events/event.service.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); await startEventAsAdmin(app); });

// Documented answer key (ORGANIZER_ANSWER_KEY.md) — verified against the live
// argon2 hashes in the seeded DB, in the correct sequential-unlock order.
const FLAG_ORDER: [string, string][] = [
  ['wv-01', 'DOOM{a3f19c2b}'],
  ['wv-02', 'DOOM{7d4e0a91}'],
  ['wv-03', 'DOOM{2f8b6c05}'],
  ['os-01', 'DOOM{c1e94a7f}'],
  ['os-02', 'DOOM{5b2d8e63}'],
  ['os-03', 'DOOM{9a0f4c18}'],
  ['dn-01', 'DOOM{e63b1d7a}'],
  ['dn-02', 'DOOM{4c9f2081}'],
  ['dn-03', 'DOOM{b7e5304c}'],
  ['dn-04', 'DOOM{1f8a6d29}'],
  ['dn-05', 'DOOM{3d0c7b94}'],
  ['dn-06', 'DOOM{8e2145af}'],
];

const PORTAL_ANSWERS: Record<string, string> = {
  'wv-01': '0D2532', 'wv-02': '20', 'wv-03': 'MTg6NDI=',
  'os-01': 'w1dow_gh0st', 'os-02': 'AVENGER DOWN', 'os-03': 'p4per_tr4il',
  'dn-01': 'p1x3l', 'dn-02': '4c9f2081', 'dn-03': 'HIDDEN_SIGNAL',
  'dn-04': '42', 'dn-05': '4ndr01d_c0r3', 'dn-06': 'BOFF',
};

function submit(cookie: string, challengeId: string, flag: string) {
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag } });
}
function portalCheck(cookie: string, id: string, answer: string) {
  return app.inject({ method: 'POST', url: `/api/challenges/${id}/portal-check`, headers: { cookie }, payload: { answer } });
}

describe('ANSWER KEY — every documented answer validates against the seeded backend', () => {
  it('all 12 challenge flags are CORRECT (in unlock order) and award points', async () => {
    const cookie = await registerPlayer(app, 'KeyChecker', 'keycheck@x.com');
    await createTeam(app, cookie, 'Key Checkers');
    await startEventAsAdmin(app);

    for (const [id, flag] of FLAG_ORDER) {
      const res = await submit(cookie, id, flag);
      expect(res.statusCode, `${id} HTTP`).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.result, `${id} verdict for ${flag}`).toBe('correct');
      expect(body.awardedPoints, `${id} points`).toBeGreaterThan(0);
    }

    // 6 unique stones collected → final boss reveal is released.
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
    await startEventAsAdmin(app);
    const res = await submit(cookie, 'wv-01', 'DOOM{not_the_flag}');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('incorrect');
  });

  it('all 12 portal puzzle answers validate; a wrong one does not', async () => {
    const cookie = await registerPlayer(app, 'Portals', 'portals@x.com');
    await createTeam(app, cookie, 'Portalers');
    await startEventAsAdmin(app);

    for (const [id, answer] of Object.entries(PORTAL_ANSWERS)) {
      const res = await portalCheck(cookie, id, answer);
      expect(res.statusCode, `${id} portal HTTP`).toBe(200);
      expect(JSON.parse(res.body).correct, `${id} portal answer "${answer}"`).toBe(true);
    }
    // control: wrong portal answer
    const wrong = await portalCheck(cookie, 'wv-01', 'nope');
    expect(JSON.parse(wrong.body).correct).toBe(false);
  });

  it('flags are case-insensitive and whitespace-trimmed', async () => {
    const cookie = await registerPlayer(app, 'CaseTest', 'case@x.com');
    await createTeam(app, cookie, 'Case Team');
    await startEventAsAdmin(app);
    const res = await submit(cookie, 'wv-01', '  doom{A3F19C2B}  ');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('correct');
  });

  it('hidden-level answer DOOM{d00d5f3a} validates for the selected member (+500)', async () => {
    const cookie = await registerPlayer(app, 'Hidden', 'hiddenkey@x.com');
    await createTeam(app, cookie, 'Hidden Team');
    await startEventAsAdmin(app);
    // force T+30 boundary + run activation (single member → this user selected)
    const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    const session = await prisma.eventSession.findFirst({ where: { eventId: event!.id, status: 'LIVE' }, orderBy: { sessionNumber: 'desc' } });
    await prisma.eventSession.update({ where: { id: session!.id }, data: { hiddenActivationAt: new Date(Date.now() - 1000), hiddenActivated: false } });
    await refreshHiddenActivation();

    const state = JSON.parse((await app.inject({ method: 'GET', url: '/api/hidden-level', headers: { cookie } })).body).hidden;
    expect(state.available).toBe(true);

    const res = await app.inject({ method: 'POST', url: '/api/hidden-level/submit', headers: { cookie }, payload: { answer: 'DOOM{d00d5f3a}' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.result).toBe('correct');
    expect(body.scoreDelta).toBe(500);
  });
});
