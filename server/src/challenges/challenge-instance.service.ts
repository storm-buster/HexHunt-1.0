import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { ChallengeInstance } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { hashSecret, verifySecret } from '../auth/password.js';
import type { ArtifactDef } from './challenge-data.js';

// ── types ───────────────────────────────────────────────────
export interface Clue { label: string; body: string; format: string }
export interface InstancePublicState { clueContent: Clue; artifact: ArtifactDef | null }
interface Built { clueContent: Clue; artifact: ArtifactDef | null }

// ── secure randomness (never Math.random for security material) ──
function token8(): string {
  return randomBytes(4).toString('hex'); // 8 lowercase hex chars (matches flag style)
}

// ── encoders (mirror the existing puzzle encodings) ─────────
const bytesOf = (s: string): number[] => Array.from(Buffer.from(s, 'utf8'));
const hexSpaced = (s: string): string => bytesOf(s).map((b) => b.toString(16).padStart(2, '0')).join(' ');
const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');
const binary = (s: string): string => bytesOf(s).map((b) => b.toString(2).padStart(8, '0')).join(' ');

const ARTIFACT_BASE =
  process.env.ARTIFACT_BASE_URL ??
  process.env.PUBLIC_API_URL ??
  `http://localhost:${process.env.PORT ?? '4000'}`;
const aUrl = (challengeId: string, artifactId: string): string => `${ARTIFACT_BASE}/artifacts/${challengeId}/${artifactId}`;

// ── per-challenge generators ────────────────────────────────
// Each builds the per-team clue (+ artifact) from a secret inner token. The
// correct answer is DOOM{inner}; the reasoning path is identical to the static
// puzzle, only the token/refs are per-team. `decoy()` produces random decoy refs
// so decoy records also differ per team (no fingerprinting).
type Gen = (inner: string, artifactId: string, decoy: () => string) => Built;

