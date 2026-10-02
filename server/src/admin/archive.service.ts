import JSZip from 'jszip';
import type { EventSession } from '@prisma/client';
import { prisma } from '../db/prisma.js';

// ── CSV helpers (RFC-4180-ish quoting) ──────────────────────
function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n') + '\n';
}

// The immutable snapshot payload stored in SessionArchive.data. Contains NO
// password hashes, tokens, flags, or answers.
export interface SessionSnapshot {
  session: {
    sessionNumber: number;
    eventName: string;
    startedAt: string;
    completedAt: string;
    durationSeconds: number;
    hiddenActivated: boolean;
    hiddenActivationAt: string | null;
  };
  participants: { id: string; name: string; email: string; team: string | null; registeredAt: string }[];
  teams: { id: string; name: string; inviteCode: string; memberCount: number; members: { name: string; email: string; role: string }[]; score: number; solveCount: number }[];
  leaderboard: { rank: number; teamId: string; teamName: string; members: string[]; score: number; solves: number; incorrectSubmissions: number; hiddenDelta: number; lastSolveAt: string | null }[];
  solves: { teamId: string; teamName: string; challengeId: string; challengeTitle: string; solvedByMember: string; solvedAt: string; elapsedSeconds: number; basePoints: number; awardedPoints: number }[];
  submissions: { teamId: string; teamName: string; challengeId: string; player: string; result: string; awardedPoints: number; submittedAt: string }[];
  hiddenResults: { teamId: string; teamName: string; assignedMember: string | null; activationAt: string | null; attemptAt: string; result: string; scoreDelta: number }[];
  stats: {
    numberOfUsers: number; numberOfTeams: number; totalSolves: number; totalSubmissions: number;
    correctSubmissions: number; incorrectSubmissions: number; highestScore: number;
    hidden: { attempts: number; correct: number; incorrect: number };
  };
}

export interface BuiltSnapshot {
  snapshot: SessionSnapshot;
  scalars: {
    sessionNumber: number; eventName: string; startedAt: Date; completedAt: Date; durationSeconds: number;
    numberOfUsers: number; numberOfTeams: number; totalSolves: number; totalSubmissions: number;
    highestScore: number; hiddenAttempts: number; hiddenCorrect: number; hiddenIncorrect: number;
  };
}

