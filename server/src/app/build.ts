import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { config, COOKIE_NAME } from '../config/index.js';
import { errorHandler } from '../middleware/errors.js';

import { authRoutes } from '../auth/auth.routes.js';
import { meRoutes } from '../users/me.routes.js';
import { teamRoutes } from '../teams/team.routes.js';
import { eventRoutes } from '../events/event.routes.js';
import { challengeRoutes } from '../challenges/challenge.routes.js';
import { submissionRoutes } from '../submissions/submission.routes.js';
import { leaderboardRoutes } from '../leaderboard/leaderboard.routes.js';
import { hiddenRoutes } from '../hidden/hidden.routes.js';
import { adminRoutes } from '../admin/admin.routes.js';
import { realtimeRoutes } from '../realtime/realtime.routes.js';
import { artifactRoutes } from '../challenges/artifacts.routes.js';
import { telemetryRoutes } from '../anticheat/telemetry.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.logLevel,
          // Never log secrets / auth headers / cookies.
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
    trustProxy: true,
  });

  app.setErrorHandler(errorHandler);

  // ── Security & platform plugins ───────────────────────────
  await app.register(cors, {
    // Explicit allow-list; credentials require a specific origin (never "*").
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl / server-to-server
      if (config.allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(cookie, { secret: config.cookieSecret });

  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: COOKIE_NAME, signed: false },
    sign: { expiresIn: config.jwtExpiresIn },
  });

  await app.register(rateLimit, {
    global: false, // opt-in per route
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(websocket);

  // ── Health ────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // ── Realtime (WS) ────────────────────────────────────────
  await app.register(realtimeRoutes);

  // ── Public challenge artifacts (puzzle material; no secrets) ──
  await app.register(artifactRoutes);

  // ── Player API ────────────────────────────────────────────
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(meRoutes);
      await api.register(eventRoutes);
      await api.register(teamRoutes);
      await api.register(challengeRoutes);
      await api.register(submissionRoutes);
      await api.register(leaderboardRoutes);
      await api.register(hiddenRoutes);
      await api.register(telemetryRoutes);
    },
    { prefix: '/api' },
  );

  // ── Admin API ─────────────────────────────────────────────
  await app.register(adminRoutes, { prefix: '/api/admin' });

  return app;
}
