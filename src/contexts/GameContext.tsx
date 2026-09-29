import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { challenges, type ChallengeData, type Stone, type Universe } from '../data/challenges'
import { api, ApiError } from '../api/client'

// ── Types ───────────────────────────────────────────────────
interface Participant {
  id: string
  name: string
  email: string
}

interface TeamView {
  id: string
  name: string
  inviteCode: string | null
  members: { id: string; name: string; role: string }[]
  memberCount: number
}

interface EventView {
  status: 'NOT_STARTED' | 'LIVE' | 'CLOSED'
  startedAt: string | null
  closedAt: string | null
  serverTime: string
  hidden: { activated: boolean; activatedAt: string | null }
}

interface HiddenView {
  activated: boolean
  available: boolean
  challenge: { id: string; title: string; description: string; narrative: string; clueContent?: any; hints?: string[]; reward: number; penalty: number } | null
  attempted: boolean
  result: { correct: boolean; scoreDelta: number } | null
  warning: string | null
}

interface GameState {
  loading: boolean
  authenticated: boolean
  participant: Participant | null
  team: TeamView | null
  score: number
  stones: Stone[]
  /** id -> { solved, locked } derived from the backend */
  server: Record<string, { solved: boolean; locked: boolean }>
  /** local, non-authoritative UI counters */
  progress: Record<string, { solved: boolean; attempts: number; hintsUsed: number }>
  event: EventView | null
  hidden: HiddenView | null
}

const UNIVERSE_ORDER: Universe[] = ['webverse', 'osintverse', 'darknet']

// ── Context value ───────────────────────────────────────────
interface GameContextValue {
  state: GameState
  // auth / team
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  createTeam: (name: string) => Promise<void>
  joinTeam: (inviteCode: string) => Promise<void>
  refresh: () => Promise<void>
  // gameplay (backend-authoritative)
  submitFlag: (challengeId: string, value: string) => Promise<'correct' | 'incorrect' | 'duplicate' | 'locked' | 'not_live'>
  checkPortal: (challengeId: string, answer: string) => Promise<boolean>
  submitHidden: (answer: string) => Promise<{ correct: boolean; scoreDelta: number }>
  solveChallenge: (challengeId: string) => Promise<void>
  recordWrong: (challengeId: string, portalId: string) => void
  useHint: (challengeId: string) => void
  resetLocalUi: () => void
  // selectors (kept from the original interface)
  getChallenge: (id: string) => ChallengeData | undefined
  getProgress: (id: string) => { solved: boolean; attempts: number; hintsUsed: number } | undefined
  isStoneCollected: (s: Stone) => boolean
  isUniverseUnlocked: (u: Universe) => boolean
  isChallengeUnlocked: (challengeId: string) => boolean
  isChallengeSolved: (id: string) => boolean
  getNextChallenge: (id: string) => ChallengeData | undefined
}

const GameContext = createContext<GameContextValue | null>(null)

