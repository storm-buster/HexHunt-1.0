import JSZip from 'jszip';
import { prisma } from '../db/prisma.js';
import { getEvent } from '../events/event.service.js';
import { getSessionLeaderboard } from '../leaderboard/leaderboard.service.js';

// ── CSV helpers (RFC-4180-ish quoting) ──────────────────────
function cell(v: string | number | boolean | Date | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csv(header: string[], rows: (string | number | boolean | Date | null | undefined)[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n') + '\n';
}

// ── Session history (admin) ─────────────────────────────────
export async function listSessions() {
  const event = await getEvent();
  if (!event) return [];
  const sessions = await prisma.eventSession.findMany({
    where: { eventId: event.id },
    orderBy: { sessionNumber: 'desc' },
    include: {
      _count: { select: { solves: true, submissions: true } },
    },
  });
  // Distinct participating teams per session (teams with ≥1 submission).
  const result = [];
  for (const s of sessions) {
    const teams = await prisma.submission.findMany({
      where: { sessionId: s.id }, distinct: ['teamId'], select: { teamId: true },
    });
    const durationSeconds = s.completedAt
      ? Math.max(0, Math.round((s.completedAt.getTime() - s.startedAt.getTime()) / 1000))
      : null;
    result.push({
      id: s.id,
      sessionNumber: s.sessionNumber,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationSeconds,
      teamsParticipating: teams.length,
      totalSolves: s._count.solves,
      totalSubmissions: s._count.submissions,
    });
  }
  return result;
}

export async function getSessionById(sessionId: string) {
  const event = await getEvent();
  if (!event) return null;
  return prisma.eventSession.findFirst({ where: { id: sessionId, eventId: event.id } });
}

export async function getSessionDetail(sessionId: string) {
  const session = await getSessionById(sessionId);
  if (!session) return null;
  const leaderboard = await getSessionLeaderboard(sessionId);
  const hidden = await prisma.hiddenLevelResult.findMany({
    where: { sessionId },
    include: { team: { select: { name: true } }, user: { select: { name: true } } },
    orderBy: { submittedAt: 'asc' },
  });
  return {
    id: session.id,
    sessionNumber: session.sessionNumber,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    hiddenActivated: session.hiddenActivated,
    leaderboard,
    hiddenResults: hidden.map((h) => ({ team: h.team.name, player: h.user.name, correct: h.correct, scoreDelta: h.scoreDelta, submittedAt: h.submittedAt })),
  };
}

// ── Export a completed/any session as a ZIP (admin-only) ────
export interface SessionExport {
  filename: string;
  buffer: Buffer;
}

export async function buildSessionExport(sessionId: string): Promise<SessionExport | null> {
  const event = await getEvent();
  if (!event) return null;
  const session = await prisma.eventSession.findFirst({ where: { id: sessionId, eventId: event.id } });
  if (!session) return null;

  // Pull all session-scoped rows (generated FROM the stored session id, so it
  // stays correct after later sessions exist).
  const [solves, submissions, assignments, hiddenResults, teams, users] = await Promise.all([
    prisma.solve.findMany({ where: { sessionId }, include: { team: { select: { name: true } }, challenge: { select: { title: true } } }, orderBy: { solvedAt: 'asc' } }),
    prisma.submission.findMany({ where: { sessionId }, include: { team: { select: { name: true } }, user: { select: { name: true } }, challenge: { select: { title: true } } }, orderBy: { submittedAt: 'asc' } }),
    prisma.hiddenLevelAssignment.findMany({ where: { sessionId }, include: { team: { select: { name: true } }, user: { select: { name: true } } } }),
    prisma.hiddenLevelResult.findMany({ where: { sessionId }, include: { team: { select: { name: true } }, user: { select: { name: true } } } }),
    prisma.team.findMany({ include: { memberships: { include: { user: { select: { id: true, name: true } } } } } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const teamMembers = new Map(teams.map((t) => [t.id, t.memberships.map((m) => m.user.name).join('; ')]));
  const leaderboard = await getSessionLeaderboard(sessionId);
  const assignmentByTeam = new Map(assignments.map((a) => [a.teamId, a]));

  // session-summary.json (no flags/answers/secrets)
  const durationSeconds = session.completedAt
    ? Math.max(0, Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 1000))
    : null;
  const playerIds = new Set<string>();
  teams.forEach((t) => t.memberships.forEach((m) => playerIds.add(m.user.id)));
  const summary = {
    sessionId: session.id,
    sessionNumber: session.sessionNumber,
    eventName: event.name,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    durationSeconds,
    teamsParticipating: new Set(submissions.map((s) => s.teamId)).size,
    numberOfTeams: teams.length,
    numberOfPlayers: playerIds.size,
    totalSolves: solves.length,
    totalSubmissions: submissions.length,
    highestScore: leaderboard[0]?.score ?? 0,
    hiddenLevel: {
      activated: session.hiddenActivated,
      attempts: hiddenResults.length,
      correct: hiddenResults.filter((h) => h.correct).length,
      incorrect: hiddenResults.filter((h) => !h.correct).length,
    },
    generatedAt: new Date().toISOString(),
  };

  const leaderboardCsv = csv(
    ['rank', 'teamId', 'teamName', 'members', 'finalScore', 'solves', 'incorrectSubmissions', 'lastSolveAt'],
    leaderboard.map((r) => [r.rank, r.teamId, r.teamName, r.members.map((m) => m.name).join('; '), r.score, r.solves, r.incorrectSubmissions, r.lastSolveAt]),
  );
  const teamsCsv = csv(
    ['teamId', 'teamName', 'members', 'finalScore', 'finalRank'],
    leaderboard.map((r) => [r.teamId, r.teamName, r.members.map((m) => m.name).join('; '), r.score, r.rank]),
  );
  const solvesCsv = csv(
    ['sessionId', 'teamId', 'teamName', 'challengeId', 'challengeName', 'solvedAt', 'elapsedSeconds', 'basePoints', 'awardedPoints', 'solvedByMember'],
    solves.map((s) => [sessionId, s.teamId, s.team.name, s.challengeId, s.challenge.title, s.solvedAt, s.elapsedSeconds, s.basePoints, s.awardedPoints, userName.get(s.solvedByUserId) ?? s.solvedByUserId]),
  );
  const submissionsCsv = csv(
    ['sessionId', 'teamId', 'teamName', 'challengeId', 'submittedAt', 'result', 'awardedPoints', 'player'],
    submissions.map((s) => [sessionId, s.teamId, s.team.name, s.challengeId, s.submittedAt, s.result, s.awardedPoints, s.user.name]),
  );
  const hiddenCsv = csv(
    ['sessionId', 'teamId', 'teamName', 'assignedMember', 'activationAt', 'attemptAt', 'result', 'scoreDelta'],
    hiddenResults.map((h) => {
      const a = assignmentByTeam.get(h.teamId);
      return [sessionId, h.teamId, h.team.name, a?.user.name ?? '', a?.activatedAt ?? null, h.submittedAt, h.correct ? 'CORRECT' : 'INCORRECT', h.scoreDelta];
    }),
  );

  const zip = new JSZip();
  zip.file('session-summary.json', JSON.stringify(summary, null, 2));
  zip.file('leaderboard.csv', leaderboardCsv);
  zip.file('teams.csv', teamsCsv);
  zip.file('solves.csv', solvesCsv);
  zip.file('submissions.csv', submissionsCsv);
  zip.file('hidden-results.csv', hiddenCsv);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  // Safe, deterministic filename derived only from the integer session number.
  const filename = `hexhunt-session-${String(session.sessionNumber).padStart(3, '0')}.zip`;
  return { filename, buffer };
}
