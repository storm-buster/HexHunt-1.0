import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db/prisma.js';
import { currentSession } from './helpers.js';

const CORRECT_RECORD_LABEL: Record<string, string> = {
  'wv-01': 'NODE GW-02',
  'wv-02': '/portal-exit',
  'wv-03': 'TOKEN T-C',
  'os-01': 'REC-02',
  'os-02': 'PROFILE P3',
  'os-03': 'PAGE D3',
};

function decodeHexSpaced(body: string): string | null {
  const m = /([0-9a-f]{2}(?:\s[0-9a-f]{2}){7})/i.exec(body);
  if (!m) return null;
  return m[1].split(/\s+/).map((h) => String.fromCharCode(parseInt(h, 16))).join('');
}
function decodeBinary(body: string): string | null {
  const m = /([01]{8}(?:\s[01]{8}){7})/.exec(body);
  if (!m) return null;
  return m[1].split(/\s+/).map((b) => String.fromCharCode(parseInt(b, 2))).join('');
}
function decodeBase64Token(body: string): string | null {
  const m = /base64\)\s*[:=]\s*([A-Za-z0-9+/=]+)/.exec(body) ?? /BEACON \(base64\):\s*([A-Za-z0-9+/=]+)/.exec(body);
  if (!m) return null;
  return Buffer.from(m[1], 'base64').toString('utf8');
}

// Derive the per-team answer for a challenge instance exactly as a player would:
// decode the per-team clue (darknet/hidden) or read the correct artifact record
// (webverse/osint). Reads the ChallengeInstance publicState (no secret/hash use).
export async function instanceAnswer(sessionId: string, teamId: string, challengeId: string): Promise<string> {
  const inst = await prisma.challengeInstance.findUnique({
    where: { sessionId_teamId_challengeId: { sessionId, teamId, challengeId } },
  });
  if (!inst) throw new Error(`no instance for ${challengeId}`);
  const ps = inst.publicState as any;

  if (ps.artifact) {
    const label = CORRECT_RECORD_LABEL[challengeId];
    const rec = ps.artifact.records.find((r: any) => r.label === label);
    if (!rec) throw new Error(`no correct record for ${challengeId}`);
    const refKey = Object.keys(rec.fields).find((k) => k.endsWith('-Ref'))!;
    return `DOOM{${rec.fields[refKey]}}`;
  }

  const body: string = ps.clueContent.body;
  const inner = decodeHexSpaced(body) ?? decodeBinary(body) ?? decodeBase64Token(body);
  if (!inner) throw new Error(`cannot derive answer for ${challengeId}`);
  return `DOOM{${inner}}`;
}

function decodeToken(body: string): string | null {
  return decodeHexSpaced(body) ?? decodeBinary(body) ?? decodeBase64Token(body);
}

export async function teamIdForCookie(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/api/team', headers: { cookie } });
  return JSON.parse(res.body).team.id as string;
}

// Full solve: open the challenge (creates the instance). For a multi-step
// (darknet) challenge, decode the intermediate, verify it via the step API to
// unlock the final-phase material, decode that, then submit the final answer.
// For single-step challenges, derive and submit the answer directly.
export async function solveChallenge(app: FastifyInstance, cookie: string, challengeId: string) {
  const open = await app.inject({ method: 'GET', url: `/api/challenges/${challengeId}`, headers: { cookie } });
  if (open.statusCode !== 200) throw new Error(`open ${challengeId} failed: ${open.body}`);
  const ch = JSON.parse(open.body).challenge;

  if (ch.awaitingIntermediate) {
    const t1 = decodeToken(ch.clueContent.body);
    if (!t1) throw new Error(`cannot decode step-1 for ${challengeId}`);
    const stepRes = await app.inject({ method: 'POST', url: `/api/challenges/${challengeId}/step`, headers: { cookie }, payload: { input: t1 } });
    const step = JSON.parse(stepRes.body).step;
    if (!step?.ok) throw new Error(`step verify failed for ${challengeId}: ${stepRes.body}`);
    const t2 = decodeToken(step.clueContent.body);
    if (!t2) throw new Error(`cannot decode step-2 for ${challengeId}`);
    return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag: `DOOM{${t2}}` } });
  }

  // Multi-step challenge already advanced to the final phase: the current clue
  // IS the step-2 material — decode it directly.
  if (ch.totalSteps) {
    const t2 = decodeToken(ch.clueContent.body);
    if (!t2) throw new Error(`cannot decode final step for ${challengeId}`);
    return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag: `DOOM{${t2}}` } });
  }

  const session = (await currentSession())!;
  const teamId = await teamIdForCookie(app, cookie);
  const flag = await instanceAnswer(session.id, teamId, challengeId);
  return app.inject({ method: 'POST', url: '/api/submissions', headers: { cookie }, payload: { challengeId, flag } });
}

// For a multi-step challenge: decode the intermediate (step-1) token so tests
// can submit it to the step API.
export async function intermediateToken(app: FastifyInstance, cookie: string, challengeId: string): Promise<string> {
  const open = await app.inject({ method: 'GET', url: `/api/challenges/${challengeId}`, headers: { cookie } });
  const ch = JSON.parse(open.body).challenge;
  const t1 = decodeToken(ch.clueContent.body);
  if (!t1) throw new Error(`cannot decode step-1 for ${challengeId}`);
  return t1;
}
