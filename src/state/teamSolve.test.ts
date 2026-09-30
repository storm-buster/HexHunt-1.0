import { describe, it, expect } from 'vitest'
import { applyTeamChallengeSolved, type ServerMap } from './teamSolve'

describe('applyTeamChallengeSolved (realtime team solve)', () => {
  const base: ServerMap = {
    'wv-01': { solved: false, locked: false },
    'wv-02': { solved: false, locked: true },
  }

  it('marks the challenge solved and unlocked', () => {
    const { server } = applyTeamChallengeSolved(base, 0, { challengeId: 'wv-01', teamScore: 90 })
    expect(server['wv-01'].solved).toBe(true)
    expect(server['wv-01'].locked).toBe(false)
    // other entries untouched
    expect(server['wv-02'].solved).toBe(false)
  })

  it('updates score to the authoritative team score', () => {
    const { score } = applyTeamChallengeSolved(base, 0, { challengeId: 'wv-01', teamScore: 90 })
    expect(score).toBe(90)
  })

  it('is idempotent — applying the same event twice does not double the score', () => {
    const first = applyTeamChallengeSolved(base, 0, { challengeId: 'wv-01', teamScore: 90 })
    const second = applyTeamChallengeSolved(first.server, first.score, { challengeId: 'wv-01', teamScore: 90 })
    expect(second.score).toBe(90) // not 180
    expect(second.server['wv-01'].solved).toBe(true)
    // no duplicate keys / corruption
    expect(Object.keys(second.server).sort()).toEqual(['wv-01', 'wv-02'])
  })

  it('leaves score unchanged when the event omits teamScore', () => {
    const { score } = applyTeamChallengeSolved(base, 150, { challengeId: 'wv-01' })
    expect(score).toBe(150)
  })
})
