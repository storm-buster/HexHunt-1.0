# Avengers: Doomsday CTF — Server-Backed Platform

A multiplayer/team Capture-The-Flag platform. The original client-only React SPA
is preserved as the **player experience**; it is now backed by a production-grade
**Fastify + Prisma + PostgreSQL** backend with real authentication, teams,
server-side flag validation, time-decay scoring, a randomly-activated hidden
level, and a live **admin dashboard** driven by WebSockets.

No Docker. Everything runs directly on Node.js + PostgreSQL.

```
project-root/
├── src/, index.html, vite.config.ts   # Player frontend (existing UI, now backend-integrated)
├── server/                            # Backend API (Fastify + Prisma + PostgreSQL)
│   ├── src/                           #   modular services + routes
│   ├── prisma/                        #   schema, migrations, seed, challenge data
│   ├── .env.example
│   └── package.json
├── admin-dashboard/                   # Separate admin React app (event control + live monitoring)
├── scripts/check-flag-leakage.mjs     # Acceptance test: no secrets in the client bundle
└── CTF_CODEBASE_ANALYSIS.md           # Pre-existing analysis of the original SPA
```

---

## 1. Prerequisites

- **Node.js** 20+ (tested on 22.14)
- **PostgreSQL** 14+ (tested on 17), running locally
- No Docker required

---

## 2. Setup & Run (no Docker)

### 2.1 Start PostgreSQL and create the databases

PostgreSQL must be running. Create the app and test databases (adjust the
superuser/password to your install):

```bash
# from a psql shell as a superuser
CREATE DATABASE doomsday_ctf;
CREATE DATABASE doomsday_ctf_test;
```

On Windows the client lives at `C:\Program Files\PostgreSQL\17\bin\psql.exe`.

### 2.2 Backend

```bash
cd server
cp .env.example .env          # then edit secrets & DATABASE_URL
npm install
npm run prisma:generate       # generate Prisma client
npm run migrate:dev           # create/apply the schema (first run: prisma migrate dev)
npm run seed                  # seed admin + event + 14 challenges
npm run dev                   # start API on http://localhost:4000  (or: npm run build && npm start)
```

Health check: `GET http://localhost:4000/health` → `{ "status": "ok", ... }`

### 2.3 Player frontend

```bash
# repo root
npm install
npm run dev                   # http://localhost:5173
```

### 2.4 Admin dashboard

```bash
cd admin-dashboard
npm install
npm run dev                   # http://localhost:5174
```

Log in with the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `server/.env`,
defaults `admin@doomsday.ctf` / `ChangeMe_Admin123!` — **change these**).

### 2.5 Standard scripts

| Location | Command | Purpose |
| --- | --- | --- |
| server | `npm run dev` | Dev server (tsx watch) |
| server | `npm run build` / `npm start` | Compile to `dist/` and run |
| server | `npm run typecheck` | Type-check only |
| server | `npm test` | Vitest suite (uses `TEST_DATABASE_URL`) |
| server | `npm run migrate:dev` / `migrate` | Create / apply migrations |
| server | `npm run seed` | Seed admin + event + challenges |
| root | `npm run build` | Build player frontend |
| admin-dashboard | `npm run build` | Build admin dashboard |
| root | `node scripts/check-flag-leakage.mjs` | Assert no secrets in client build |

---

## 3. Architecture

```
Player Frontend (React SPA, :5173)          Admin Dashboard (React, :5174)
        │  fetch (cookie auth)                        │  fetch + WebSocket
        ▼                                             ▼
┌───────────────────────────── Fastify API (:4000) ─────────────────────────────┐
│  Auth (JWT httpOnly cookie, argon2id)                                          │
│  Users · Teams (max 3, one-team) · Event (state machine, server clock)         │
│  Challenges (server gating, player-safe serialization)                         │
│  Submissions (server flag validation, team-wide solve, rate limit, audit)      │
│  Scoring (configurable time-decay)  · Leaderboard (deterministic)              │
│  Hidden Level (random activation, +500/-400, one attempt/team)                 │
│  Realtime hub (WebSocket broadcast)  → /ws/admin                               │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                         ▼
                                   PostgreSQL (Prisma)
```

