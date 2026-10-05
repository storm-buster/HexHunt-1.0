import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, loginAdmin,
  startEventAsAdmin, stopEventAsAdmin, currentSession, prisma,
} from './helpers.js';
import { instanceAnswer, teamIdForCookie, solveChallenge } from './instance-helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); await startEventAsAdmin(app); });

function openChallenge(cookie: string, id: string) {
  return app.inject({ method: 'GET', url: `/api/challenges/${id}`, headers: { cookie } });
}
async function instanceRow(cookie: string, challengeId: string) {
  const session = (await currentSession())!;
  const teamId = await teamIdForCookie(app, cookie);
  return prisma.challengeInstance.findUnique({
    where: { sessionId_teamId_challengeId: { sessionId: session.id, teamId, challengeId } },
  });
}
async function makeTeam(name: string, email: string) {
  const cookie = await registerPlayer(app, name, email);
  await createTeam(app, cookie, `${name} Team`);
  return cookie;
}

describe('ChallengeInstance — generation & isolation', () => {
  it('#1/#2 each team gets its own distinct instance (different answer material)', async () => {
    const a = await makeTeam('A', 'inst-a@x.com');
    const b = await makeTeam('B', 'inst-b@x.com');
    await openChallenge(a, 'wv-01');
    await openChallenge(b, 'wv-01');

    const ia = await instanceRow(a, 'wv-01');
    const ib = await instanceRow(b, 'wv-01');
    expect(ia).toBeTruthy(); expect(ib).toBeTruthy();
    expect(ia!.id).not.toBe(ib!.id);
    expect(ia!.answerHash).not.toBe(ib!.answerHash);
    // Different correct artifact ref per team.
    const refA = (ia!.publicState as any).artifact.records.find((r: any) => r.label === 'NODE GW-02').fields['Override-Ref'];
    const refB = (ib!.publicState as any).artifact.records.find((r: any) => r.label === 'NODE GW-02').fields['Override-Ref'];
    expect(refA).not.toBe(refB);
  });

  it('#3/#4 same team reuses exactly one instance across refreshes', async () => {
    const a = await makeTeam('R', 'inst-r@x.com');
    await openChallenge(a, 'wv-01');
    const first = await instanceRow(a, 'wv-01');
    await openChallenge(a, 'wv-01');
    await openChallenge(a, 'wv-01');
    const again = await instanceRow(a, 'wv-01');
    expect(again!.id).toBe(first!.id);
    const teamId = await teamIdForCookie(app, a);
    const count = await prisma.challengeInstance.count({ where: { teamId, challengeId: 'wv-01' } });
    expect(count).toBe(1);
  });

  it('#6/#8 player receives server publicState clue; it contains no answer/hash/seed', async () => {
    const a = await makeTeam('C', 'inst-c@x.com');
    const res = await openChallenge(a, 'wv-01');
    const ch = JSON.parse(res.body).challenge;
    expect(ch.clueContent).toBeTruthy();
    expect(ch.clueContent.body).toContain('GATEWAY DEBUG'); // per-instance clue
    const serialized = JSON.stringify(ch);
    expect(serialized).not.toMatch(/answerHash/i);
    expect(serialized).not.toMatch(/"seed"/i);
    // The correct answer is NOT present verbatim in what the player receives.
    const inst = await instanceRow(a, 'wv-01');
    const correctRef = (inst!.publicState as any).artifact.records.find((r: any) => r.label === 'NODE GW-02').fields['Override-Ref'];
    expect(serialized).not.toContain(correctRef); // clue only hex-encodes the artifact URL, not the ref
  });

  it('#9/#10 Team A answer solves A but NOT B', async () => {
    const a = await makeTeam('SA', 'solve-a@x.com');
    const b = await makeTeam('SB', 'solve-b@x.com');
    await openChallenge(a, 'wv-01');
    await openChallenge(b, 'wv-01');
    const session = (await currentSession())!;
    const aAnswer = await instanceAnswer(session.id, await teamIdForCookie(app, a), 'wv-01');

    // A's answer fails for B…
    const bWithA = await app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie: b }, payload: { challengeId: 'wv-01', flag: aAnswer } });
    expect(JSON.parse(bWithA.body).result).toBe('incorrect');
    // …but solves A.
    const aOwn = await app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie: a }, payload: { challengeId: 'wv-01', flag: aAnswer } });
    expect(JSON.parse(aOwn.body).result).toBe('correct');
  });

  it('#11/#12/#13 client-supplied team/session/instance ids cannot bypass scope', async () => {
    const a = await makeTeam('XA', 'x-a@x.com');
    const b = await makeTeam('XB', 'x-b@x.com');
    await openChallenge(a, 'wv-01');
    await openChallenge(b, 'wv-01');
    const session = (await currentSession())!;
    const aTeam = await teamIdForCookie(app, a);
    const aAnswer = await instanceAnswer(session.id, aTeam, 'wv-01');
    const aInst = await instanceRow(a, 'wv-01');

    // B submits A's answer while trying to spoof team/session/instance ids.
    const spoof = await app.inject({
      method: 'POST', url: '/api/submissions', headers: { cookie: b },
      payload: { challengeId: 'wv-01', flag: aAnswer, teamId: aTeam, sessionId: session.id, instanceId: aInst!.id } as any,
    });
    expect(JSON.parse(spoof.body).result).toBe('incorrect'); // scope resolved from auth, not body
  });

  it('#5/#33/#34/#35 STOP wipes instances; a new session generates fresh ones', async () => {
    const a = await makeTeam('S1', 'sess-a@x.com');
    await openChallenge(a, 'wv-01');
    const s1Inst = await instanceRow(a, 'wv-01');
    expect(await prisma.challengeInstance.count()).toBeGreaterThanOrEqual(1);

    await stopEventAsAdmin(app);
    expect(await prisma.challengeInstance.count()).toBe(0); // wiped with the session

    // New session → fresh team + fresh instance (different id).
    const admin = await loginAdmin(app);
    await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } });
    const a2 = await makeTeam('S2', 'sess-a2@x.com');
    await openChallenge(a2, 'wv-01');
    const s2Inst = await instanceRow(a2, 'wv-01');
    expect(s2Inst).toBeTruthy();
    expect(s2Inst!.id).not.toBe(s1Inst!.id);
  });

  it('full darknet chain solves via per-team tokens (#18-23) and webverse/osint (#24-29)', async () => {
    const a = await makeTeam('Chain', 'chain@x.com');
    for (const id of ['wv-01', 'wv-02', 'wv-03', 'os-01', 'os-02', 'os-03', 'dn-01', 'dn-02', 'dn-03', 'dn-04', 'dn-05', 'dn-06']) {
      const res = await solveChallenge(app, a, id);
      expect(res.statusCode, `${id}`).toBe(200);
      expect(JSON.parse(res.body).result, `${id}`).toBe('correct');
    }
  });
});
