import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, resetState, registerPlayer, createTeam, loginAdmin, startEventAsAdmin, currentSession, prisma } from './helpers.js';
import { teamIdForCookie } from './instance-helpers.js';

const WV01_FLAG = 'DOOM{a3f19c2b}';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

// Open wv-01 (creates the instance) and return this team's artifact URL path.
async function artifactPathFor(cookie: string): Promise<string> {
  await app.inject({ method: 'GET', url: '/api/challenges/wv-01', headers: { cookie } });
  const session = (await currentSession())!;
  const teamId = await teamIdForCookie(app, cookie);
  const inst = await prisma.challengeInstance.findUnique({
    where: { sessionId_teamId_challengeId: { sessionId: session.id, teamId, challengeId: 'wv-01' } },
  });
  const artifactId = (inst!.publicState as any).artifact.id as string;
  return `/artifacts/wv-01/${artifactId}`;
}

describe('artifact authorization + per-team isolation', () => {
  it('rejects an unauthenticated request (401)', async () => {
    await startEventAsAdmin(app);
    const res = await app.inject({ method: 'GET', url: '/artifacts/wv-01/anything' });
    expect(res.statusCode).toBe(401);
  });

  it('serves the team its OWN per-instance artifact (200, no flag verbatim)', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Art', 'art@x.com');
    await createTeam(app, cookie, 'Art Team');
    const path = await artifactPathFor(cookie);
    const res = await app.inject({ method: 'GET', url: path, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('NODE GW-02');
    expect(res.body).not.toContain(WV01_FLAG);
  });

  it('rejects an authenticated player with NO team (403)', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'NoTeam', 'noteam-art@x.com');
    const res = await app.inject({ method: 'GET', url: '/artifacts/wv-01/anything', headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('Team B cannot access Team A\'s artifact id (cross-team isolation → 404)', async () => {
    await startEventAsAdmin(app);
    const a = await registerPlayer(app, 'A', 'iso-a@x.com');
    await createTeam(app, a, 'ISO A');
    const b = await registerPlayer(app, 'B', 'iso-b@x.com');
    await createTeam(app, b, 'ISO B');

    const aPath = await artifactPathFor(a);       // Team A's artifactId
    await artifactPathFor(b);                      // ensure B has its own instance

    // A can fetch its own; B requesting A's artifactId gets nothing.
    expect((await app.inject({ method: 'GET', url: aPath, headers: { cookie: a } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: aPath, headers: { cookie: b } })).statusCode).toBe(404);
  });

  it('returns 404 for an enumerated/guessed artifact id (even when authorized)', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Enum', 'enum@x.com');
    await createTeam(app, cookie, 'Enum Team');
    await artifactPathFor(cookie);
    const res = await app.inject({ method: 'GET', url: '/artifacts/wv-01/deadbeefdeadbeef', headers: { cookie } });
    expect(res.statusCode).toBe(404);
  });

  it('denies access once the session is stopped (no live session → 409)', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Gone', 'gone-art@x.com');
    await createTeam(app, cookie, 'Gone Team');
    const path = await artifactPathFor(cookie);
    expect((await app.inject({ method: 'GET', url: path, headers: { cookie } })).statusCode).toBe(200);

    const admin = await loginAdmin(app);
    await app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie: admin } });
    expect((await app.inject({ method: 'GET', url: path, headers: { cookie } })).statusCode).toBe(409);
  });
});