Backend is layered: `routes` (HTTP/validation) → `service` (business logic +
transactions) → Prisma (`db`). Cross-cutting concerns live in `config`,
`middleware`, `auth`, `realtime`.

---

## 4. Database Schema (Prisma / PostgreSQL)

| Model | Key fields | Notes / constraints |
| --- | --- | --- |
| **User** | id, name, email (unique), passwordHash, role (PLAYER\|ADMIN), active, lastLoginAt | argon2id hash; email unique |
| **Team** | id, name (unique), inviteCode (unique), active, eventId | invite code = 8-char unambiguous |
| **TeamMembership** | id, teamId, userId (**unique**), role (OWNER\|MEMBER), joinedAt | `userId` unique ⇒ one team per user; `@@unique([teamId,userId])` |
| **Event** | id, name, status (NOT_STARTED\|LIVE\|CLOSED), startedAt, closedAt, hiddenActivationAt, hiddenActivated | server-authoritative timestamps |
| **Challenge** | id, title, category, universe, difficulty, description, narrative, hints, portalPuzzle, clueContent, stone, points, author, nextChallengeId, orderIndex, universeOrder, **flagHash**, **portalAnswerHash**, **revealText**, isHidden, hiddenReward, hiddenPenalty | secrets (`flagHash`, `portalAnswerHash`, `revealText`) never serialized to players |
| **Solve** | id, eventId, teamId, challengeId, solvedByUserId, solvedAt, basePoints, awardedPoints, elapsedSeconds | **`@@unique([teamId, challengeId])`** ⇒ one award per team |
| **Submission** | id, eventId, teamId, userId, challengeId, result, awardedPoints, penaltyPoints, submittedAt, ip | full audit log of every attempt |
| **HiddenLevelResult** | id, eventId, teamId (**unique**), submittedByUserId, correct, scoreDelta, submittedAt | `teamId` unique ⇒ one attempt per team |

Relationships: `User 1─1 TeamMembership ─* Team`; `Team 1─* Solve/Submission`,
`Team 1─1 HiddenLevelResult`; `Event 1─* Team/Solve/Submission/HiddenLevelResult`;
`Challenge 1─* Solve/Submission`.

---

## 5. Authentication & Authorization

- **Passwords**: hashed with **argon2id** (`@node-rs/argon2`, OWASP params).
- **Sessions**: JWT signed with `JWT_SECRET`, delivered in an **httpOnly, SameSite=Lax**
  cookie (`doom_session`). Bearer tokens also accepted. Configurable expiry
  (`JWT_EXPIRES_IN`, default 8h).
- **Guards**: `requireAuth` verifies the JWT; `requireAdmin` additionally checks
  `role === 'ADMIN'` **from the signed token** — a forged client-side `role` is
  never trusted (verified by test).
- **Registration** rejects duplicate/malformed emails and weak passwords
  (min 8 chars, letters + numbers) and always creates `PLAYER` (privilege
  escalation via request body is impossible).

Endpoints: `POST /api/auth/register`, `POST /api/auth/login`,
`POST /api/auth/logout`, `GET /api/auth/me`.

---

## 6. Teams

- Create (`POST /api/teams`) or join by invite code (`POST /api/teams/join`).
- **Max 3 members** and **one active team per user** enforced **server-side inside
  a transaction** plus DB unique constraints (`TeamMembership.userId` unique,
  size counted within the transaction). Frontend size checks are never trusted.
- Invite code is a random 8-char code from an unambiguous alphabet.

---

## 7. Event Lifecycle

State machine (admin only): `NOT_STARTED → LIVE → CLOSED`. Invalid transitions
(e.g. close-before-start, reopen) are rejected. The **backend clock** is
authoritative — `startedAt`/`closedAt` are server timestamps, and every event
response includes `serverTime`. Submissions are accepted **only while `LIVE`**.
After `CLOSED`, submissions are rejected and the leaderboard is frozen/read-only.

Starting the event also generates the hidden-level activation timestamp (§9).

---

## 8. Challenges, Flags & Scoring

### Challenge access (server-authoritative gating)
Sequential unlock, computed on the server (`computeUnlockMap`):
- **Webverse** is always open.
- A universe unlocks when **every** challenge of the previous universe is solved
  by the team.
