import { prisma } from '../db/prisma.js';
import { getActiveEvent, refreshHiddenActivation } from '../events/event.service.js';
import { getAdminLeaderboard } from '../leaderboard/leaderboard.service.js';
import { HIDDEN_CHALLENGE_ID } from '../hidden/hidden.service.js';
import { clientCount } from '../realtime/hub.js';

export async function adminEventView() {
  const event = await refreshHiddenActivation().catch(() => getActiveEvent());
  const [teamCount, userCount] = await Promise.all([
    prisma.team.count({ where: { active: true } }),
    prisma.user.count({ where: { role: 'PLAYER' } }),
  ]);
  return {
    event: event
      ? {
          id: event.id,
          name: event.name,
          status: event.status,
          startedAt: event.startedAt,
          closedAt: event.closedAt,
          hiddenActivationAt: event.hiddenActivationAt, // admin may see the schedule
          hiddenActivated: event.hiddenActivated,
        }
      : null,
    serverTime: new Date().toISOString(),
    teamCount,
    userCount,
    wsClients: clientCount(),
  };
}

export async function adminTeams() {
  const teams = await prisma.team.findMany({
    include: {
      memberships: { include: { user: { select: { id: true, name: true, email: true } } } },
      solves: { include: { challenge: { select: { title: true } } } },
      hiddenResult: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return teams.map((t) => {
    const score =
      t.solves.reduce((s, x) => s + x.awardedPoints, 0) + (t.hiddenResult?.scoreDelta ?? 0);
    const lastActivity =
      t.solves.length > 0
        ? t.solves.reduce<Date>((m, s) => (s.solvedAt > m ? s.solvedAt : m), t.solves[0].solvedAt)
        : t.createdAt;
    return {
      id: t.id,
      name: t.name,
      inviteCode: t.inviteCode,
      active: t.active,
      score,
      solveCount: t.solves.length,
      members: t.memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
      solvedChallenges: t.solves.map((s) => ({
        challengeId: s.challengeId,
        title: s.challenge.title,
        awardedPoints: s.awardedPoints,
        solvedAt: s.solvedAt,
      })),
      hidden: t.hiddenResult
        ? { correct: t.hiddenResult.correct, scoreDelta: t.hiddenResult.scoreDelta }
        : null,
      lastActivity,
    };
  });
}

export async function adminUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    include: { membership: { include: { team: { select: { name: true } } } } },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    team: u.membership?.team.name ?? null,
  }));
}

export async function adminSubmissions(limit = 100) {
  const subs = await prisma.submission.findMany({
    orderBy: { submittedAt: 'desc' },
    take: Math.min(limit, 500),
    include: {
      team: { select: { name: true } },
      user: { select: { name: true } },
      challenge: { select: { title: true } },
    },
  });
  return subs.map((s) => ({
    id: s.id,
    submittedAt: s.submittedAt,
    team: s.team.name,
    player: s.user.name,
    challengeId: s.challengeId,
    challenge: s.challenge.title,
    result: s.result,
    awardedPoints: s.awardedPoints,
    penaltyPoints: s.penaltyPoints,
  }));
}

export async function adminChallengeMonitor() {
  const challenges = await prisma.challenge.findMany({
    where: { isHidden: false },
    orderBy: [{ universeOrder: 'asc' }, { orderIndex: 'asc' }],
    include: { solves: { orderBy: { solvedAt: 'asc' }, include: { team: { select: { name: true } } } } },
  });
  return challenges.map((c) => {
    const solveCount = c.solves.length;
    const first = c.solves[0];
    const avgSolveSeconds =
      solveCount > 0 ? Math.round(c.solves.reduce((s, x) => s + x.elapsedSeconds, 0) / solveCount) : null;
    return {
      id: c.id,
      title: c.title,
      universe: c.universe,
      points: c.points,
      solveCount,
      firstBlood: first ? { team: first.team.name, solvedAt: first.solvedAt } : null,
      avgSolveSeconds,
    };
  });
}

export async function adminHiddenLevel() {
  const event = await getActiveEvent();
  const hidden = await prisma.challenge.findUnique({ where: { id: HIDDEN_CHALLENGE_ID } });

  // Per-team assignments (admin may see the selected member; players may not).
  const assignments = await prisma.hiddenLevelAssignment.findMany({
    include: { team: { select: { name: true } }, user: { select: { name: true } } },
  });
  const results = await prisma.hiddenLevelResult.findMany({
    include: { team: { select: { id: true, name: true } }, user: { select: { name: true } } },
    orderBy: { submittedAt: 'desc' },
  });
  const resultByTeam = new Map(results.map((r) => [r.team.id, r]));

  // Status: NOT_STARTED (pre-start) → SCHEDULED (LIVE, pre-T+30) → ACTIVE (post-T+30).
  let status: 'NOT_STARTED' | 'SCHEDULED' | 'ACTIVE' = 'NOT_STARTED';
  if (event?.status === 'LIVE' || event?.status === 'CLOSED') {
    status = event.hiddenActivated ? 'ACTIVE' : 'SCHEDULED';
  }

  return {
    status,
    activationAt: event?.hiddenActivationAt ?? null,
    activated: event?.hiddenActivated ?? false,
    reward: hidden?.hiddenReward ?? null,
    penalty: hidden?.hiddenPenalty ?? null,
    // Per-team: which member was selected, and the team's result (if submitted).
    teams: assignments.map((a) => {
      const r = resultByTeam.get(a.teamId);
      return {
        team: a.team.name,
        selectedPlayer: a.user.name,
        submitted: !!r,
        correct: r ? r.correct : null,
        scoreDelta: r ? r.scoreDelta : null,
        submittedAt: r ? r.submittedAt : null,
      };
    }),
    results: results.map((r) => ({
      team: r.team.name,
      player: r.user.name,
      correct: r.correct,
      scoreDelta: r.scoreDelta,
      submittedAt: r.submittedAt,
    })),
  };
}

export async function adminStatistics() {
  const [users, teams, activeTeams, solves, subs, correct, hiddenResults] = await Promise.all([
    prisma.user.count({ where: { role: 'PLAYER' } }),
    prisma.team.count(),
    prisma.team.count({ where: { active: true } }),
    prisma.solve.count(),
    prisma.submission.count(),
    prisma.submission.count({ where: { result: 'CORRECT' } }),
    prisma.hiddenLevelResult.findMany(),
  ]);
  const leaderboard = await getAdminLeaderboard();
  return {
    registeredUsers: users,
    registeredTeams: teams,
    activeTeams,
    solvedChallenges: solves,
    totalSubmissions: subs,
    correctSubmissions: correct,
    incorrectSubmissions: subs - correct,
    currentLeader: leaderboard[0] ?? null,
    hiddenOutcomes: {
      total: hiddenResults.length,
      correct: hiddenResults.filter((r) => r.correct).length,
      incorrect: hiddenResults.filter((r) => !r.correct).length,
    },
  };
}
