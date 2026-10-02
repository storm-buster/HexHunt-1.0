import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); await startEventAsAdmin(app); });

async function joinTeam(cookie: string, inviteCode: string) {
  return app.inject({ method: 'POST', url: '/api/teams/join', headers: { cookie }, payload: { inviteCode } });
}

describe('teams', () => {
  it('creates a team and returns an invite code', async () => {
    const c = await registerPlayer(app, 'Owner', 'owner@x.com');
    const res = await app.inject({ method: 'POST', url: '/api/teams', headers: { cookie: c }, payload: { name: 'Team Doom' } });
    expect(res.statusCode).toBe(201);
    const team = JSON.parse(res.body).team;
    expect(team.inviteCode).toBeTruthy();
    expect(team.memberCount).toBe(1);
  });

  it('lets other players join with the invite code', async () => {
    const owner = await registerPlayer(app, 'Owner', 'o2@x.com');
    const code = await createTeam(app, owner, 'Team Alpha');
    const m2 = await registerPlayer(app, 'Rahul', 'rahul@x.com');
    const res = await joinTeam(m2, code);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).team.memberCount).toBe(2);
  });

  it('enforces maximum of 3 members (server-side)', async () => {
    const owner = await registerPlayer(app, 'Owner', 'o3@x.com');
    const code = await createTeam(app, owner, 'Team Max');
    const m2 = await registerPlayer(app, 'B', 'b@x.com');
    const m3 = await registerPlayer(app, 'C', 'c@x.com');
    const m4 = await registerPlayer(app, 'D', 'd@x.com');
    expect((await joinTeam(m2, code)).statusCode).toBe(200);
    expect((await joinTeam(m3, code)).statusCode).toBe(200);
    const full = await joinTeam(m4, code);
    expect(full.statusCode).toBe(409); // team full
  });

  it('prevents belonging to multiple teams', async () => {
    const owner = await registerPlayer(app, 'Owner', 'o4@x.com');
    const codeA = await createTeam(app, owner, 'Team A2');
    const p = await registerPlayer(app, 'P', 'p@x.com');
    const codeB = await createTeam(app, p, 'Team B2'); // p now owns a team
    const res = await joinTeam(p, codeA); // p tries to join another
    expect(res.statusCode).toBe(409);
    expect(codeB).toBeTruthy();
  });

  it('prevents duplicate join and duplicate team name', async () => {
    const owner = await registerPlayer(app, 'Owner', 'o5@x.com');
    const code = await createTeam(app, owner, 'Team Dup');
    // owner already in the team -> joining again is a conflict
    const again = await joinTeam(owner, code);
    expect(again.statusCode).toBe(409);
    // duplicate team name
    const other = await registerPlayer(app, 'X', 'x2@x.com');
    const dupName = await app.inject({ method: 'POST', url: '/api/teams', headers: { cookie: other }, payload: { name: 'Team Dup' } });
    expect(dupName.statusCode).toBe(409);
  });

  it('rejects invalid invite codes', async () => {
    const p = await registerPlayer(app, 'P', 'p6@x.com');
    const res = await joinTeam(p, 'BADCODE1');
    expect(res.statusCode).toBe(404);
  });
});
