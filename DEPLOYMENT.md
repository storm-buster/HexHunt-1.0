# DEPLOYMENT — HexHunt 1.0 on Render (NO DOCKER)

Native runtimes only: a Node **Web Service** (API), two **Static Sites**
(player, admin), and a managed **PostgreSQL**. A `render.yaml` Blueprint at the
repo root describes all four. No Dockerfiles are used.

Repo: `https://github.com/storm-buster/HexHunt-1.0.git` (branch `main`).

## Topology (placeholders — set real URLs after first deploy)
```
Player  https://<player-domain>   ──fetch(credentials)──►  API  https://<api-domain>
Admin   https://<admin-domain>    ──fetch + WebSocket───►  API  https://<api-domain>/ws/admin
                                                            │
                                                            ▼
                                                 PostgreSQL (managed by Render)
```
`*.onrender.com` subdomains are **cross-site** to each other, so the session
cookie must be `SameSite=None; Secure` (set in the Blueprint) and everything must
be HTTPS/WSS.

---

## A. Dev vs Production commands (do not mix)
| Purpose | Development | Production |
| --- | --- | --- |
| Migrations | `npm run migrate:dev` (creates) | `npm run migrate` = `prisma migrate deploy` (applies only) |
| Seed | `npm run seed` | `npm run seed` (once, manually; idempotent upsert) |
| Admin reset | `npm run admin:reset` | `npm run admin:reset` (uses `ADMIN_PASSWORD`) |
| Start | `npm run dev` | `node dist/server.js` (via `npm start`) |
**Never run `prisma migrate reset` or `migrate dev` against the production DB.**

---

## B. Render deployment procedure

1. **Create a Render account** and connect your GitHub account.
2. **Connect the repository** `storm-buster/HexHunt-1.0`.
3. **Blueprint deploy:** New + → *Blueprint* → pick this repo → Render reads
   `render.yaml` and provisions: `hexhunt-db` (Postgres), `hexhunt-api` (web),
   `hexhunt-player` (static), `hexhunt-admin` (static).
4. **PostgreSQL** (`hexhunt-db`) is created automatically; `DATABASE_URL` is
   injected into the API via `fromDatabase` (no manual connection string).
5. **Backend build** runs automatically:
   `npm ci && npm run prisma:generate && npm run build && npm run migrate`
   (`migrate` = `prisma migrate deploy` — applies committed migrations only).
   Start command: `node dist/server.js`. Health check: `/health`.
6. **Set the API secrets/vars** on `hexhunt-api` (the `sync: false` ones):
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (**strong, required** — the app refuses the
     insecure default in production and fails safe if unset).
   - `PLAYER_ORIGIN` = `https://<player-domain>`, `ADMIN_ORIGIN` = `https://<admin-domain>`.
   - `PUBLIC_API_URL` = `https://<api-domain>` and `ARTIFACT_BASE_URL` = same.
   `JWT_SECRET`/`COOKIE_SECRET` are auto-generated; `COOKIE_SECURE=true` and
   `COOKIE_SAMESITE=none` are preset for cross-site.
7. **Seed the database (one-time):** open the `hexhunt-api` service → *Shell* →
   `npm run seed`. Idempotent (upserts admin + event + 14 challenges). Because
   `PUBLIC_API_URL`/`ARTIFACT_BASE_URL` are now set, the seeded artifact clue URLs
   point at the real API. (Re-run seed if you change those origins later.)
8. **Provision/verify admin:** in the same Shell, `npm run admin:reset`
   (sets the admin password hash from `ADMIN_PASSWORD`; prints success, never the
   password).
9. **CORS origins:** confirm `PLAYER_ORIGIN`/`ADMIN_ORIGIN` exactly match the
   static site URLs (no trailing slash). They form the CORS allow-list (never `*`).
10. **Player static site** (`hexhunt-player`): build `npm ci && npm run build`,
    publish `dist`, SPA rewrite `/* → /index.html`. Set **`VITE_API_URL` =
    `https://<api-domain>`** (build-time), then trigger a deploy so the bundle
    (and its artifact clue URLs) point at the API.
