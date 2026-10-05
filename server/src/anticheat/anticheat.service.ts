import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { getCurrentSession } from '../events/event.service.js';

export interface TelemetryInput {
  type: string;
  count?: number;
}

export interface RecordResult {
  recorded: number; // number of accepted (type) increments
}

/**
 * Record coarse behavioral telemetry for the authenticated player. The session
 * and team are derived SERVER-SIDE from the live session + the user's
 * membership — a client-supplied team/session is never trusted. Only whitelisted
 * event TYPES and bounded COUNTS are stored; no clipboard contents, answers, or
 * secrets are accepted or persisted. No-ops (recorded:0) when no session is LIVE
 * or the user has no team.
 */
export async function recordTelemetry(userId: string, events: TelemetryInput[]): Promise<RecordResult> {
  const session = await getCurrentSession();
  if (!session) return { recorded: 0 };

  const membership = await prisma.teamMembership.findUnique({ where: { userId } });
  if (!membership) return { recorded: 0 };
  const teamId = membership.teamId;

  // Collapse to allowed types, clamp counts, cap distinct types per request.
  const allowed = new Set(config.antiCheat.allowedTypes);
  const perType = new Map<string, number>();
  for (const e of events) {
    if (!e || typeof e.type !== 'string') continue;
    const type = e.type;
    if (!allowed.has(type)) continue; // silently ignore unknown/forbidden types
    const inc = Math.min(
      Math.max(1, Math.floor(Number.isFinite(e.count as number) ? (e.count as number) : 1)),
      config.antiCheat.maxIncrementPerType,
    );
    perType.set(type, Math.min((perType.get(type) ?? 0) + inc, config.antiCheat.maxIncrementPerType));
    if (perType.size >= config.antiCheat.maxTypesPerRequest) break;
  }

  const now = new Date();
  let recorded = 0;
  for (const [type, inc] of perType) {
    await prisma.antiCheatEvent.upsert({
      where: { sessionId_teamId_userId_type: { sessionId: session.id, teamId, userId, type } },
      create: { sessionId: session.id, teamId, userId, type, count: inc, lastAt: now },
      update: { count: { increment: inc }, lastAt: now },
    });
    recorded += 1;
  }
  return { recorded };
}

// ── Admin summary (current LIVE session; triage only) ───────
export interface TeamAntiCheat {
  teamId: string;
  teamName: string;
  counters: Record<string, number>;
  totalSignals: number;
  suspicious: {
    fastSolves: number;        // solves with elapsedSeconds < fastSolveSeconds
    rapidSolveBursts: number;  // windows with >= rapidSolveCount solves
    solveCount: number;
  };
}

export interface AntiCheatSummary {
  sessionNumber: number | null;
  thresholds: {
    fastSolveSeconds: number;
    rapidSolveWindowSeconds: number;
    rapidSolveCount: number;
  };
  teams: TeamAntiCheat[];
}

export async function getAntiCheatSummary(): Promise<AntiCheatSummary> {
  const thresholds = {
    fastSolveSeconds: config.antiCheat.fastSolveSeconds,
    rapidSolveWindowSeconds: config.antiCheat.rapidSolveWindowSeconds,
    rapidSolveCount: config.antiCheat.rapidSolveCount,
  };

  const session = await getCurrentSession();
  if (!session) return { sessionNumber: null, thresholds, teams: [] };
  const sessionId = session.id;

  const [events, solves, teams] = await Promise.all([
    prisma.antiCheatEvent.findMany({ where: { sessionId } }),
    prisma.solve.findMany({ where: { sessionId }, select: { teamId: true, elapsedSeconds: true, solvedAt: true } }),
    prisma.team.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  // Aggregate telemetry counters per team (summed across the team's members).
  const counterByTeam = new Map<string, Record<string, number>>();
  for (const e of events) {
    const row = counterByTeam.get(e.teamId) ?? {};
    row[e.type] = (row[e.type] ?? 0) + e.count;
    counterByTeam.set(e.teamId, row);
  }

  // Suspicious-solve signals per team (derived from persisted timings only).
  const solvesByTeam = new Map<string, { elapsedSeconds: number; solvedAt: Date }[]>();
  for (const s of solves) {
    const arr = solvesByTeam.get(s.teamId) ?? [];
    arr.push({ elapsedSeconds: s.elapsedSeconds, solvedAt: s.solvedAt });
    solvesByTeam.set(s.teamId, arr);
  }

  const windowMs = thresholds.rapidSolveWindowSeconds * 1000;
  function rapidBursts(times: Date[]): number {
    const sorted = times.map((t) => t.getTime()).sort((a, b) => a - b);
    let bursts = 0;
    let start = 0;
    for (let end = 0; end < sorted.length; end++) {
      while (sorted[end] - sorted[start] > windowMs) start++;
      if (end - start + 1 >= thresholds.rapidSolveCount) {
        bursts += 1;
        start = end + 1; // non-overlapping burst windows
      }
    }
    return bursts;
  }

  const result: TeamAntiCheat[] = teams.map((t) => {
    const counters = counterByTeam.get(t.id) ?? {};
    const totalSignals = Object.values(counters).reduce((a, b) => a + b, 0);
    const teamSolves = solvesByTeam.get(t.id) ?? [];
    const fastSolves = teamSolves.filter((s) => s.elapsedSeconds < thresholds.fastSolveSeconds).length;
    return {
      teamId: t.id,
      teamName: t.name,
      counters,
      totalSignals,
      suspicious: {
        fastSolves,
        rapidSolveBursts: rapidBursts(teamSolves.map((s) => s.solvedAt)),
        solveCount: teamSolves.length,
      },
    };
  });

  // Teams with the most signals/suspicion first (helps admin triage).
  result.sort((a, b) =>
    b.suspicious.fastSolves - a.suspicious.fastSolves ||
    b.suspicious.rapidSolveBursts - a.suspicious.rapidSolveBursts ||
    b.totalSignals - a.totalSignals ||
    a.teamName.localeCompare(b.teamName),
  );

  return { sessionNumber: session.sessionNumber, thresholds, teams: result };
}
