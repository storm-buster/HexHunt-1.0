# DEPLOYMENT — HexHunt 1.0 on Render + Neon (NO DOCKER)

Native runtimes only: a Node **Web Service** (API) and two **Static Sites**
(player, admin) on **Render**, plus an **external PostgreSQL on Neon** (chosen to
avoid Render Free Postgres's 30-day expiry). The `render.yaml` Blueprint
describes the three Render services; the database is **not** provisioned by the
Blueprint — `DATABASE_URL` is a manual secret pointing at Neon.

Repo: `https://github.com/storm-buster/HexHunt-1.0.git` (branch `main`).

## Topology (placeholders — set real URLs after first deploy)
```
Player  https://<player-domain>   ──fetch(credentials)──►  API  https://<api-domain>
Admin   https://<admin-domain>    ──fetch + WebSocket───►  API  https://<api-domain>/ws/admin
                                                            │  (TLS, public network)
                                                            ▼
                                            Neon PostgreSQL (external, pooled)
```
`*.onrender.com` subdomains are **cross-site** to each other, so the session
cookie must be `SameSite=None; Secure` (set in the Blueprint) and everything must
be HTTPS/WSS. The API↔Neon link is over the public network with TLS — pick
regions close together (see §E).

---

## A. Dev vs Production commands (do not mix)
| Purpose | Development | Production (against Neon, run locally) |
| --- | --- | --- |
| Migrations | `npm run migrate:dev` (creates) | `npm run migrate` = `prisma migrate deploy` (applies only) |
| Seed | `npm run seed` | `npm run seed` (once; idempotent upsert) |
| Admin reset | `npm run admin:reset` | `npm run admin:reset` (uses `ADMIN_PASSWORD`) |
| Start | `npm run dev` | Render runs `node dist/server.js` (`npm start`) |
**Never run `prisma migrate reset` or `migrate dev` against the production DB.**
Automated tests use a separate `TEST_DATABASE_URL` — never the Neon production URL.

---

## B. Create the Neon database (one-time)
1. Create a **Neon** account and a new **project** (choose a region near your
   Render region — see §E).
2. Neon creates a default branch/database. Open **Dashboard → your project →
   Connect**.
3. Copy the **pooled** connection string (host contains `-pooler`), which routes
   through Neon's PgBouncer — best for a small connection budget. It already
   includes `sslmode=require`; **keep the SSL parameters** (do not disable TLS).
   - Example shape (DO NOT COMMIT, values are placeholders):
     `postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/<db>?sslmode=require`
   - Optional for tight pooling: append `&connection_limit=10` (Prisma honours
     query-string pool params) and, if using the PgBouncer pooled endpoint,
     `&pgbouncer=true`.
4. Never place this string in `render.yaml`, Git, or `DEPLOYMENT.md`.

---

## C. Render deployment procedure
1. **Render account** → connect GitHub.
2. **Connect** `storm-buster/HexHunt-1.0`.
3. **Blueprint deploy:** New + → *Blueprint* → pick this repo → Render reads
   `render.yaml` and provisions **three** services: `hexhunt-api` (web),
   `hexhunt-player` (static), `hexhunt-admin` (static). **No database is created.**
4. **Set `DATABASE_URL`** on `hexhunt-api` as a secret env var = the Neon pooled
   connection string from §B. (Blueprint marks it `sync: false`.)
5. **Set the other API secrets/vars** on `hexhunt-api`:
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (**strong, required** — the app refuses the
     insecure default in production and fails safe if unset).
   - URL vars (`PLAYER_ORIGIN`, `ADMIN_ORIGIN`, `PUBLIC_API_URL`,
     `ARTIFACT_BASE_URL`) and both static sites' `VITE_API_URL` are **auto-derived**
     from service URLs via `fromService`/`RENDER_EXTERNAL_URL` — no manual entry.
   - `JWT_SECRET`/`COOKIE_SECRET` are auto-generated; `COOKIE_SECURE=true` and
     `COOKIE_SAMESITE=none` are preset for cross-site.
6. **Backend build** runs automatically:
   `npm ci --include=dev && npm run prisma:generate && npm run build && npm run migrate`
   (`migrate` = `prisma migrate deploy` — applies committed migrations to Neon).
   Start: `node dist/server.js`. Health check: `/health`.
   > Render Free web services have **no Shell/SSH**, so the one-time **seed** is
   > run from your local machine (§D). Startup never seeds.
7. **Static sites** build `npm ci && npm run build`, publish `dist`, SPA rewrite
   `/* → /index.html`; `VITE_API_URL` is injected from the API's external URL.
8. **Verify** (see §F).

---

## D. One-time production bootstrap — from your LOCAL machine (Windows PowerShell)
Render Free has no Shell, so initialise Neon from your machine. The env vars
below exist **only for the current PowerShell session** — they are not saved and
must never be committed. Use the **real** Neon URL and a **strong** password.

```powershell
cd D:\ctf-main\ctf-main\server

# Session-only variables (replace placeholders; do NOT paste real secrets into any file)
$env:DATABASE_URL   = "<NEON_POOLED_CONNECTION_STRING>"
$env:ADMIN_EMAIL    = "admin@doomsday.ctf"
$env:ADMIN_PASSWORD = "<STRONG_PRODUCTION_PASSWORD>"
# So the seeded challenge artifact URLs point at the deployed API:
$env:PUBLIC_API_URL = "https://<api-domain>"

npm run migrate        # prisma migrate deploy → applies committed migrations to Neon
npm run seed           # idempotent: event + 14 challenges + admin (from ADMIN_EMAIL/PASSWORD)
npm run admin:reset    # (re)sets the admin password hash from ADMIN_PASSWORD; verifies it
```
Notes:
- `npm run seed` / `admin:reset` are **idempotent upserts** — re-running does not
  wipe users, teams, memberships, submissions, solves, or scores; it only ensures
  the event exists, upserts the 14 challenge records, and sets the admin.
- The commands print a **masked** DB host only — never the URL, password, or hash.
- Close the terminal (or `Remove-Item Env:DATABASE_URL, Env:ADMIN_PASSWORD`) when
  done so the secrets don't linger in the session.
- Obtain the External DB URL from **Neon → Connect** (§B) — not from Render.

---

## E. Regions & latency (external DB)
The API (Render) and DB (Neon) communicate over the **public internet** with TLS,
so pick a **Neon region closest to your Render region** to minimise round-trip
latency, e.g.:
- Render **Oregon** ↔ Neon **AWS us-west-2**
- Render **Ohio** ↔ Neon **AWS us-east-* / us-east-2**
- Render **Frankfurt** ↔ Neon **AWS eu-central-1**
- Render **Singapore** ↔ Neon **AWS ap-southeast-1**

Verify actual region availability in each provider's dashboard (do not assume).
Measure latency after deploy; if cross-region latency is high, relocate the Neon
project (or the Render service) to align regions.

---

## F. Verification
1. HTTPS/WSS: all three URLs load over HTTPS; admin WS shows "LIVE".
2. Health: `GET https://<api-domain>/health` → `{"status":"ok",...}`.
3. Admin: log in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`; dashboard + leaderboard + WS load.
4. Player: register → create team (shows join code) → second account joins → challenges load.
5. CTF start/close: START → LIVE (submissions accepted); CLOSE → CLOSED (rejected; leaderboard viewable).
6. Hidden level: at T+30 exactly one member/team is selected server-side; only they submit; +500/−400; one attempt/team.
7. Flag leakage: `node scripts/check-flag-leakage.mjs` → CLEAN; no `DOOM{...}` in deployed bundles.

---

## G. Environment variables (names only — never commit values)
**Backend (required):** `DATABASE_URL` (Neon pooled), `JWT_SECRET`, `COOKIE_SECRET`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PLAYER_ORIGIN`, `ADMIN_ORIGIN`,
`NODE_ENV=production`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`.
**Backend (recommended):** `PUBLIC_API_URL`/`ARTIFACT_BASE_URL`, `HOST=0.0.0.0`.
`PORT` is injected by Render — do not hardcode.
**Backend (optional tuning):** `JWT_EXPIRES_IN`, `ADMIN_NAME`, `EVENT_NAME`,
`SCORING_*`, `HIDDEN_REWARD`, `HIDDEN_PENALTY`, `HIDDEN_LEVEL_DELAY_MINUTES`,
`SUBMIT_RATE_MAX`, `SUBMIT_RATE_WINDOW_SECONDS`, `LOG_LEVEL`.
**Frontends (build-time):** `VITE_API_URL` (auto-derived in the Blueprint).
Secrets live only in Render env / Neon / local session / `server/.env`
(git-ignored) — never in source, `render.yaml`, API responses, or logs
(auth headers/cookies are redacted).

---

## H. Capacity & connection pooling (~80 players / ~27 teams)
- **One Prisma client per backend instance** (module singleton in
  `src/db/prisma.ts`) → one connection pool, reused across all requests (never a
  connection per request). Render Free runs a single instance.
- **Use the Neon POOLED endpoint** (PgBouncer) so many short DB operations share a
  small server-side connection budget — ideal for Neon Free. Optionally cap the
  Prisma pool with `&connection_limit=10` in `DATABASE_URL`.
- Hot paths are indexed already: `User.email` (unique), `TeamMembership.userId`
  (unique) + `teamId`, `Solve @@unique([teamId,challengeId])` + indexes,
  `Submission` indexes (`eventId/teamId/challengeId/submittedAt`),
  `HiddenLevelAssignment @@unique([teamId,eventId])`, `HiddenLevelResult.teamId`
  (unique), `Challenge` indexes. No new indexes are required for this scale.
- Leaderboard/statistics aggregate in-process from indexed reads; fine for ~27
  teams. The 5-second hidden-activation ticker issues one lightweight query.

---

## I. Runtime / persistence notes
- **PostgreSQL (Neon) is the only source of truth.** No critical CTF state lives
  on the Render filesystem; **no persistent disk** is required.
- **Restart-safe:** `event.startedAt` and `hiddenActivationAt` persist in the DB;
  the in-memory ticker re-derives activation from DB state after a restart, and
  `HiddenLevelAssignment @@unique([teamId,eventId])` prevents double activation /
  double award.
- **WebSocket** carries no authoritative data; the admin dashboard reconnects
  (backoff + ping/pong) and re-fetches state via REST after any restart.
