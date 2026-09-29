import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${name}: ${v}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v.toLowerCase() === 'true' || v === '1';
}

function list(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const isTest = process.env.NODE_ENV === 'test';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isTest,
  isProd: process.env.NODE_ENV === 'production',

  port: int('PORT', 4000),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',

  databaseUrl: isTest
    ? req('TEST_DATABASE_URL', process.env.DATABASE_URL)
    : req('DATABASE_URL'),

  jwtSecret: req('JWT_SECRET', isTest ? 'test-jwt-secret-0123456789abcdef0123456789abcdef' : undefined),
  cookieSecret: req('COOKIE_SECRET', isTest ? 'test-cookie-secret-0123456789abcdef0123456789abcdef' : undefined),
  jwtExpiresIn: int('JWT_EXPIRES_IN', 28800), // seconds
  cookieSecure: bool('COOKIE_SECURE', false),
  // SameSite for the session cookie. Use 'lax' for same-site (default). For a
  // cross-site production deploy (player/admin on a different registrable domain
  // than the API) set 'none' AND COOKIE_SECURE=true (HTTPS) so the cookie is
  // sent on cross-site fetch + WebSocket upgrade.
  cookieSameSite: ((): 'lax' | 'strict' | 'none' => {
    const v = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
    return v === 'none' || v === 'strict' ? v : 'lax';
  })(),

  playerOrigin: list('PLAYER_ORIGIN', ['http://localhost:5173']),
  adminOrigin: list('ADMIN_ORIGIN', ['http://localhost:5174']),

  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@doomsday.ctf',
    password: process.env.ADMIN_PASSWORD ?? 'ChangeMe_Admin123!',
    name: process.env.ADMIN_NAME ?? 'Doctor Doom',
  },

  eventName: process.env.EVENT_NAME ?? 'Avengers: Doomsday CTF',

  scoring: {
    decayStepMinutes: int('SCORING_DECAY_STEP_MINUTES', 15),
    decayStepPercent: int('SCORING_DECAY_STEP_PERCENT', 10),
    floorPercent: int('SCORING_FLOOR_PERCENT', 25),
  },

  hidden: {
    reward: int('HIDDEN_REWARD', 500),
    penalty: int('HIDDEN_PENALTY', 400),
    // Fixed activation delay after CTF start (minutes). Default 30 (T+30).
    delayMinutes: int('HIDDEN_LEVEL_DELAY_MINUTES', 30),
  },

  submitRate: {
    max: int('SUBMIT_RATE_MAX', 10),
    windowSeconds: int('SUBMIT_RATE_WINDOW_SECONDS', 60),
  },

  get allowedOrigins(): string[] {
    return Array.from(new Set([...this.playerOrigin, ...this.adminOrigin]));
  },
};

export const COOKIE_NAME = 'doom_session';
