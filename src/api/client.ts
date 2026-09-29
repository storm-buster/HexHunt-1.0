// Player-side API client. All requests include the httpOnly session cookie.
// Backend base URL is configurable via VITE_API_URL (defaults to :4000).
export const API_BASE = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:4000'

export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> ?? {}) }
  // Only advertise a JSON body when one is actually sent (Fastify rejects an
  // empty body with Content-Type: application/json).
  if (options.body != null) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Request failed')
  }
  return body as T
}

export const api = {
  // Auth
  register: (name: string, email: string, password: string) =>
    request<{ user: any }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    request<{ user: any }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: any; team: any; score: number }>('/api/me'),

  // Event
  event: () => request<{ event: any }>('/api/event'),

  // Teams
  team: () => request<{ team: any }>('/api/team'),
  createTeam: (name: string) => request<{ team: any }>('/api/teams', { method: 'POST', body: JSON.stringify({ name }) }),
  joinTeam: (inviteCode: string) => request<{ team: any }>('/api/teams/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }),

  // Challenges
  challenges: () => request<{ challenges: any[] }>('/api/challenges'),
  challenge: (id: string) => request<{ challenge: any }>(`/api/challenges/${id}`),
  progress: () => request<{ progress: any }>('/api/progress'),
  portalCheck: (id: string, answer: string) =>
    request<{ correct: boolean }>(`/api/challenges/${id}/portal-check`, { method: 'POST', body: JSON.stringify({ answer }) }),

  // Submissions
  submit: (challengeId: string, flag: string) =>
    request<{ result: string; awardedPoints?: number }>('/api/submissions', { method: 'POST', body: JSON.stringify({ challengeId, flag }) }),

  // Leaderboard
  leaderboard: () => request<{ leaderboard: any[] }>('/api/leaderboard'),

  // Hidden level + final boss
  hidden: () => request<{ hidden: any }>('/api/hidden-level'),
  hiddenSubmit: (answer: string) =>
    request<{ result: string; scoreDelta: number }>('/api/hidden-level/submit', { method: 'POST', body: JSON.stringify({ answer }) }),
  finalBoss: () => request<{ finalBoss: any }>('/api/final-boss'),
}
