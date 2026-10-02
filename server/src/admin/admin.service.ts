import { prisma } from '../db/prisma.js';
import { getEvent, getCurrentSession, refreshHiddenActivation } from '../events/event.service.js';
import { getAdminLeaderboard } from '../leaderboard/leaderboard.service.js';
import { HIDDEN_CHALLENGE_ID } from '../hidden/hidden.service.js';
import { clientCount } from '../realtime/hub.js';

// The session admin views operate on: the LIVE session, else the most recent one.
async function resolveSession() {
  const live = await getCurrentSession();
  if (live) return live;
  const event = await getEvent();
  if (!event) return null;
  return prisma.eventSession.findFirst({ where: { eventId: event.id }, orderBy: { sessionNumber: 'desc' } });
}

export async function adminEventView() {
  await refreshHiddenActivation().catch(() => null);
  const event = await getEvent();
  const live = await getCurrentSession();
  const latest = event
    ? await prisma.eventSession.findFirst({ where: { eventId: event.id }, orderBy: { sessionNumber: 'desc' } })
    : null;
  const session = live ?? latest;
  const [teamCount, userCount, sessionCount] = await Promise.all([
    prisma.team.count({ where: { active: true } }),
    prisma.user.count({ where: { role: 'PLAYER' } }),
    event ? prisma.eventSession.count({ where: { eventId: event.id } }) : Promise.resolve(0),
  ]);
  return {
    event: event ? { id: event.id, name: event.name } : null,
    status: live ? 'LIVE' : session ? 'COMPLETED' : 'NOT_STARTED',
    session: session
      ? {
          id: session.id,
          sessionNumber: session.sessionNumber,
          status: session.status,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          hiddenActivationAt: session.hiddenActivationAt, // admin may see the schedule
          hiddenActivated: session.hiddenActivated,
        }
      : null,
    sessionCount,
    serverTime: new Date().toISOString(),
    teamCount,
    userCount,
    wsClients: clientCount(),
  };
}

export async function adminTeams() {
  const session = await resolveSession();
  const sid = session?.id ?? '__none__';
  const teams = await prisma.team.findMany({
    include: {
      memberships: { include: { user: { select: { id: true, name: true, email: true } } } },
      solves: { where: { sessionId: sid }, include: { challenge: { select: { title: true } } } },
      hiddenResults: { where: { sessionId: sid } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return teams.map((t) => {
    const hidden = t.hiddenResults[0] ?? null;
    const score = t.solves.reduce((s, x) => s + x.awardedPoints, 0) + (hidden?.scoreDelta ?? 0);
    const lastActivity =
      t.solves.length > 0
        ? t.solves.reduce<Date>((m, s) => (s.solvedAt > m ? s.solvedAt : m), t.solves[0].solvedAt)
        : t.createdAt;
    return {
      id: t.id, name: t.name, inviteCode: t.inviteCode, active: t.active,
      score, solveCount: t.solves.length,
      members: t.memberships.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
      solvedChallenges: t.solves.map((s) => ({ challengeId: s.challengeId, title: s.challenge.title, awardedPoints: s.awardedPoints, solvedAt: s.solvedAt })),
      hidden: hidden ? { correct: hidden.correct, scoreDelta: hidden.scoreDelta } : null,
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
    id: u.id, name: u.name, email: u.email, role: u.role, active: u.active,
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, team: u.membership?.team.name ?? null,
  }));
}

export async function adminSubmissions(limit = 100) {
  const session = await resolveSession();
  if (!session) return [];
  const subs = await prisma.submission.findMany({
    where: { sessionId: session.id },
    orderBy: { submittedAt: 'desc' },
    take: Math.min(limit, 500),
    include: { team: { select: { name: true } }, user: { select: { name: true } }, challenge: { select: { title: true } } },
  });
  return subs.map((s) => ({
    id: s.id, submittedAt: s.submittedAt, team: s.team.name, player: s.user.name,
    challengeId: s.challengeId, challenge: s.challenge.title, result: s.result,
    awardedPoints: s.awardedPoints, penaltyPoints: s.penaltyPoints,
  }));
}

export async function adminChallengeMonitor() {
  const session = await resolveSession();
  const sid = session?.id ?? '__none__';
  const challenges = await prisma.challenge.findMany({
    where: { isHidden: false },
    orderBy: [{ universeOrder: 'asc' }, { orderIndex: 'asc' }],
    include: { solves: { where: { sessionId: sid }, orderBy: { solvedAt: 'asc' }, include: { team: { select: { name: true } } } } },
  });
  return challenges.map((c) => {
    const solveCount = c.solves.length;
    const first = c.solves[0];
    const avgSolveSeconds = solveCount > 0 ? Math.round(c.solves.reduce((s, x) => s + x.elapsedSeconds, 0) / solveCount) : null;
    return {
      id: c.id, title: c.title, universe: c.universe, points: c.points, solveCount,
      firstBlood: first ? { team: first.team.name, solvedAt: first.solvedAt } : null,
      avgSolveSeconds,
    };
  });
}

export async function adminHiddenLevel() {
  const session = await resolveSession();
  const hidden = await prisma.challenge.findUnique({ where: { id: HIDDEN_CHALLENGE_ID } });

  const sid = session?.id ?? '__none__';
  const assignments = await prisma.hiddenLevelAssignment.findMany({
    where: { sessionId: sid },
    include: { team: { select: { name: true } }, user: { select: { name: true } } },
  });
  const results = await prisma.hiddenLevelResult.findMany({
    where: { sessionId: sid },
    include: { team: { select: { id: true, name: true } }, user: { select: { name: true } } },
    orderBy: { submittedAt: 'desc' },
  });
  const resultByTeam = new Map(results.map((r) => [r.team.id, r]));

  let status: 'NOT_STARTED' | 'SCHEDULED' | 'ACTIVE' = 'NOT_STARTED';
  if (session) status = session.hiddenActivated ? 'ACTIVE' : session.status === 'LIVE' ? 'SCHEDULED' : 'NOT_STARTED';

  return {
    status,
    activationAt: session?.hiddenActivationAt ?? null,
    activated: session?.hiddenActivated ?? false,
    reward: hidden?.hiddenReward ?? null,
    penalty: hidden?.hiddenPenalty ?? null,
    teams: assignments.map((a) => {
      const r = resultByTeam.get(a.teamId);
      return {
        team: a.team.name, selectedPlayer: a.user.name, submitted: !!r,
        correct: r ? r.correct : null, scoreDelta: r ? r.scoreDelta : null, submittedAt: r ? r.submittedAt : null,
      };
    }),
    results: results.map((r) => ({ team: r.team.name, player: r.user.name, correct: r.correct, scoreDelta: r.scoreDelta, submittedAt: r.submittedAt })),
  };
}

export async function adminStatistics() {
  const session = await resolveSession();
  const sid = session?.id ?? '__none__';
  const [users, teams, activeTeams, solves, subs, correct, hiddenResults] = await Promise.all([
    prisma.user.count({ where: { role: 'PLAYER' } }),
    prisma.team.count(),
    prisma.team.count({ where: { active: true } }),
    prisma.solve.count({ where: { sessionId: sid } }),
    prisma.submission.count({ where: { sessionId: sid } }),
    prisma.submission.count({ where: { sessionId: sid, result: 'CORRECT' } }),
    prisma.hiddenLevelResult.findMany({ where: { sessionId: sid } }),
  ]);
  const leaderboard = await getAdminLeaderboard(session?.id);
  return {
    sessionNumber: session?.sessionNumber ?? null,
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