11. **Admin static site** (`hexhunt-admin`): same build/publish/rewrite. Set
    **`VITE_API_URL` = `https://<api-domain>`**, then redeploy.
12. **VITE_API_URL** is a *build-time* value for static sites — you must redeploy
    the frontends after changing it.
13. **Artifact base URL:** ensured by `PUBLIC_API_URL`/`ARTIFACT_BASE_URL` (API,
    re-seed) and `VITE_API_URL` (frontends, rebuild). No production URL is
    hardcoded in source.
14. **WebSocket:** the admin client derives `wss://<api-domain>/ws/admin` from
    `VITE_API_URL` (`https→wss`). No separate config.
15. **Custom domains (optional):** add them in Render; then update
    `PLAYER_ORIGIN`/`ADMIN_ORIGIN`/`PUBLIC_API_URL`/`ARTIFACT_BASE_URL`/`VITE_API_URL`
    to the custom domains, redeploy frontends, and re-run the seed.
16. **Verify HTTPS/WSS:** all three URLs load over HTTPS; admin WS connects (green
    "LIVE" indicator).
17. **Verify health:** `GET https://<api-domain>/health` → `{"status":"ok",...}`.
18. **Verify player:** register → create team (shows join code) → second account
    joins by code → challenges load.
19. **Verify admin:** log in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`; dashboard + live
    leaderboard + WS log load.
20. **Verify CTF start/close:** admin START → status LIVE; submissions accepted;
    admin CLOSE → status CLOSED; submissions rejected; leaderboard still viewable.
21. **Verify leaderboard:** solves appear and rank updates live.
22. **Verify hidden level:** at T+30 (or lower `HIDDEN_LEVEL_DELAY_MINUTES` for a
    test) exactly one member per team is selected server-side; only that member
    can submit; +500/−400 team-wide; one attempt/team.
23. **Verify flag leakage:** locally run `node scripts/check-flag-leakage.mjs`
    (expected CLEAN) and confirm no `DOOM{...}` in the deployed player/admin
    bundles.

---

## C. Environment variables (names only — never commit values)
**Backend (required):** `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PLAYER_ORIGIN`, `ADMIN_ORIGIN`,
`NODE_ENV=production`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none` (cross-site).
**Backend (recommended):** `PUBLIC_API_URL` and/or `ARTIFACT_BASE_URL`, `HOST=0.0.0.0`.
`PORT` is injected by Render — do not hardcode.
**Backend (optional tuning):** `JWT_EXPIRES_IN`, `ADMIN_NAME`, `EVENT_NAME`,
`SCORING_DECAY_STEP_MINUTES/PERCENT`, `SCORING_FLOOR_PERCENT`, `HIDDEN_REWARD`,
`HIDDEN_PENALTY`, `HIDDEN_LEVEL_DELAY_MINUTES`, `SUBMIT_RATE_MAX`,
`SUBMIT_RATE_WINDOW_SECONDS`, `LOG_LEVEL`.
**Frontends (build-time):** `VITE_API_URL` (player + admin).
Secrets live only in Render env / `server/.env` (git-ignored) — never in source,
`render.yaml`, API responses, or logs (auth headers/cookies are redacted).

---

## D. Runtime / persistence notes
- **PostgreSQL is the only source of truth.** No critical CTF state (event start,
  scores, solves, hidden assignments/results) lives on the web-service filesystem.
- **Restart-safe:** `event.startedAt` and `hiddenActivationAt` persist in the DB.
  The 5-second in-memory ticker is only a convenience — on restart it resumes and
  flips activation lazily from DB state; member assignments are created once and
  guarded by `HiddenLevelAssignment @@unique([teamId,eventId])`, so activation
  cannot double-run and scores cannot double-award.
- **WebSocket** carries no authoritative data; the admin dashboard reconnects
  (backoff + ping/pong) and re-fetches current state via REST after any restart.
- **No persistent disk** is required.