// Build the complete immutable snapshot of a LIVE session's data. Called at STOP
// BEFORE the live tables are wiped. Reads only; performs no deletes.
export async function buildSessionSnapshot(session: EventSession, eventName: string): Promise<BuiltSnapshot> {
  const sessionId = session.id;
  const completedAt = session.completedAt ?? new Date();

  const [players, teams, solves, submissions, assignments, hiddenResults] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'PLAYER' },
      include: { membership: { include: { team: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.team.findMany({
      include: {
        memberships: { include: { user: { select: { id: true, name: true, email: true } } } },
        solves: { where: { sessionId }, include: { challenge: { select: { title: true } } } },
        submissions: { where: { sessionId } },
        hiddenResults: { where: { sessionId } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.solve.findMany({ where: { sessionId }, include: { team: { select: { name: true } }, challenge: { select: { title: true } } }, orderBy: { solvedAt: 'asc' } }),
    prisma.submission.findMany({ where: { sessionId }, include: { team: { select: { name: true } }, user: { select: { name: true } }, challenge: { select: { title: true } } }, orderBy: { submittedAt: 'asc' } }),
    prisma.hiddenLevelAssignment.findMany({ where: { sessionId }, include: { user: { select: { name: true } } } }),
    prisma.hiddenLevelResult.findMany({ where: { sessionId }, include: { team: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }),
  ]);

  const userName = new Map(players.map((u) => [u.id, u.name]));
  const assignmentByTeam = new Map(assignments.map((a) => [a.teamId, a]));

  // Leaderboard (computed from this session's live rows, same rules as live).
  const lbRows = teams.map((t) => {
    const score = t.solves.reduce((s, x) => s + x.awardedPoints, 0) + (t.hiddenResults[0]?.scoreDelta ?? 0);
    const lastSolveAt = t.solves.length > 0 ? t.solves.reduce<Date>((m, s) => (s.solvedAt > m ? s.solvedAt : m), t.solves[0].solvedAt) : null;
    return {
      teamId: t.id, teamName: t.name, members: t.memberships.map((m) => m.user.name),
      score, solves: t.solves.length, hiddenDelta: t.hiddenResults[0]?.scoreDelta ?? 0,
      incorrectSubmissions: t.submissions.filter((s) => s.result === 'INCORRECT').length,
      lastSolveAt,
    };
  });
  lbRows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const at = a.lastSolveAt ? a.lastSolveAt.getTime() : Number.POSITIVE_INFINITY;
    const bt = b.lastSolveAt ? b.lastSolveAt.getTime() : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.teamName.localeCompare(b.teamName);
  });

  const correctSubmissions = submissions.filter((s) => s.result === 'CORRECT').length;
  const hiddenCorrect = hiddenResults.filter((h) => h.correct).length;

  const snapshot: SessionSnapshot = {
    session: {
      sessionNumber: session.sessionNumber,
      eventName,
      startedAt: session.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds: Math.max(0, Math.round((completedAt.getTime() - session.startedAt.getTime()) / 1000)),
      hiddenActivated: session.hiddenActivated,
      hiddenActivationAt: session.hiddenActivationAt ? session.hiddenActivationAt.toISOString() : null,
    },
    participants: players.map((u) => ({ id: u.id, name: u.name, email: u.email, team: u.membership?.team.name ?? null, registeredAt: u.createdAt.toISOString() })),
    teams: teams.map((t) => ({
      id: t.id, name: t.name, inviteCode: t.inviteCode, memberCount: t.memberships.length,
      members: t.memberships.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role })),
      score: t.solves.reduce((s, x) => s + x.awardedPoints, 0) + (t.hiddenResults[0]?.scoreDelta ?? 0),
      solveCount: t.solves.length,
    })),
    leaderboard: lbRows.map((r, i) => ({
      rank: i + 1, teamId: r.teamId, teamName: r.teamName, members: r.members, score: r.score,
      solves: r.solves, incorrectSubmissions: r.incorrectSubmissions, hiddenDelta: r.hiddenDelta,
      lastSolveAt: r.lastSolveAt ? r.lastSolveAt.toISOString() : null,
    })),
    solves: solves.map((s) => ({
      teamId: s.teamId, teamName: s.team.name, challengeId: s.challengeId, challengeTitle: s.challenge.title,
      solvedByMember: userName.get(s.solvedByUserId) ?? s.solvedByUserId, solvedAt: s.solvedAt.toISOString(),
      elapsedSeconds: s.elapsedSeconds, basePoints: s.basePoints, awardedPoints: s.awardedPoints,
    })),
    submissions: submissions.map((s) => ({
      teamId: s.teamId, teamName: s.team.name, challengeId: s.challengeId, player: s.user.name,
      result: s.result, awardedPoints: s.awardedPoints, submittedAt: s.submittedAt.toISOString(),
    })),
    hiddenResults: hiddenResults.map((h) => ({
      teamId: h.teamId, teamName: h.team.name,
      assignedMember: assignmentByTeam.get(h.teamId)?.user.name ?? null,
      activationAt: assignmentByTeam.get(h.teamId)?.activatedAt.toISOString() ?? null,
      attemptAt: h.submittedAt.toISOString(), result: h.correct ? 'CORRECT' : 'INCORRECT', scoreDelta: h.scoreDelta,
    })),
    stats: {
      numberOfUsers: players.length, numberOfTeams: teams.length, totalSolves: solves.length,
      totalSubmissions: submissions.length, correctSubmissions, incorrectSubmissions: submissions.length - correctSubmissions,
      highestScore: lbRows[0]?.score ?? 0,
      hidden: { attempts: hiddenResults.length, correct: hiddenCorrect, incorrect: hiddenResults.length - hiddenCorrect },
    },
  };

  return {
    snapshot,
    scalars: {
      sessionNumber: session.sessionNumber,
      eventName,
      startedAt: session.startedAt,
      completedAt,
      durationSeconds: snapshot.session.durationSeconds,
      numberOfUsers: players.length,
      numberOfTeams: teams.length,
      totalSolves: solves.length,
      totalSubmissions: submissions.length,
      highestScore: lbRows[0]?.score ?? 0,
      hiddenAttempts: hiddenResults.length,
      hiddenCorrect,
      hiddenIncorrect: hiddenResults.length - hiddenCorrect,
    },
  };
}

// Next session number is derived solely from immutable archives (monotonic).
export async function nextSessionNumber(): Promise<number> {
  const top = await prisma.sessionArchive.findFirst({ orderBy: { sessionNumber: 'desc' } });
  return (top?.sessionNumber ?? 0) + 1;
}

