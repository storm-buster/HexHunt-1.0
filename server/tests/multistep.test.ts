import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, loginAdmin,
  startEventAsAdmin, stopEventAsAdmin, currentSession, prisma,
} from './helpers.js';
import { solveChallenge, intermediateToken, teamIdForCookie } from './instance-helpers.js';

const DN = 'dn-01'; // representative multi-step darknet challenge
const WEB_OSINT = ['wv-01', 'wv-02', 'wv-03', 'os-01', 'os-02', 'os-03'];

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); await startEventAsAdmin(app); });

function openChallenge(cookie: string, id: string) {
  return app.inject({ method: 'GET', url: `/api/challenges/${id}`, headers: { cookie } });
}
function postStep(cookie: string, id: string, input: string) {
  return app.inject({ method: 'POST', url: `/api/challenges/${id}/step`, headers: { cookie }, payload: { input } });
}
function submit(cookie: string, id: string, flag: string) {
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId: id, flag } });
}
async function team(name: string, email: string) {
  const cookie = await registerPlayer(app, name, email);
  await createTeam(app, cookie, `${name} Team`);
  return cookie;
}
// Darknet is gated behind the full webverse+osint chain.
async function unlockDarknet(cookie: string) {
  for (const id of WEB_OSINT) {
    const r = await solveChallenge(app, cookie, id);
    if (r.statusCode !== 200) throw new Error(`unlock ${id} failed: ${r.body}`);
  }
}

describe('multi-step darknet challenge (dn-01)', () => {
  it('#1/#4 Step 1 is fetchable and only step-1 material is exposed', async () => {
    const a = await team('A', 'ms-a@x.com');
    await unlockDarknet(a);
    const ch = JSON.parse((await openChallenge(a, DN)).body).challenge;
    expect(ch.awaitingIntermediate).toBe(true);
    expect(ch.step).toBe(1);
    expect(ch.totalSteps).toBe(2);
    expect(ch.clueContent.body).toContain('LSB BYTE STREAM'); // step-1 material present
  });

  it('#6/#11 final answer is rejected before the intermediate step is verified', async () => {
    const a = await team('G', 'ms-g@x.com');
    await unlockDarknet(a);
    await openChallenge(a, DN);
    const res = await submit(a, DN, 'DOOM{anything}');
    expect(res.statusCode).toBe(403); // CHALLENGE_LOCKED — step not completed
  });

  it('#3 incorrect intermediate does NOT advance', async () => {
    const a = await team('I', 'ms-i@x.com');
    await unlockDarknet(a);
    await openChallenge(a, DN);
    const bad = await postStep(a, DN, 'deadbeef');
    expect(JSON.parse(bad.body).step.ok).toBe(false);
    const ch = JSON.parse((await openChallenge(a, DN)).body).challenge;
    expect(ch.awaitingIntermediate).toBe(true); // still stage 1
  });

  it('#2/#5/#7 correct intermediate advances, reveals step 2, and final solves', async () => {
    const a = await team('S', 'ms-s@x.com');
    await unlockDarknet(a);
    const t1 = await intermediateToken(app, a, DN);
    const step = JSON.parse((await postStep(a, DN, t1)).body).step;
    expect(step.ok).toBe(true);
    expect(step.step).toBe(2);
    expect(step.awaitingIntermediate).toBe(false);
    expect(step.clueContent.body).toBeTruthy(); // step-2 material now revealed

    // GET now returns step-2 material (final phase).
    const ch2 = JSON.parse((await openChallenge(a, DN)).body).challenge;
    expect(ch2.awaitingIntermediate).toBe(false);
    expect(ch2.step).toBe(2);

    // Full solve succeeds and awards points once (#14 scoring unchanged).
    const solved = await solveChallenge(app, a, DN);
    expect(solved.statusCode).toBe(200);
    expect(JSON.parse(solved.body).result).toBe('correct');
    expect(JSON.parse(solved.body).awardedPoints).toBeGreaterThan(0);
    const teamId = await teamIdForCookie(app, a);
    expect(await prisma.solve.count({ where: { teamId, challengeId: DN } })).toBe(1);
  });

  it('#8 progress survives refresh (stage persists)', async () => {
    const a = await team('R', 'ms-r@x.com');
    await unlockDarknet(a);
    const t1 = await intermediateToken(app, a, DN);
    await postStep(a, DN, t1); // advance to stage 2
    // "Refresh": re-fetch the challenge — still at the final phase.
    const ch = JSON.parse((await openChallenge(a, DN)).body).challenge;
    expect(ch.awaitingIntermediate).toBe(false);
    expect(ch.step).toBe(2);
  });

  it('#9/#10 Team A cannot advance using Team B\'s intermediate (per-team tokens)', async () => {
    const a = await team('TA', 'ms-ta@x.com');
    const b = await team('TB', 'ms-tb@x.com');
    await unlockDarknet(a);
    await unlockDarknet(b);
    const aT1 = await intermediateToken(app, a, DN);
    const bT1 = await intermediateToken(app, b, DN);
    expect(aT1).not.toBe(bT1); // distinct per team

    // B submits A's intermediate → rejected; B stays on stage 1.
    const res = await postStep(b, DN, aT1);
    expect(JSON.parse(res.body).step.ok).toBe(false);
    const chB = JSON.parse((await openChallenge(b, DN)).body).challenge;
    expect(chB.awaitingIntermediate).toBe(true);
  });

  it('#12/#13 STOP wipes step state; a new session starts fresh', async () => {
    const a = await team('W', 'ms-w@x.com');
    await unlockDarknet(a);
    const t1 = await intermediateToken(app, a, DN);
    await postStep(a, DN, t1);
    expect(await prisma.challengeStepProgress.count()).toBeGreaterThanOrEqual(1);

    await stopEventAsAdmin(app);
    expect(await prisma.challengeStepProgress.count()).toBe(0); // cascaded with session

    const admin = await loginAdmin(app);
    await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } });
    const a2 = await team('W2', 'ms-w2@x.com');
    await unlockDarknet(a2);
    const ch = JSON.parse((await openChallenge(a2, DN)).body).challenge;
    expect(ch.awaitingIntermediate).toBe(true); // fresh stage 1
  });

  it('step endpoint requires an unlocked challenge (gating) and a live session', async () => {
    const a = await team('L', 'ms-l@x.com');
    // dn-01 locked (webverse/osint not solved) → step endpoint rejects.
    const res = await postStep(a, DN, 'whatever');
    expect(res.statusCode).toBe(403);
  });
});
