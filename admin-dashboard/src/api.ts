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

  // ── Session history + export ──────────────────────────────
  sessions: () => req<{ sessions: any[] }>('/api/admin/sessions'),
  sessionDetail: (id: string) => req<{ session: any }>(`/api/admin/sessions/${id}`),

  // Downloads the session export ZIP via the browser (admin-only on the server).
  exportSession: async (id: string, fallbackName: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/admin/sessions/${id}/export`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) {
      let message = `Export failed (${res.status})`;
      try {
        const body = await res.json();
        message = body?.error?.message ?? message;
      } catch { /* non-JSON */ }
      throw new Error(message);
    }
    // Prefer the server-provided filename from Content-Disposition.
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] ?? fallbackName;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
