import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import JSZip from 'jszip';
import {
  makeApp, resetState, registerPlayer, createTeam, loginAdmin,
  startEventAsAdmin, stopEventAsAdmin, currentSession, prisma,
} from './helpers.js';

const WV01 = 'DOOM{a3f19c2b}';
const HIDDEN = 'DOOM{d00d5f3a}';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

function submit(cookie: string, challengeId: string, flag: string) {
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag } });
}
function leaderboard(cookie: string) {
  return app.inject({ method: 'GET', url: '/api/leaderboard', headers: { cookie } });
}
async function adminGet(url: string, cookie: string) {
  return app.inject({ method: 'GET', url, headers: { cookie } });
}

describe('session history + per-session scoping', () => {
  it('history lists every session with incrementing numbers and status', async () => {
    const admin = await loginAdmin(app);
    await startEventAsAdmin(app); await stopEventAsAdmin(app); // #1 COMPLETED
    await startEventAsAdmin(app); await stopEventAsAdmin(app); // #2 COMPLETED
    await startEventAsAdmin(app);                              // #3 LIVE

    const res = await adminGet('/api/admin/sessions', admin);
    expect(res.statusCode).toBe(200);
    const sessions = JSON.parse(res.body).sessions;
    expect(sessions.length).toBe(3);
    expect(sessions.map((s: any) => s.sessionNumber)).toEqual([3, 2, 1]);
    expect(sessions.find((s: any) => s.sessionNumber === 3).status).toBe('LIVE');
    expect(sessions.find((s: any) => s.sessionNumber === 1).status).toBe('COMPLETED');
  });

  it('a team can re-solve the same challenge in a later session; score resets per session', async () => {
    const p = await registerPlayer(app, 'Re', 'resolve@x.com');
    const teamRes = await app.inject({ method: 'POST', url: '/api/teams', headers: { cookie: p }, payload: { name: 'Resolvers' } });
    const teamId = JSON.parse(teamRes.body).team.id;

    // Session 1: solve wv-01.
    await startEventAsAdmin(app);
    expect((await submit(p, 'wv-01', WV01)).statusCode).toBe(200);
    const s1Score = JSON.parse((await leaderboard(p)).body).leaderboard.find((r: any) => r.teamId === teamId).score;
    expect(s1Score).toBeGreaterThan(0);
    await stopEventAsAdmin(app);

    // Session 2: fresh — not solved, score 0, re-solvable.
    await startEventAsAdmin(app);
    const chRes = await app.inject({ method: 'GET', url: '/api/challenges', headers: { cookie: p } });
    const wv01 = JSON.parse(chRes.body).challenges.find((c: any) => c.id === 'wv-01');
    expect(wv01.solved).toBe(false);
    const freshScore = JSON.parse((await leaderboard(p)).body).leaderboard.find((r: any) => r.teamId === teamId).score;
    expect(freshScore).toBe(0);
    expect((await submit(p, 'wv-01', WV01)).statusCode).toBe(200); // re-solve allowed

    // Two solves total across sessions, one per session.
    expect(await prisma.solve.count({ where: { teamId } })).toBe(2);
  });

  it('historical session leaderboard is immutable to later-session activity', async () => {
    const admin = await loginAdmin(app);
    const p = await registerPlayer(app, 'H', 'hist@x.com');
    await createTeam(app, p, 'Historians');

    await startEventAsAdmin(app);
    await submit(p, 'wv-01', WV01);
    const s1 = (await currentSession())!;
    await stopEventAsAdmin(app);

    const detail1 = JSON.parse((await adminGet(`/api/admin/sessions/${s1.id}`, admin)).body).session;
    const s1Score = detail1.leaderboard[0].score;

    // Session 2 activity must not change session 1's stored leaderboard.
    await startEventAsAdmin(app);
    await submit(p, 'wv-02', 'DOOM{7d4e0a91}');
    const detail1Again = JSON.parse((await adminGet(`/api/admin/sessions/${s1.id}`, admin)).body).session;
    expect(detail1Again.leaderboard[0].score).toBe(s1Score);
  });
});

