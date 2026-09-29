# DEPLOYMENT (no Docker)

Node.js + PostgreSQL only. Three deployables: **backend API** (`server/`),
**player frontend** (repo root), **admin dashboard** (`admin-dashboard/`).

## 1. Backend (`server/`)
```bash
cd server
cp .env.example .env      # fill in real secrets (see §4)
npm ci
npm run prisma:generate
npm run migrate            # prisma migrate deploy (applies committed migrations)
npm run seed               # admin + event + 14 challenges
npm run admin:reset        # (optional) force admin password from ADMIN_PASSWORD
npm run build
node dist/server.js        # run under systemd / pm2
```
Health: `GET /health`.

## 2. Player frontend (repo root)
```bash
npm ci
# Point the SPA at the deployed API (NOT localhost) at build time:
VITE_API_URL="https://api.example.com" npm run build
# serve dist/ from any static host; rewrite unknown paths → index.html (SPA)
```

## 3. Admin dashboard (`admin-dashboard/`)
```bash
cd admin-dashboard
npm ci
VITE_API_URL="https://api.example.com" npm run build
# serve dist/ from any static host
```
The admin WebSocket URL is derived from `VITE_API_URL` (`http→ws`, `https→wss`).

## 4. Required environment variables (backend `.env`)
| Var | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection (required) |
| `TEST_DATABASE_URL` | only for `npm test` |
| `PORT`, `HOST`, `NODE_ENV`, `LOG_LEVEL` | server basics; set `NODE_ENV=production` |
| `JWT_SECRET`, `COOKIE_SECRET` | long random strings — **required, no defaults in prod** |
| `JWT_EXPIRES_IN` | seconds (default 8h) |
| `COOKIE_SECURE` | **`true` in production (HTTPS)** |
| `COOKIE_SAMESITE` | `lax` same-site; **`none` for cross-site** (see §5) |
| `PLAYER_ORIGIN`, `ADMIN_ORIGIN` | exact deployed origins (CORS allow-list; never `*`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | **set a real ADMIN_PASSWORD — never ship `ChangeMe_Admin123!`** |
| `EVENT_NAME` | display name |
| `SCORING_DECAY_STEP_MINUTES/PERCENT`, `SCORING_FLOOR_PERCENT` | scoring policy |
| `HIDDEN_REWARD`, `HIDDEN_PENALTY`, `HIDDEN_LEVEL_DELAY_MINUTES` | hidden level (+500/−400, T+30) |
| `SUBMIT_RATE_MAX`, `SUBMIT_RATE_WINDOW_SECONDS` | submission rate limit |

Never commit `.env` (git-ignored). `.env.example` holds placeholders only. No
secret is returned by any API or written to logs (auth headers/cookies redacted).

## 5. Cross-origin / cross-site cookies + WebSocket (IMPORTANT)
Auth uses an httpOnly cookie sent with `credentials: 'include'` (fetch) and on
the WS upgrade. CORS is an explicit allow-list (`PLAYER_ORIGIN`, `ADMIN_ORIGIN`).

- **Same-site** (player/admin share the API's registrable domain, e.g.
  `app.example.com` + `api.example.com`): keep `COOKIE_SAMESITE=lax`.
- **Cross-site** (player/admin on a *different* registrable domain than the API):
  set **`COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`** and serve everything
  over **HTTPS/WSS**. Otherwise browsers drop the cookie on cross-site fetch and
  on the `wss://…/ws/admin` handshake, and auth (incl. the admin dashboard WS)
  will fail. This is configurable now; no code change needed.

## 6. Challenge artifact URLs (webverse/osint) — content note
The webverse/osint clues embed the artifact URL as `http://localhost:4000/...`
(hex-encoded for wv, plaintext for os). For a non-localhost API host these clue
URLs must be regenerated to the deployed API origin. They live only in
`server/src/challenges/challenge-data.ts` (`clueContent`) and the player
`src/data/challenges.ts`; update both to the production API base and rebuild +
reseed. This is the only place a host is baked into content (all app API/WS URLs
are configurable via `VITE_API_URL`). Not an auth/runtime failure — a content
fix required only if the API host differs from `localhost:4000`.

## 7. Database
- Migrations are committed under `server/prisma/migrations`; `npm run migrate`
  (`prisma migrate deploy`) applies them. `npm run seed` is idempotent (upserts).
- No development DB assumptions; connection comes from `DATABASE_URL`.

## 8. No Docker
Runs directly on the host: Node process (backend) + static hosting (player,
admin) + a PostgreSQL instance. Use a process manager (systemd/pm2) for the API.