const GENERATORS: Record<string, Gen> = {
  // ── WEBVERSE (clue hex-encodes a per-instance artifact URL) ──
  'wv-01': (inner, aid, decoy) => ({
    clueContent: {
      label: '<!-- SOURCE COMMENT -->',
      body: `<!-- GATEWAY DEBUG: override registry trace =\n${hexSpaced(aUrl('wv-01', aid))}\n— decode to continue. — J.R. -->`,
      format: 'code',
    },
    artifact: {
      id: aid, title: 'GATEWAY OVERRIDE REGISTRY',
      intro: 'Registered multiverse gateway override nodes. Only the node bound to the correct operator and sector authorises an override.',
      records: [
        { label: 'NODE GW-01', fields: { Sector: '199999', Operator: 'V. von Doom', 'Override-Ref': decoy(), Status: 'REVOKED' } },
        { label: 'NODE GW-02', fields: { Sector: '616', Operator: 'J. Fury', 'Override-Ref': inner, Status: 'AUTHORISED' } },
        { label: 'NODE GW-03', fields: { Sector: '838', Operator: 'S. Strange', 'Override-Ref': decoy(), Status: 'AUTHORISED' } },
      ],
    },
  }),
  'wv-02': (inner, aid) => ({
    clueContent: {
      label: 'CHAIN LOG',
      body: `REDIRECT TRACE (follow the map):\n${hexSpaced(aUrl('wv-02', aid))}\nSTATUS: 308 Permanent Redirect (loop)\nX-Multiverse-Warning: "The exit answers 200."`,
      format: 'metadata',
    },
    artifact: {
      id: aid, title: 'PORTAL REDIRECT MAP',
      intro: 'Live status of the portal redirect endpoints. Traps loop or dead-end; the true exit answers 200 OK.',
      records: [
        { label: '/portal', fields: { Response: '308 Permanent Redirect', Target: '/portal2', 'Exit-Ref': '—' } },
        { label: '/portal2', fields: { Response: '404 Not Found', Target: '(dead-end)', 'Exit-Ref': '—' } },
        { label: '/portal-return', fields: { Response: '308 Permanent Redirect', Target: '/portal', 'Exit-Ref': '—' } },
        { label: '/portal-exit', fields: { Response: '200 OK', Target: '(stable)', 'Exit-Ref': inner } },
      ],
    },
  }),
  'wv-03': (inner, aid, decoy) => ({
    clueContent: {
      label: 'HTTP RESPONSE HEADERS',
      body: `Content-Type: application/json\nServer: Multiverse-Gateway/2.0\nWWW-Authenticate: Bearer realm="multiverse"\nX-Trace: ${hexSpaced(aUrl('wv-03', aid))}`,
      format: 'metadata',
    },
    artifact: {
      id: aid, title: 'BEARER TOKEN VAULT',
      intro: 'Issued bearer tokens. A token authorises only if it matches the gate realm ("multiverse") and is still ACTIVE.',
      records: [
        { label: 'TOKEN T-A', fields: { Realm: 'battleworld', Status: 'ACTIVE', 'Token-Ref': decoy() } },
        { label: 'TOKEN T-B', fields: { Realm: 'multiverse', Status: 'EXPIRED', 'Token-Ref': decoy() } },
        { label: 'TOKEN T-C', fields: { Realm: 'multiverse', Status: 'ACTIVE', 'Token-Ref': inner } },
      ],
    },
  }),
  // ── OSINT (clue shows a plaintext per-instance artifact URL) ──
  'os-01': (inner, aid, decoy) => ({
    clueContent: {
      label: 'INTERCEPTED SIGNAL',
      body: `LAT: 28.6129\nLON: 77.2295\nTRANSMISSION: "I was here. Standing under the arch."\nINTEL DOSSIER: ${aUrl('os-01', aid)}`,
      format: 'code',
    },
    artifact: {
      id: aid, title: 'FIELD INTEL DOSSIER — MONUMENTS',
      intro: 'Monuments cross-referenced by coordinates. Match the intercepted coordinates to the correct monument record.',
      records: [
        { label: 'REC-01', fields: { Monument: 'Gateway of India', City: 'Mumbai', Coordinates: '18.9220, 72.8347', 'Record-Ref': decoy() } },
        { label: 'REC-02', fields: { Monument: 'India Gate', City: 'New Delhi', Coordinates: '28.6129, 77.2295', 'Record-Ref': inner } },
        { label: 'REC-03', fields: { Monument: 'Red Fort', City: 'New Delhi', Coordinates: '28.6562, 77.2410', 'Record-Ref': decoy() } },
      ],
    },
  }),
  'os-02': (inner, aid, decoy) => ({
    clueContent: {
      label: 'SOCIAL POST METADATA',
      body: `DISPLAY NAME: "Natasha R."\nHANDLE SEEN: @n4t4sh4_r0m4n0ff\nNOTE: multiple impersonators detected.\nSOCIAL ARCHIVE: ${aUrl('os-02', aid)}`,
      format: 'code',
    },
    artifact: {
      id: aid, title: 'SOCIAL ARCHIVE — PROFILE MATCHES',
      intro: 'Profiles matching the display name "Natasha R." Only one is the verified original.',
      records: [
        { label: 'PROFILE P1', fields: { Handle: '@n4t4sh4_r0m4n0ff_1995', Verified: 'NO', Joined: '2019-04-02', 'Account-Ref': decoy() } },
        { label: 'PROFILE P2', fields: { Handle: '@n4t4sh4.r0m4n0ff', Verified: 'NO', Joined: '2021-11-20', 'Account-Ref': decoy() } },
        { label: 'PROFILE P3', fields: { Handle: '@n4t4sh4_r0m4n0ff', Verified: 'YES', Joined: '2011-05-01', 'Account-Ref': inner } },
      ],
    },
  }),
  'os-03': (inner, aid, decoy) => ({
    clueContent: {
      label: 'IMAGE PIXEL ANALYSIS',
      body: `IMG: classified-doc.png (1024x1024)\nRECOVERY NOTE: several pages recovered; most are forgeries.\nRECOVERY ARCHIVE: ${aUrl('os-03', aid)}`,
      format: 'code',
    },
    artifact: {
      id: aid, title: 'RECOVERED DOCUMENT ARCHIVE',
      intro: 'Recovered document pages. Forged/redacted pages are decoys; only the VERIFIED page with a VALID checksum is authentic.',
      records: [
        { label: 'PAGE D1', fields: { Serial: 'DOC-4471', State: 'FORGED', Checksum: 'INVALID', 'Doc-Ref': decoy() } },
        { label: 'PAGE D2', fields: { Serial: 'DOC-8890', State: 'REDACTED', Checksum: 'UNKNOWN', 'Doc-Ref': decoy() } },
        { label: 'PAGE D3', fields: { Serial: 'DOC-1207', State: 'VERIFIED', Checksum: 'VALID', 'Doc-Ref': inner } },
      ],
    },
  }),
  // ── DARKNET (clue encodes the per-team token in-place) ──────
  'dn-01': (inner) => ({
    clueContent: { label: 'PIXEL DATA (LSB extracted)', body: `IMG: whisper.png (100x100)\nLSB BYTE STREAM (hex):\n${hexSpaced(inner)}\nDecode the bytes to ASCII to reveal the token.`, format: 'code' },
    artifact: null,
  }),
  'dn-02': (inner) => ({
    clueContent: { label: 'ENCODED MESSAGE', body: `CIPHER LAB OUTPUT\nFINAL STAGE (base64): ${b64(inner)}\nDecode to recover the token.`, format: 'code' },
    artifact: null,
  }),
  'dn-03': (inner) => ({
    clueContent: { label: 'LSB EXTRACTION', body: `IMG: signal.png\nCHANNEL R, BIT 0 (binary):\n${binary(inner)}\nDecode the binary to ASCII to reveal the token.`, format: 'code' },
    artifact: null,
  }),
  'dn-04': (inner) => ({
    clueContent: { label: 'PCAP PACKET LIST', body: `#   SRC          DST          PROTO  INFO\n40  10.0.0.1     10.0.0.42    TCP    SYN\n41  10.0.0.1     10.0.0.42    HTTP   GET /key\n42  10.0.0.42    10.0.0.1     HTTP   200 OK  body(base64)=${b64(inner)}\n43  10.0.0.1     10.0.0.42    TCP    FIN\nInspect the response body to reveal the token.`, format: 'code' },
    artifact: null,
  }),
  'dn-05': (inner) => ({
    clueContent: { label: 'DISASSEMBLY (.rodata)', body: `0x00001234: "multiverse_init_v2"\n0x00001248: "android_core_v3"\n0x00001260: KEY (hex) = ${hexSpaced(inner)}\n0x00001280: "MIND_STONE = ACTIVATED"\nDecode the KEY bytes to ASCII to reveal the token.`, format: 'code' },
    artifact: null,
  }),
  'dn-06': (inner) => ({
    clueContent: { label: 'VULNERABLE PROGRAM', body: `#include <stdio.h>\nint main(int argc, char *argv[]) {\n  printf(argv[1]);  // format-string vuln\n  return 0;\n}\nLEAKED MEMORY (hex): ${hexSpaced(inner)}\nInterpret the leaked bytes as ASCII to reveal the token.`, format: 'terminal' },
    artifact: null,
  }),
  // ── HIDDEN (per-team base64 beacon; +500/-400 + one-attempt preserved elsewhere) ──
  'hidden-01': (inner) => ({
    clueContent: { label: 'ANOMALY BEACON', body: `SIGNAL ORIGIN: UNKNOWN\nAMPLITUDE: CRITICAL\nBEACON (base64): ${b64(inner)}\nDecode the beacon to recover the token.`, format: 'code' },
    artifact: null,
  }),
};

