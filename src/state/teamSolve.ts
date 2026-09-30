// Pure, idempotent reducer for a team-wide solve event. Kept separate so it can
// be unit-tested without the full context / network. Applying the same event
// twice must not double the score or corrupt state.

export interface ServerChallengeState {
  solved: boolean
  locked: boolean
}
export type ServerMap = Record<string, ServerChallengeState>

export interface TeamSolvePayload {
  challengeId: string
  scoreAwarded?: number
  teamScore?: number
}

export function applyTeamChallengeSolved(
  server: ServerMap,
  score: number,
  payload: TeamSolvePayload,
): { server: ServerMap; score: number } {
  const id = payload.challengeId
  const prev = server[id]
  // Mark solved (and therefore accessible). Idempotent: solved stays true.
  const nextServer: ServerMap = {
    ...server,
    [id]: { locked: false, solved: true, ...(prev ? {} : {}) },
  }
  // Use the authoritative team score from the event when provided (absolute
  // value, never incremented → safe to apply repeatedly).
  const nextScore = typeof payload.teamScore === 'number' ? payload.teamScore : score
  return { server: nextServer, score: nextScore }
}