describe('session export (ZIP)', () => {
  it('players get 403 on session list, detail, and export', async () => {
    const admin = await loginAdmin(app);
    await startEventAsAdmin(app);
    const s = (await currentSession())!;
    await stopEventAsAdmin(app);

    const player = await registerPlayer(app, 'Pl', 'exp-pl@x.com');
    expect((await adminGet('/api/admin/sessions', player)).statusCode).toBe(403);
    expect((await adminGet(`/api/admin/sessions/${s.id}`, player)).statusCode).toBe(403);
    expect((await adminGet(`/api/admin/sessions/${s.id}/export`, player)).statusCode).toBe(403);
    // admin can
    expect((await adminGet(`/api/admin/sessions/${s.id}/export`, admin)).statusCode).toBe(200);
  });

  it('export returns a zip with the expected files and correct filename, containing no secrets', async () => {
    const admin = await loginAdmin(app);
    const p = await registerPlayer(app, 'Ex', 'exp@x.com');
    await createTeam(app, p, 'Exporters');
    await startEventAsAdmin(app);
    await submit(p, 'wv-01', WV01);
    await submit(p, 'wv-01', 'DOOM{totally-wrong}'); // an incorrect submission in the log
    const s = (await currentSession())!;
    await stopEventAsAdmin(app);

    const res = await adminGet(`/api/admin/sessions/${s.id}/export`, admin);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain(`hexhunt-session-${String(s.sessionNumber).padStart(3, '0')}.zip`);

    const zip = await JSZip.loadAsync(res.rawPayload);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([
      'hidden-results.csv', 'leaderboard.csv', 'session-summary.json',
      'solves.csv', 'submissions.csv', 'teams.csv',
    ]);

    // Combine all text and scan for any secret material.
    let blob = '';
    for (const name of names) blob += await zip.files[name].async('string');
    expect(blob).not.toContain(WV01);
    expect(blob).not.toContain(HIDDEN);
    expect(blob.toLowerCase()).not.toContain('flaghash');
    expect(blob.toLowerCase()).not.toContain('passwordhash');

    // Summary sanity.
    const summary = JSON.parse(await zip.files['session-summary.json'].async('string'));
    expect(summary.sessionNumber).toBe(s.sessionNumber);
    expect(summary.totalSolves).toBe(1);
    expect(summary.totalSubmissions).toBe(2);
    // Solves CSV has the solve row (challenge id present, flag absent).
    const solvesCsv = await zip.files['solves.csv'].async('string');
    expect(solvesCsv).toContain('wv-01');
  });

  it('export is generated from the stored session id (historical, not live state)', async () => {
    const admin = await loginAdmin(app);
    const p = await registerPlayer(app, 'Hs', 'exp-hist@x.com');
    await createTeam(app, p, 'ExpHist');

    await startEventAsAdmin(app);
    await submit(p, 'wv-01', WV01);
    const s1 = (await currentSession())!;
    await stopEventAsAdmin(app);

    // New live session with DIFFERENT activity.
    await startEventAsAdmin(app);
    await submit(p, 'wv-01', WV01);
    await submit(p, 'wv-02', 'DOOM{7d4e0a91}');

    const res = await adminGet(`/api/admin/sessions/${s1.id}/export`, admin);
    const zip = await JSZip.loadAsync(res.rawPayload);
    const summary = JSON.parse(await zip.files['session-summary.json'].async('string'));
    // Session 1 had exactly 1 solve regardless of session 2 activity.
    expect(summary.totalSolves).toBe(1);
  });

  it('export/detail of a non-existent session is 404', async () => {
    const admin = await loginAdmin(app);
    expect((await adminGet('/api/admin/sessions/does-not-exist', admin)).statusCode).toBe(404);
    expect((await adminGet('/api/admin/sessions/does-not-exist/export', admin)).statusCode).toBe(404);
  });
});

describe('one-LIVE-per-event guard (DB level)', () => {
  it('rejects a second LIVE session for the same event', async () => {
    await startEventAsAdmin(app);
    const live = (await currentSession())!;
    await expect(
      prisma.eventSession.create({
        data: { eventId: live.eventId, sessionNumber: 999, status: 'LIVE', startedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
});
