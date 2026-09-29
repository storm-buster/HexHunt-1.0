import { prisma } from '../db/prisma.js';

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
}

// Team total = sum(Solve.awardedPoints) + hidden-level scoreDelta.
// All scores are computed server-side from persisted rows — never from client.
async function computeRows(): Promise<
  {
    teamId: string;
    teamName: string;
    score: number;
    solves: number;
    lastSolveAt: Date | null;
    hiddenDelta: number;
    members: { id: string; name: string }[];
  }[]
> {
  const teams = await prisma.team.findMany({
    where: { active: true },
    include: {
      solves: true,
      hiddenResult: true,
      memberships: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  const rows = teams.map((t) => {
    const solveScore = t.solves.reduce((sum, s) => sum + s.awardedPoints, 0);
    const hiddenDelta = t.hiddenResult ? t.hiddenResult.scoreDelta : 0;
    const lastSolveAt =
      t.solves.length > 0
        ? t.solves.reduce<Date>(
            (max, s) => (s.solvedAt > max ? s.solvedAt : max),
            t.solves[0].solvedAt,
          )
        : null;
    return {
      teamId: t.id,
      teamName: t.name,
      score: solveScore + hiddenDelta,
      solves: t.solves.length,
      lastSolveAt,
      hiddenDelta,
      members: t.memberships.map((m) => ({ id: m.user.id, name: m.user.name })),
    };
  });

  // Deterministic ordering:
  //   1. score descending
  //   2. earlier lastSolveAt first (reached the score sooner)
  //   3. teamName ascending (stable final tiebreak)
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const at = a.lastSolveAt ? a.lastSolveAt.getTime() : Number.POSITIVE_INFINITY;
    const bt = b.lastSolveAt ? b.lastSolveAt.getTime() : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows;
}

export async function getPlayerLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = await computeRows();
  return rows.map((r, i) => ({
    rank: i + 1,
    teamId: r.teamId,
    teamName: r.teamName,
    score: r.score,
    solves: r.solves,
    lastSolveAt: r.lastSolveAt,
    hiddenDelta: r.hiddenDelta,
  }));
}

export async function getAdminLeaderboard(): Promise<AdminLeaderboardRow[]> {
  const rows = await computeRows();
  return rows.map((r, i) => ({
    rank: i + 1,
    teamId: r.teamId,
    teamName: r.teamName,
    score: r.score,
    solves: r.solves,
    lastSolveAt: r.lastSolveAt,
    hiddenDelta: r.hiddenDelta,
    members: r.members,
    memberCount: r.members.length,
  }));
}

export async function getTeamScore(teamId: string): Promise<number> {
  const [solveAgg, hidden] = await Promise.all([
    prisma.solve.aggregate({ where: { teamId }, _sum: { awardedPoints: true } }),
    prisma.hiddenLevelResult.findUnique({ where: { teamId } }),
  ]);
  return (solveAgg._sum.awardedPoints ?? 0) + (hidden?.scoreDelta ?? 0);
}