// ── History listing (admin) ─────────────────────────────────
export async function listArchives() {
  const archives = await prisma.sessionArchive.findMany({ orderBy: { sessionNumber: 'desc' } });
  return archives.map((a) => ({
    id: a.id,
    sessionNumber: a.sessionNumber,
    status: 'COMPLETED' as const,
    startedAt: a.startedAt,
    completedAt: a.completedAt,
    durationSeconds: a.durationSeconds,
    teamsParticipating: a.numberOfTeams,
    numberOfUsers: a.numberOfUsers,
    totalSolves: a.totalSolves,
    totalSubmissions: a.totalSubmissions,
    highestScore: a.highestScore,
  }));
}

export async function getArchiveDetail(id: string) {
  const a = await prisma.sessionArchive.findUnique({ where: { id } });
  if (!a) return null;
  const data = a.data as unknown as SessionSnapshot;
  return {
    id: a.id,
    sessionNumber: a.sessionNumber,
    status: 'COMPLETED' as const,
    startedAt: a.startedAt,
    completedAt: a.completedAt,
    durationSeconds: a.durationSeconds,
    leaderboard: data.leaderboard,
    hiddenResults: data.hiddenResults,
    stats: data.stats,
  };
}

// ── Export a session archive as a ZIP (admin-only) ──────────
export interface ArchiveExport { filename: string; buffer: Buffer }

export async function buildArchiveExport(id: string): Promise<ArchiveExport | null> {
  const a = await prisma.sessionArchive.findUnique({ where: { id } });
  if (!a) return null;
  const data = a.data as unknown as SessionSnapshot;

  const summary = {
    sessionNumber: a.sessionNumber,
    eventName: a.eventName,
    status: 'COMPLETED',
    startedAt: a.startedAt.toISOString(),
    completedAt: a.completedAt.toISOString(),
    durationSeconds: a.durationSeconds,
    numberOfUsers: a.numberOfUsers,
    numberOfTeams: a.numberOfTeams,
    totalSolves: a.totalSolves,
    totalSubmissions: a.totalSubmissions,
    highestScore: a.highestScore,
    hiddenLevel: { attempts: a.hiddenAttempts, correct: a.hiddenCorrect, incorrect: a.hiddenIncorrect },
    generatedAt: new Date().toISOString(),
  };

  const participantsCsv = csv(
    ['name', 'email', 'team', 'registeredAt'],
    data.participants.map((p) => [p.name, p.email, p.team, p.registeredAt]),
  );
  const teamsCsv = csv(
    ['teamId', 'teamName', 'members', 'memberCount', 'score', 'solveCount'],
    data.teams.map((t) => [t.id, t.name, t.members.map((m) => m.name).join('; '), t.memberCount, t.score, t.solveCount]),
  );
  const leaderboardCsv = csv(
    ['rank', 'teamId', 'teamName', 'members', 'finalScore', 'solves', 'incorrectSubmissions', 'hiddenDelta', 'lastSolveAt'],
    data.leaderboard.map((r) => [r.rank, r.teamId, r.teamName, r.members.join('; '), r.score, r.solves, r.incorrectSubmissions, r.hiddenDelta, r.lastSolveAt]),
  );
  const solvesCsv = csv(
    ['teamId', 'teamName', 'challengeId', 'challengeName', 'solvedByMember', 'solvedAt', 'elapsedSeconds', 'basePoints', 'awardedPoints'],
    data.solves.map((s) => [s.teamId, s.teamName, s.challengeId, s.challengeTitle, s.solvedByMember, s.solvedAt, s.elapsedSeconds, s.basePoints, s.awardedPoints]),
  );
  const submissionsCsv = csv(
    ['teamId', 'teamName', 'challengeId', 'player', 'result', 'awardedPoints', 'submittedAt'],
    data.submissions.map((s) => [s.teamId, s.teamName, s.challengeId, s.player, s.result, s.awardedPoints, s.submittedAt]),
  );
  const hiddenCsv = csv(
    ['teamId', 'teamName', 'assignedMember', 'activationAt', 'attemptAt', 'result', 'scoreDelta'],
    data.hiddenResults.map((h) => [h.teamId, h.teamName, h.assignedMember, h.activationAt, h.attemptAt, h.result, h.scoreDelta]),
  );

  const zip = new JSZip();
  zip.file('session-summary.json', JSON.stringify(summary, null, 2));
  zip.file('participants.csv', participantsCsv);
  zip.file('teams.csv', teamsCsv);
  zip.file('leaderboard.csv', leaderboardCsv);
  zip.file('solves.csv', solvesCsv);
  zip.file('submissions.csv', submissionsCsv);
  zip.file('hidden-results.csv', hiddenCsv);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const filename = `hexhunt-session-${String(a.sessionNumber).padStart(3, '0')}.zip`;
  return { filename, buffer };
}
