// Backend base URL — configurable at build time via VITE_API_URL.
export const API_BASE = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:4000';

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> ?? {}) };
  if (options.body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // send httpOnly session cookie
    headers,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    req<{ user: any }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  me: () => req<{ user: any }>('/api/auth/me'),

  event: () => req<any>('/api/admin/event'),
  startEvent: () => req<any>('/api/admin/event/start', { method: 'POST' }),
  closeEvent: () => req<any>('/api/admin/event/close', { method: 'POST' }),

  teams: () => req<{ teams: any[] }>('/api/admin/teams'),
  users: () => req<{ users: any[] }>('/api/admin/users'),
  leaderboard: () => req<{ leaderboard: any[] }>('/api/admin/leaderboard'),
  submissions: (limit = 100) => req<{ submissions: any[] }>(`/api/admin/submissions?limit=${limit}`),
  challenges: () => req<{ challenges: any[] }>('/api/admin/challenges'),
  hidden: () => req<{ hidden: any }>('/api/admin/hidden-level'),
  statistics: () => req<{ statistics: any }>('/api/admin/statistics'),
};