- Within a universe, the next challenge unlocks when the previous one is solved.

`GET /api/challenges/:id` and `POST /api/submissions` both re-check access —
localStorage / URL manipulation cannot bypass it.

### Flags
- Stored only as **argon2id hashes** (`flagHash`). The player API never returns
  `flag`, `flagHash`, `portalAnswerHash`, or `revealText`.
- Submission verdicts are generic: `correct` / `incorrect` — the expected value is
  never revealed.

### Team-wide solves
Any team member's correct submission marks the challenge solved **for the whole
team**; points are awarded **once** (`Solve @@unique([teamId, challengeId])`).
Simultaneous submissions are safe — the unique constraint yields exactly one award
(the loser gets `ALREADY_SOLVED`). The submitting user is recorded for audit.

### Time-decay scoring (configurable)
```
elapsed  = server_now - event.startedAt          (seconds)
steps    = floor(elapsed / (DECAY_STEP_MINUTES * 60))
mult     = max(1 - (DECAY_STEP_PERCENT/100) * steps, FLOOR_PERCENT/100)
awarded  = floor(basePoints * mult)
```
Defaults: step 15 min, −10 %/step, floor 25 %. Example for base 200:
`0–14m→200, 15–29m→180, 30–44m→160, 45–59m→140, …, floor 50`.
Base points are the original per-challenge values (wv-01=100 … dn-06=200).
Configurable via `SCORING_*` env vars. `basePoints`, `awardedPoints`,
`elapsedSeconds`, `solvedAt` are all persisted for auditability.

### Team total & leaderboard
`teamScore = Σ Solve.awardedPoints + HiddenLevelResult.scoreDelta`, computed
server-side. Leaderboard ordering is deterministic:
1. score desc → 2. earlier last-solve time → 3. team name.
`GET /api/leaderboard` (player-safe) and `GET /api/admin/leaderboard` (with members).

### Portal mini-puzzles
Non-scoring UX detours. Their answers are also hashed server-side and validated
via `POST /api/challenges/:id/portal-check`; answers are not in the bundle.

### Final boss
Completion is a **server-side check** (team has all 6 stones). The final reveal
string is stored server-side (`revealText`) and returned by `GET /api/final-boss`
**only** to a qualifying team — it is not in the client bundle.

---

## 9. Hidden Level

- One extra challenge (`hidden-01`) outside the normal 12-chain.
- **Invisible before activation**: `GET /api/challenges` never exposes it, and
  `GET /api/hidden-level` returns `activated:false` with no metadata.
- **Random activation**: when the event goes LIVE the server picks an activation
  timestamp at `now + random(HIDDEN_MIN_MINUTES, HIDDEN_MAX_MINUTES)` (default
  15–45 min). All teams share the same activation moment (fairness). The exact
  future time is **not** exposed to players; a 5-second server ticker (plus lazy
  checks) flips it to active and broadcasts `HIDDEN_LEVEL_ACTIVATED`.
- **Scoring**: correct = **+500**, incorrect = **−400** (team-wide, configurable).
- **One attempt per team** (`HiddenLevelResult @@unique([teamId])`, transaction +
  P2002 guard against simultaneous submits).
- After close it becomes read-only/audit-only.

---

## 10. Realtime (WebSocket)

`GET ws://<host>/ws/admin` — authenticates via the session cookie and requires
`ADMIN`. Broadcast message types: `CTF_STARTED`, `CTF_CLOSED`, `TEAM_REGISTERED`,
`TEAM_JOINED`, `CHALLENGE_SOLVED`, `SCORE_UPDATED`, `LEADERBOARD_UPDATED`,
`HIDDEN_LEVEL_ACTIVATED`, `HIDDEN_LEVEL_RESULT`. The admin dashboard consumes these
live (with automatic reconnect + ping/pong keepalive) and falls back to a 15 s poll.

---

## 11. API Inventory

