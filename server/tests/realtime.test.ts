import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import {
  makeApp, resetState, registerPlayer, createTeam, joinTeam, startEventAsAdmin, loginAdmin,
} from './helpers.js';

const WV01 = 'DOOM{a3f19c2b}';

let app: FastifyInstance;
let wsBase = '';
const opened: WebSocket[] = [];

beforeAll(async () => {
  app = await makeApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address() as AddressInfo;
  wsBase = `ws://127.0.0.1:${addr.port}`;
});
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); await startEventAsAdmin(app); });
afterEach(() => { for (const w of opened.splice(0)) { try { w.close(); } catch { /* */ } } });

interface Client { ws: WebSocket; messages: any[]; waitFor: (type: string, ms?: number) => Promise<any>; }

function connect(path: string, cookie?: string): Promise<Client> {
  const ws = new WebSocket(`${wsBase}${path}`, cookie ? { headers: { cookie } } : undefined);
  opened.push(ws);
  const messages: any[] = [];
  ws.on('message', (raw) => { try { messages.push(JSON.parse(raw.toString())); } catch { /* */ } });
  const client: Client = {
    ws,
    messages,
    waitFor: (type, ms = 3000) =>
      new Promise((resolve, reject) => {
        const hit = messages.find((m) => m.type === type);
        if (hit) return resolve(hit);
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), ms);
        ws.on('message', (raw) => {
          try {
            const m = JSON.parse(raw.toString());
            if (m.type === type) { clearTimeout(timer); resolve(m); }
          } catch { /* */ }
        });
      }),
  };
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(client));
    ws.on('error', reject);
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function solve(cookie: string, challengeId = 'wv-01', flag = WV01) {
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag } });
}

describe('realtime — player team channel', () => {
  it('rejects an unauthenticated /ws/team connection', async () => {
    const c = await connect('/ws/team'); // no cookie
    // server sends ERROR then closes
    const closed = await new Promise<boolean>((resolve) => {
      c.ws.on('close', () => resolve(true));
      setTimeout(() => resolve(false), 3000);
    });
    expect(closed).toBe(true);
    expect(c.messages.some((m) => m.type === 'ERROR')).toBe(true);
  });

  it('an authenticated player with a team connects (CONNECTED)', async () => {
    const cookie = await registerPlayer(app, 'Solo', 'rt-solo@x.com');
    await createTeam(app, cookie, 'RT Solo');
    const c = await connect('/ws/team', cookie);
    const msg = await c.waitFor('CONNECTED');
    expect(msg.type).toBe('CONNECTED');
  });

  it('broadcasts TEAM_CHALLENGE_SOLVED to a teammate when Player A solves', async () => {
    const owner = await registerPlayer(app, 'A', 'rt-a@x.com');
    const code = await createTeam(app, owner, 'RT Team A');
    const mate = await registerPlayer(app, 'B', 'rt-b@x.com');
    await joinTeam(app, mate, code);
    await startEventAsAdmin(app);

    const bSocket = await connect('/ws/team', mate);
    await bSocket.waitFor('CONNECTED');

    const res = await solve(owner);
    expect(res.statusCode).toBe(200);

    const evt = await bSocket.waitFor('TEAM_CHALLENGE_SOLVED');
    expect(evt.payload.challengeId).toBe('wv-01');
    expect(evt.payload.scoreAwarded).toBeGreaterThan(0);
    expect(typeof evt.payload.teamScore).toBe('number');
    // no flag/answer leaked in the event
    expect(JSON.stringify(evt)).not.toContain(WV01);
    // exactly one such event
    await sleep(300);
    expect(bSocket.messages.filter((m) => m.type === 'TEAM_CHALLENGE_SOLVED').length).toBe(1);
  });

  it('does NOT deliver Team A solves to Team B (isolation)', async () => {
    const a = await registerPlayer(app, 'A', 'iso-a@x.com');
    await createTeam(app, a, 'ISO A');
    const b = await registerPlayer(app, 'B', 'iso-b@x.com');
    await createTeam(app, b, 'ISO B');
    await startEventAsAdmin(app);

    const bSocket = await connect('/ws/team', b);
    await bSocket.waitFor('CONNECTED');

    await solve(a); // Team A solves wv-01
    await sleep(600);
    expect(bSocket.messages.some((m) => m.type === 'TEAM_CHALLENGE_SOLVED')).toBe(false);
  });

  it('admin channel still receives CHALLENGE_SOLVED (unchanged)', async () => {
    const p = await registerPlayer(app, 'P', 'adm-p@x.com');
    await createTeam(app, p, 'Adm P');
    await startEventAsAdmin(app);
    const adminCookie = await loginAdmin(app);

    const adminSocket = await connect('/ws/admin', adminCookie);
    await adminSocket.waitFor('CONNECTED');

    await solve(p);
    const evt = await adminSocket.waitFor('CHALLENGE_SOLVED');
    expect(evt.payload.challengeId).toBe('wv-01');
  });
});