export function isInstanced(challengeId: string): boolean {
  return challengeId in GENERATORS;
}

// Darknet "decode" challenges become 2-phase: decode an intermediate token
// (verified server-side) which unlocks the final-phase material. Webverse/OSINT
// stay single-step (already multi-interaction via authenticated artifacts);
// hidden-01 keeps its one-attempt flow.
const MULTISTEP = new Set(['dn-01', 'dn-02', 'dn-03', 'dn-04', 'dn-05', 'dn-06']);
export function isMultiStep(challengeId: string): boolean {
  return MULTISTEP.has(challengeId);
}

interface StepMaterial { step1: Clue; step2: Clue }

// ── lazy, idempotent instance creation (one per session/team/challenge) ──
export async function getOrCreateInstance(
  sessionId: string,
  teamId: string,
  challengeId: string,
): Promise<ChallengeInstance | null> {
  const existing = await prisma.challengeInstance.findUnique({
    where: { sessionId_teamId_challengeId: { sessionId, teamId, challengeId } },
  });
  if (existing) return existing;

  const gen = GENERATORS[challengeId];
  if (!gen) return null; // non-instanced (e.g. final-boss) → caller falls back

  // ── Multi-step: two per-team tokens (intermediate t1 → final t2) ──
  if (isMultiStep(challengeId)) {
    const t1 = token8();
    const t2 = token8();
    const step1 = gen(t1, token8(), token8).clueContent;
    const step2 = gen(t2, token8(), token8).clueContent;
    const answerHash = await hashSecret(`DOOM{${t2}}`);
    const intermediateHash = await hashSecret(t1);
    const publicState: InstancePublicState = { clueContent: step1, artifact: null };
    const stepMaterial: StepMaterial = { step1, step2 };
    try {
      // Both-or-neither: the instance (final answer) and its step state are
      // created atomically so progress is always consistent.
      const [created] = await prisma.$transaction([
        prisma.challengeInstance.create({
          data: { sessionId, teamId, challengeId, answerHash, publicState: publicState as unknown as Prisma.InputJsonValue },
        }),
        prisma.challengeStepProgress.create({
          data: { sessionId, teamId, challengeId, stage: 1, totalSteps: 2, intermediateHash, stepMaterial: stepMaterial as unknown as Prisma.InputJsonValue },
        }),
      ]);
      return created;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const won = await prisma.challengeInstance.findUnique({
          where: { sessionId_teamId_challengeId: { sessionId, teamId, challengeId } },
        });
        if (won) return won;
      }
      throw e;
    }
  }

  // ── Single-step (webverse/osint/hidden): one token = final answer ──
  const inner = token8();
  const artifactId = token8();
  const built = gen(inner, artifactId, token8);
  const answerHash = await hashSecret(`DOOM{${inner}}`);
  const publicState: InstancePublicState = { clueContent: built.clueContent, artifact: built.artifact };

  try {
    return await prisma.challengeInstance.create({
      data: { sessionId, teamId, challengeId, answerHash, publicState: publicState as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const won = await prisma.challengeInstance.findUnique({
        where: { sessionId_teamId_challengeId: { sessionId, teamId, challengeId } },
      });
      if (won) return won;
    }
    throw e;
  }
}

// ── Multi-step state machine ────────────────────────────────
export interface StepView {
  multiStep: boolean;
  step: number;        // 1 = intermediate, 2 = final
  totalSteps: number;
  awaitingIntermediate: boolean;
  clueContent: Clue;   // material for the CURRENT step only
}

async function getStepProgress(sessionId: string, teamId: string, challengeId: string) {
  return prisma.challengeStepProgress.findUnique({
    where: { sessionId_teamId_challengeId: { sessionId, teamId, challengeId } },
  });
}

// The clue the player should currently see. For a multi-step challenge this is
// step-1 material until the intermediate is verified, then step-2 material. The
// final-phase material is NEVER returned while stage === 1.
export async function currentStepClue(sessionId: string, teamId: string, challengeId: string): Promise<StepView | null> {
  if (!isMultiStep(challengeId)) return null;
  await getOrCreateInstance(sessionId, teamId, challengeId); // ensures progress exists
  const p = await getStepProgress(sessionId, teamId, challengeId);
  if (!p) return null;
  const mat = p.stepMaterial as unknown as StepMaterial;
  const atFinal = p.stage >= 2;
  return {
    multiStep: true,
    step: atFinal ? 2 : 1,
    totalSteps: p.totalSteps,
    awaitingIntermediate: !atFinal,
    clueContent: atFinal ? mat.step2 : mat.step1,
  };
}

export interface StepVerifyResult {
  ok: boolean;
  step: number;
  totalSteps: number;
  awaitingIntermediate: boolean;
  clueContent: Clue | null; // next-step material on success (step 2), else null
}

// Verify the intermediate value and advance the state machine. Idempotent: if
// already past stage 1, returns the current (final) view. The final-phase
// material is only released here, after a correct intermediate.
export async function verifyStep(
  sessionId: string,
  teamId: string,
  challengeId: string,
  input: string,
): Promise<StepVerifyResult | null> {
  if (!isMultiStep(challengeId)) return null;
  await getOrCreateInstance(sessionId, teamId, challengeId);
  const p = await getStepProgress(sessionId, teamId, challengeId);
  if (!p) return null;
  const mat = p.stepMaterial as unknown as StepMaterial;

  if (p.stage >= 2) {
    return { ok: true, step: 2, totalSteps: p.totalSteps, awaitingIntermediate: false, clueContent: mat.step2 };
  }

  const ok = await verifySecret(p.intermediateHash, input);
  if (!ok) {
    return { ok: false, step: 1, totalSteps: p.totalSteps, awaitingIntermediate: true, clueContent: null };
  }

  await prisma.challengeStepProgress.update({ where: { id: p.id }, data: { stage: 2 } });
  return { ok: true, step: 2, totalSteps: p.totalSteps, awaitingIntermediate: false, clueContent: mat.step2 };
}

// The final answer is submittable only once all intermediate steps are done.
// Single-step challenges are always "unlocked".
export async function isFinalUnlocked(sessionId: string, teamId: string, challengeId: string): Promise<boolean> {
  if (!isMultiStep(challengeId)) return true;
  const p = await getStepProgress(sessionId, teamId, challengeId);
  return !!p && p.stage >= 2;
}

export function instancePublicState(inst: ChallengeInstance): InstancePublicState {
  return inst.publicState as unknown as InstancePublicState;
}

// Server-authoritative validation against THIS team's instance. Returns null if
// the challenge is not instanced (caller falls back to the legacy flag hash).
export async function validateInstanceAnswer(
  sessionId: string,
  teamId: string,
  challengeId: string,
  submitted: string,
): Promise<boolean | null> {
  const inst = await getOrCreateInstance(sessionId, teamId, challengeId);
  if (!inst) return null;
  return verifySecret(inst.answerHash, submitted);
}

// Resolve the requesting team's own artifact for a challenge. The artifactId
// must match THIS team's instance (so another team's artifactId → not found).
export async function getInstanceArtifact(
  sessionId: string,
  teamId: string,
  challengeId: string,
  artifactId: string,
): Promise<ArtifactDef | null> {
  const inst = await getOrCreateInstance(sessionId, teamId, challengeId);
  if (!inst) return null;
  const art = instancePublicState(inst).artifact;
  if (!art || art.id !== artifactId) return null;
  return art;
}
