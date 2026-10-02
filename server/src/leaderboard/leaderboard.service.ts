import { prisma } from '../db/prisma.js';
import { getCurrentSession, getEvent } from '../events/event.service.js';

export interface LeaderboardRow {
  rank: number;
  teamId: string;
  teamName: string;
  score: number;
  solves: number;
  lastSolveAt: Date | null;
  hiddenDelta: number;
}

export interface AdminLeaderboardRow extends LeaderboardRow {
  members: { id: string; name: string }[];
  memberCount: number;
  incorrectSubmissions: number;
}

// Rows for a SPECIFIC session (all scores computed server-side from persisted
// rows filtered by sessionId). Returns [] if sessionId is null.
async function computeRows(sessionId: string | null) {
  if (!sessionId) return [];
  const teams = await prisma.team.findMany({
    where: { active: true },
    include: {
      solves: { where: { sessionId } },
      hiddenResults: { where: { sessionId } },
      submissions: { where: { sessionId, result: 'INCORRECT' }, select: { id: true } },
      memberships: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  const rows = teams.map((t) => {
    const solveScore = t.solves.reduce((sum, s) => sum + s.awardedPoints, 0);
    const hiddenDelta = t.hiddenResults[0]?.scoreDelta ?? 0;
    const lastSolveAt =
      t.solves.length > 0
        ? t.solves.reduce<Date>((max, s) => (s.solvedAt > max ? s.solvedAt : max), t.solves[0].solvedAt)
        : null;
    return {
      teamId: t.id,
      teamName: t.name,
      score: solveScore + hiddenDelta,
      solves: t.solves.length,
      lastSolveAt,
      hiddenDelta,
      incorrectSubmissions: t.submissions.length,
      members: t.memberships.map((m) => ({ id: m.user.id, name: m.user.name })),
    };
  });

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const at = a.lastSolveAt ? a.lastSolveAt.getTime() : Number.POSITIVE_INFINITY;
    const bt = b.lastSolveAt ? b.lastSolveAt.getTime() : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.teamName.localeCompare(b.teamName);
  });
  return rows;
}

// Player-safe leaderboard for the CURRENT LIVE session (empty when none live).
export async function getPlayerLeaderboard(): Promise<LeaderboardRow[]> {
  const session = await getCurrentSession();
  const rows = await computeRows(session?.id ?? null);
  return rows.map((r, i) => ({
    rank: i + 1, teamId: r.teamId, teamName: r.teamName, score: r.score,
    solves: r.solves, lastSolveAt: r.lastSolveAt, hiddenDelta: r.hiddenDelta,
  }));
}

// Admin leaderboard for an explicit session, or the current/most-recent one.
export async function getAdminLeaderboard(sessionId?: string): Promise<AdminLeaderboardRow[]> {
  let sid = sessionId ?? null;
  if (!sid) {
    const live = await getCurrentSession();
    if (live) sid = live.id;
    else {
      const event = await getEvent();
      const latest = event
        ? await prisma.eventSession.findFirst({ where: { eventId: event.id }, orderBy: { sessionNumber: 'desc' } })
        : null;
      sid = latest?.id ?? null;
    }
  }
  const rows = await computeRows(sid);
  return rows.map((r, i) => ({
    rank: i + 1, teamId: r.teamId, teamName: r.teamName, score: r.score,
    solves: r.solves, lastSolveAt: r.lastSolveAt, hiddenDelta: r.hiddenDelta,
    members: r.members, memberCount: r.members.length, incorrectSubmissions: r.incorrectSubmissions,
  }));
}

// Explicit per-session leaderboard (history / export). Includes members.
export async function getSessionLeaderboard(sessionId: string): Promise<AdminLeaderboardRow[]> {
  const rows = await computeRows(sessionId);
  return rows.map((r, i) => ({
    rank: i + 1, teamId: r.teamId, teamName: r.teamName, score: r.score,
    solves: r.solves, lastSolveAt: r.lastSolveAt, hiddenDelta: r.hiddenDelta,
    members: r.members, memberCount: r.members.length, incorrectSubmissions: r.incorrectSubmissions,
  }));
}

export async function getTeamScore(sessionId: string, teamId: string): Promise<number> {
  const [solveAgg, hidden] = await Promise.all([
    prisma.solve.aggregate({ where: { sessionId, teamId }, _sum: { awardedPoints: true } }),
    prisma.hiddenLevelResult.findUnique({ where: { sessionId_teamId: { sessionId, teamId } } }),
  ]);
  return (solveAgg._sum.awardedPoints ?? 0) + (hidden?.scoreDelta ?? 0);
}