### Player API (`/api`)
| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | – | Create player account |
| POST | `/auth/login` | – | Log in |
| POST | `/auth/logout` | – | Clear session |
| GET | `/auth/me` | player | Current user |
| GET | `/me` | player | User + team + score bootstrap |
| GET | `/event` | – | Event status + authoritative server time |
| GET | `/team` | player | Current team |
| POST | `/teams` | player | Create team |
| POST | `/teams/join` | player | Join by invite code |
| GET | `/challenges` | player+team | Player-safe challenge list (locked/solved) |
| GET | `/challenges/:id` | player+team | Single challenge (denies if locked) |
| POST | `/challenges/:id/portal-check` | player+team | Validate portal puzzle answer |
| GET | `/progress` | player+team | Team solves + stones |
| POST | `/submissions` | player+team | Submit a flag (rate-limited) |
| GET | `/leaderboard` | player | Player-safe leaderboard |
| GET | `/hidden-level` | player+team | Hidden-level state (post-activation only) |
| POST | `/hidden-level/submit` | player+team | Submit hidden answer (one/team) |
| GET | `/final-boss` | player+team | Completion + reveal (if qualified) |

### Admin API (`/api/admin`, all require ADMIN)
`GET /event`, `POST /event/start`, `POST /event/close`, `GET /teams`,
`GET /users`, `GET /leaderboard`, `GET /submissions`, `GET /challenges`,
`GET /hidden-level`, `GET /statistics`.

Plus `GET /health` and `WS /ws/admin`.

---

## 12. Configuration (`server/.env`)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` / `TEST_DATABASE_URL` | PostgreSQL connections |
| `PORT`, `HOST`, `NODE_ENV`, `LOG_LEVEL` | Server basics |
| `JWT_SECRET`, `COOKIE_SECRET`, `JWT_EXPIRES_IN` | Auth secrets/expiry |
| `COOKIE_SECURE` | `true` behind HTTPS |
| `PLAYER_ORIGIN`, `ADMIN_ORIGIN` | Explicit CORS allow-list (comma-separated) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Seeded admin |
| `SCORING_DECAY_STEP_MINUTES/PERCENT`, `SCORING_FLOOR_PERCENT` | Scoring policy |
| `HIDDEN_REWARD/PENALTY`, `HIDDEN_MIN_MINUTES/MAX_MINUTES` | Hidden level |
| `SUBMIT_RATE_MAX`, `SUBMIT_RATE_WINDOW_SECONDS` | Submission rate limit |

Secrets are never hardcoded in source or committed. `server/.env` is gitignored;
`server/.env.example` documents every variable with placeholders.

---

## 13. Security Controls

- Flags/answers hashed (argon2id); never returned by any player API; never in the
  bundle (verified by `scripts/check-flag-leakage.mjs`).
- Server-side authz on every route; admin role read from the signed token only.
- Server-side challenge gating, event-live checks, and team-wide solve — no client
  trust for unlock/score/solved/event state.
- Per-user-per-challenge submission rate limiting (default 10/min).
- Transactions + unique constraints prevent double-award and duplicate memberships
  under concurrency.
- Explicit CORS allow-list with credentials (never `*`); httpOnly SameSite cookies.
- Zod validation on all inputs; Prisma parameterization (no SQL injection);
  structured errors that never leak stack traces or secrets.

---

## 14. Tests

Backend suite (Vitest, real PostgreSQL test DB): **40 tests across 7 files** —
auth, teams, event lifecycle, challenge gating, submissions (incl. team-wide +
race), scoring, hidden level, and security/authz. Plus the standalone
flag-leakage acceptance scan. Run: `cd server && npm test`, then
`node scripts/check-flag-leakage.mjs`.

---

## 15. Deployment (no Docker)

1. Provision PostgreSQL; create the database; set `DATABASE_URL`.
2. `cd server && npm ci && npm run build && npm run migrate && npm run seed`.
3. Run `node dist/server.js` under a process manager (systemd, pm2) with real
   secrets and `COOKIE_SECURE=true` behind HTTPS; set `PLAYER_ORIGIN`/`ADMIN_ORIGIN`
   to the deployed origins.
4. Build the player frontend (`npm run build`) and admin dashboard
   (`cd admin-dashboard && npm run build`); serve their `dist/` from any static
   host / reverse proxy. Point them at the API via `VITE_API_URL` at build time
   if not on `http://localhost:4000`.
5. Ensure the static host rewrites unknown paths to `index.html` (SPA routing).
