import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, joinTeam, startEventAsAdmin,
  userIdByEmail, prisma,
} from './helpers.js';
import { refreshHiddenActivation } from '../src/events/event.service.js';

const HIDDEN_FLAG = 'DOOM{d00d5f3a}';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

interface Member { email: string; cookie: string; userId: string }

async function teamIdFor(cookie: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/api/team', headers: { cookie } });
  return JSON.parse(res.body).team.id as string;
}

// Build a team with `size` members; returns members + teamId.
async function buildTeam(prefix: string, size: number): Promise<{ members: Member[]; teamId: string }> {
  const members: Member[] = [];
  const ownerEmail = `${prefix}-0@x.com`;
  const ownerCookie = await registerPlayer(app, `${prefix}0`, ownerEmail);
  const code = await createTeam(app, ownerCookie, `Team ${prefix}`);
  members.push({ email: ownerEmail, cookie: ownerCookie, userId: await userIdByEmail(ownerEmail) });
  for (let i = 1; i < size; i++) {
    const email = `${prefix}-${i}@x.com`;
    const cookie = await registerPlayer(app, `${prefix}${i}`, email);
    await joinTeam(app, cookie, code);
    members.push({ email, cookie, userId: await userIdByEmail(email) });
  }
  return { members, teamId: await teamIdFor(ownerCookie) };
}

// Force the T+30 boundary to have passed and run activation deterministically.
async function activateHidden(): Promise<void> {
  const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
  await prisma.event.update({
    where: { id: event!.id },
    data: { hiddenActivationAt: new Date(Date.now() - 1000), hiddenActivated: false },
  });
  await refreshHiddenActivation(); // activates + assigns one member per team
}

function hiddenState(cookie: string) {
  return app.inject({ method: 'GET', url: '/api/hidden-level', headers: { cookie } });
}
function hiddenSubmit(cookie: string, answer: string) {
  return app.inject({ method: 'POST', url: '/api/hidden-level/submit', headers: { cookie }, payload: { answer } });
}
async function selectedUserId(teamId: string): Promise<string> {
  const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
  const a = await prisma.hiddenLevelAssignment.findUnique({
    where: { teamId_eventId: { teamId, eventId: event!.id } },
  });
  return a!.selectedUserId;
}

describe('hidden level — T+30 activation & per-team member selection', () => {
  it('is invisible to everyone before activation', async () => {
    const { members } = await buildTeam('pre', 3);
    await startEventAsAdmin(app);
    for (const m of members) {
      const s = JSON.parse((await hiddenState(m.cookie)).body).hidden;
      expect(s.activated).toBe(false);
      expect(s.available).toBe(false);
      expect(s.challenge).toBeNull();
    }
  });

  it('selects exactly ONE member per team, persisted, for multiple teams', async () => {
    const A = await buildTeam('AA', 3);
    const B = await buildTeam('BB', 3);
    await startEventAsAdmin(app);
    await activateHidden();

    const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    const aAssigns = await prisma.hiddenLevelAssignment.findMany({ where: { teamId: A.teamId } });
    const bAssigns = await prisma.hiddenLevelAssignment.findMany({ where: { teamId: B.teamId } });
    expect(aAssigns.length).toBe(1);
    expect(bAssigns.length).toBe(1);
    expect(A.members.map((m) => m.userId)).toContain(aAssigns[0].selectedUserId);
    expect(B.members.map((m) => m.userId)).toContain(bAssigns[0].selectedUserId);
    expect(aAssigns[0].eventId).toBe(event!.id);

    // Re-running activation must NOT re-roll the selection (idempotent).
    const before = aAssigns[0].selectedUserId;
    await refreshHiddenActivation();
    expect(await selectedUserId(A.teamId)).toBe(before);
  });

  it('only the selected member sees available=true; others see false', async () => {
    const { members, teamId } = await buildTeam('vis', 3);
    await startEventAsAdmin(app);
    await activateHidden();
    const sel = await selectedUserId(teamId);

    for (const m of members) {
      const s = JSON.parse((await hiddenState(m.cookie)).body).hidden;
      expect(s.activated).toBe(true);
      if (m.userId === sel) {
        expect(s.available).toBe(true);
        expect(s.challenge).not.toBeNull();
        expect(s.warning).toContain('+500');
        expect(s.warning).toContain('-400');
        expect(JSON.stringify(s)).not.toContain(HIDDEN_FLAG);
      } else {
        expect(s.available).toBe(false);
        expect(s.challenge).toBeNull();
      }
    }
  });

  it('non-selected member cannot submit; selected member gets +500 (team-wide)', async () => {
    const { members, teamId } = await buildTeam('sub', 3);
    await startEventAsAdmin(app);
    await activateHidden();
    const sel = await selectedUserId(teamId);
    const selected = members.find((m) => m.userId === sel)!;
    const other = members.find((m) => m.userId !== sel)!;

    const denied = await hiddenSubmit(other.cookie, HIDDEN_FLAG);
    expect(denied.statusCode).toBe(403);

    const ok = await hiddenSubmit(selected.cookie, HIDDEN_FLAG);
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.body);
    expect(body.result).toBe('correct');
    expect(body.scoreDelta).toBe(500);

    // team-wide score reflects +500
    const lb = await app.inject({ method: 'GET', url: '/api/leaderboard', headers: { cookie: selected.cookie } });
    const row = JSON.parse(lb.body).leaderboard.find((r: any) => r.teamId === teamId);
    expect(row.score).toBe(500);
  });

  it('incorrect answer applies -400 (team-wide)', async () => {
    const { members, teamId } = await buildTeam('neg', 2);
    await startEventAsAdmin(app);
    await activateHidden();
    const sel = await selectedUserId(teamId);
    const selected = members.find((m) => m.userId === sel)!;
    const res = await hiddenSubmit(selected.cookie, 'DOOM{wrong}');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).scoreDelta).toBe(-400);
  });

  it('locks the team after one attempt (second attempt rejected)', async () => {
    const { members, teamId } = await buildTeam('lock', 3);
    await startEventAsAdmin(app);
    await activateHidden();
    const sel = await selectedUserId(teamId);
    const selected = members.find((m) => m.userId === sel)!;
    await hiddenSubmit(selected.cookie, HIDDEN_FLAG);
    const again = await hiddenSubmit(selected.cookie, HIDDEN_FLAG);
    expect(again.statusCode).toBe(409);
    const count = await prisma.hiddenLevelResult.count({ where: { teamId } });
    expect(count).toBe(1);
  });

  it('assignment/eligibility is stable across reloads', async () => {
    const { members, teamId } = await buildTeam('rel', 3);
    await startEventAsAdmin(app);
    await activateHidden();
    const sel1 = await selectedUserId(teamId);
    // multiple reads by various members do not change the selection
    for (const m of members) await hiddenState(m.cookie);
    const sel2 = await selectedUserId(teamId);
    expect(sel2).toBe(sel1);
  });
});