const initialState: GameState = {
  loading: true,
  authenticated: false,
  participant: null,
  team: null,
  score: 0,
  stones: [],
  server: {},
  progress: {},
  event: null,
  hidden: null,
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(initialState)
  const localUi = useRef<Record<string, { attempts: number; hintsUsed: number }>>({})

  const loadAll = useCallback(async () => {
    // Event status is public.
    let event: EventView | null = null
    try {
      event = (await api.event()).event
    } catch {
      /* backend unreachable — leave null */
    }

    let authed = false
    let participant: Participant | null = null
    let team: TeamView | null = null
    let score = 0
    const server: Record<string, { solved: boolean; locked: boolean }> = {}
    let stones: Stone[] = []
    let hidden: HiddenView | null = null

    try {
      const me = await api.me()
      authed = true
      participant = { id: me.user.id, name: me.user.name, email: me.user.email }
      team = me.team
      score = me.score
    } catch {
      authed = false
    }

    if (authed && team) {
      try {
        const { challenges: list } = await api.challenges()
        for (const c of list) server[c.id] = { solved: !!c.solved, locked: !!c.locked }
      } catch {
        /* ignore */
      }
      try {
        const { progress } = await api.progress()
        stones = (progress.stones ?? []) as Stone[]
        score = typeof progress.score === 'number' ? progress.score : score
      } catch {
        /* ignore */
      }
      try {
        hidden = (await api.hidden()).hidden
      } catch {
        /* ignore */
      }
    }

    // Merge local UI counters
    const progress: GameState['progress'] = {}
    for (const id of Object.keys(server)) {
      const ui = localUi.current[id] ?? { attempts: 0, hintsUsed: 0 }
      progress[id] = { solved: server[id].solved, attempts: ui.attempts, hintsUsed: ui.hintsUsed }
    }

    setState({
      loading: false,
      authenticated: authed,
      participant,
      team,
      score,
      stones,
      server,
      progress,
      event,
      hidden,
    })
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Poll event + hidden state periodically so LIVE / hidden activation appear
  // without a manual refresh (server is authoritative).
  useEffect(() => {
    const t = setInterval(() => {
      void (async () => {
        try {
          const event = (await api.event()).event
          setState((s) => ({ ...s, event }))
        } catch {
          /* ignore */
        }
        if (state.authenticated && state.team) {
          try {
            const hidden = (await api.hidden()).hidden
            setState((s) => ({ ...s, hidden }))
          } catch {
            /* ignore */
          }
        }
      })()
    }, 10000)
    return () => clearInterval(t)
  }, [state.authenticated, state.team])

  const refresh = useCallback(() => loadAll(), [loadAll])

  const login = useCallback(async (email: string, password: string) => {
    await api.login(email, password)
    await loadAll()
  }, [loadAll])

  const register = useCallback(async (name: string, email: string, password: string) => {
    await api.register(name, email, password)
    await loadAll()
  }, [loadAll])

  const logout = useCallback(async () => {
    try { await api.logout() } catch { /* ignore */ }
    localUi.current = {}
    await loadAll()
  }, [loadAll])

  const createTeam = useCallback(async (name: string) => {
    await api.createTeam(name)
    await loadAll()
  }, [loadAll])

  const joinTeam = useCallback(async (inviteCode: string) => {
    await api.joinTeam(inviteCode)
    await loadAll()
  }, [loadAll])

  const submitFlag = useCallback(
    async (challengeId: string, value: string) => {
      try {
        const res = await api.submit(challengeId, value)
        if (res.result === 'correct') {
          await loadAll()
          return 'correct' as const
        }
        return 'incorrect' as const
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === 'ALREADY_SOLVED') { await loadAll(); return 'duplicate' as const }
          if (e.code === 'CHALLENGE_LOCKED') return 'locked' as const
          if (e.code === 'EVENT_NOT_LIVE') return 'not_live' as const
        }
        return 'incorrect' as const
      }
    },
    [loadAll],
  )

  const checkPortal = useCallback(async (challengeId: string, answer: string) => {
    try {
      const { correct } = await api.portalCheck(challengeId, answer)
      return correct
    } catch {
      return false
    }
  }, [])

  const submitHidden = useCallback(async (answer: string) => {
    const res = await api.hiddenSubmit(answer)
    await loadAll()
    return { correct: res.result === 'correct', scoreDelta: res.scoreDelta }
  }, [loadAll])

  const solveChallenge = useCallback(async (_challengeId: string) => {
    await loadAll()
  }, [loadAll])

  const recordWrong = useCallback((challengeId: string, _portalId: string) => {
    const ui = localUi.current[challengeId] ?? { attempts: 0, hintsUsed: 0 }
    ui.attempts += 1
    localUi.current[challengeId] = ui
    setState((s) => ({
      ...s,
      progress: { ...s.progress, [challengeId]: { ...(s.progress[challengeId] ?? { solved: false, attempts: 0, hintsUsed: 0 }), attempts: ui.attempts } },
    }))
  }, [])

  const useHint = useCallback((challengeId: string) => {
    const ui = localUi.current[challengeId] ?? { attempts: 0, hintsUsed: 0 }
    ui.hintsUsed += 1
    localUi.current[challengeId] = ui
  }, [])

  const resetLocalUi = useCallback(() => { localUi.current = {} }, [])

  // ── Selectors ─────────────────────────────────────────────
  const getChallenge = useCallback((id: string) => challenges.find((c) => c.id === id), [])
  const getProgress = useCallback((id: string) => state.progress[id], [state.progress])
  const isStoneCollected = useCallback((s: Stone) => state.stones.includes(s), [state.stones])
  const isChallengeSolved = useCallback((id: string) => state.server[id]?.solved === true, [state.server])
  const isChallengeUnlocked = useCallback(
    (id: string) => state.server[id] !== undefined && state.server[id].locked === false,
    [state.server],
  )
  const isUniverseUnlocked = useCallback(
    (u: Universe) => {
      const first = challenges.find((c) => c.universe === u)
      if (!first) return false
      // The universe's first challenge being unlocked means the universe is open.
      const firstOfUniverse = challenges.filter((c) => c.universe === u)[0]
      return firstOfUniverse ? state.server[firstOfUniverse.id]?.locked === false : false
    },
    [state.server],
  )
  const getNextChallenge = useCallback((id: string) => {
    const ch = challenges.find((c) => c.id === id)
    if (!ch || !ch.nextChallengeId) return undefined
    return challenges.find((c) => c.id === ch.nextChallengeId)
  }, [])

  const value: GameContextValue = {
    state,
    login, register, logout, createTeam, joinTeam, refresh,
    submitFlag, checkPortal, submitHidden, solveChallenge, recordWrong, useHint, resetLocalUi,
    getChallenge, getProgress, isStoneCollected, isUniverseUnlocked,
    isChallengeUnlocked, isChallengeSolved, getNextChallenge,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside GameProvider')
  return ctx
}

// Keep the UNIVERSE_ORDER export for potential consumers.
export { UNIVERSE_ORDER }
