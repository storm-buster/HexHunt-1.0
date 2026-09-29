# CTF Codebase Analysis — "Avengers: Doomsday CTF" (DOOMSDAY // CTF)

> Analysis performed by static inspection only. **No source code was modified.**
> Investigation basis: full read of `package.json`, `vite.config.ts`, `tsconfig.json`,
> `index.html`, `src/main.tsx`, `src/App.tsx`, all files under `src/pages`,
> `src/contexts`, `src/components`, `src/data`, plus header inspection of the
> standalone root HTML files. `git` metadata is **not available** (the working tree
> is not a git repository — see §21).

---

## 0. CRITICAL FRAMING NOTE (read this first)

The task brief assumes a **full-stack "CTF server"** with a backend, database, APIs,
authentication, scoring service, WebSockets, admin panel, and Docker deployment.

**None of that exists in this repository.**

This project is a **100% client-side, single-page React application (SPA)**. It is a
narrative/themed CTF *game front-end* built with Vite + React + TypeScript + Three.js.
There is:

- **No backend / server code** (no Node/Express/Python/Go/etc. server, no API routes).
- **No database** (state lives in the browser's `localStorage`).
- **No authentication or authorization** (a fake "operative" identity is hardcoded).
- **No network calls at all** — no `fetch`, `axios`, `XMLHttpRequest`, WebSocket, or
  Server-Sent Events anywhere in `src/` (verified by grep: zero matches for
  `fetch(`, `axios`, `api/`, `process.env`, `import.meta.env`).
- **No tests, no Docker, no CI/CD, no `.env`, no reverse proxy, no migrations.**

**All flags are stored in plaintext in the client bundle** (`src/data/challenges.ts`)
and are validated **entirely in the browser** (`src/components/FlagInput.tsx`). From a
real-CTF-operations standpoint this is fundamentally insecure — anyone can read every
flag from the shipped JavaScript. This is acceptable *only* if the app is intended as a
demo / storytelling artifact rather than a competitive scored event (see §17 and §26).

Wherever the brief's template asks about server-only concepts, this report marks them
**ABSENT** or **N/A (client-only architecture)** rather than inventing an architecture.

---

## 1. Executive Summary

"Avengers: Doomsday CTF" is a Marvel/Doctor-Doom-themed, story-driven CTF **front-end
prototype**. The player is an "operative" who progresses through three themed "universes"
(sectors) — **Webverse**, **Osintverse**, and **Darknet** — solving a linear chain of
12 puzzle "challenges." Each solved challenge awards an Infinity **Stone**; collecting all
6 stones unlocks a **Final Boss** reveal (Doctor Doom) that simply displays a final
"flag" string.

The entire application is a client-side React SPA. Challenge definitions (including their
**plaintext flags**, hints, narrative, fake "clue" artifacts, and per-challenge "portal"
mini-puzzles) are hardcoded in a single TypeScript module. Flag checking is a
case-insensitive string comparison performed in the browser. Progress (which challenges
are solved, which stones/sectors are unlocked, hint usage, wrong attempts) is persisted in
`localStorage` under the key `doomsday_ctf_save`.

The visual layer is heavy: a Three.js 3D landing scene, animated CSS "portal environments"
for each wrong-answer detour, glitch overlays, a custom cursor, and a fixed "BattleworldOS"
HUD. There is no multiplayer, no team concept, no leaderboard, no scoring aggregation
surfaced to the user, and no server. It is best understood as an **interactive themed
demo / single-player puzzle experience**, not an operational competitive CTF platform.

---

## 2. Repository Structure

```
ctf-main/
├── index.html                 # Vite HTML entry; mounts #app, loads /src/main.tsx
├── package.json               # Vite + React + react-router-dom + three
├── package-lock.json
├── vite.config.ts             # Vite config: @vitejs/plugin-react-swc
├── tsconfig.json              # TS config (strict: false)
├── .gitignore
│
├── public/
│   ├── favicon.svg
│   └── icons.svg
│
├── src/
│   ├── main.tsx               # React root; <BrowserRouter><App/></BrowserRouter>
│   ├── App.tsx                # Routes + global providers/overlays
│   ├── index.css              # ~51 KB global stylesheet + CSS variables/theme
│   │
│   ├── pages/
│   │   ├── Home.tsx           # Landing: Three.js scene + countdown + "Enter" button
│   │   ├── Hub.tsx            # Sector map (3 universes) + Battleworld core
│   │   ├── Universe.tsx       # Per-universe challenge node list
│   │   ├── Challenge.tsx      # Challenge detail + flag submission terminal
│   │   ├── Portal.tsx         # Wrong-answer "portal" mini-puzzle detour
│   │   └── FinalBoss.tsx      # Stone synchronization + final reveal
│   │
│   ├── contexts/
│   │   └── GameContext.tsx    # Reducer-based global game state (localStorage-backed)
│   │
│   ├── data/
│   │   └── challenges.ts      # Challenge registry (flags, hints, puzzles) — SINGLE SOURCE
│   │
│   ├── components/
│   │   ├── Nav.tsx            # Top nav bar (operative name, stones, reset)
│   │   ├── BattleworldOS.tsx  # Fixed corner HUD overlay
│   │   ├── BattleworldBg.tsx  # Animated background variants
│   │   ├── BattleworldCore.tsx# Hub center reactor visual
│   │   ├── DoomCursor.tsx     # Custom cursor effect
│   │   ├── FlagInput.tsx      # Flag entry + client-side validation
│   │   ├── HintsPanel.tsx     # Progressive hint reveal
│   │   ├── DecoderTool.tsx    # In-page hex/bin/base64/rot13 decoder
│   │   ├── CluePanel.tsx      # Renders per-challenge "clue" artifact
│   │   ├── MetadataPanel.tsx  # Renders fake HTTP headers (wv-03)
│   │   ├── HexViewer.tsx      # Renders fake pixel/hex data
│   │   ├── NarrativePanel.tsx # Briefing text wrapper
│   │   ├── GlitchOverlay.tsx  # Wrong-answer glitch animation
│   │   ├── CommandButton.tsx  # Themed button
│   │   ├── PageTransition.tsx # Route transition wrapper
│   │   ├── StoneCounter.tsx   # Infinity-stone progress display
│   │   └── ForensicsViewer.tsx# *** DEAD CODE — never imported *** (see §22)
│   │
│   └── assets/                # hero.png, vite.svg, typescript.svg
│
├── wb.html        (~78 KB)   # UNRELATED junk — saved AWS/Wayback HTML page (see §21/§22)
├── ebj.html       (~322 KB)  # UNRELATED junk — saved AWS 404 error page
├── ebj_wb.html    (~4.7 KB)  # UNRELATED junk — Wayback Machine page
└── ebj_awb.html   (~84 KB)   # UNRELATED junk — saved AWS blog page (backoff/jitter)
```

**Notably absent:** `server/`, `backend/`, `api/`, `db/`, `migrations/`, `tests/`,
`Dockerfile`, `docker-compose.yml`, `.env`/`.env.example`, `nginx.conf`, `.github/`,
any CI config, any ORM, any auth library.

---

## 3. Technology Stack (verified against usage, not just manifest)

### Frontend (the only tier that exists)
| Concern | Technology | Evidence |
| --- | --- | --- |
| Language | TypeScript (`strict: false`) | `tsconfig.json` |
| UI framework | React 19-era (JSX runtime `react-jsx`) | `src/*.tsx`, `main.tsx` uses `createRoot` |
| Build system | Vite `^8.2.2` | `package.json`, `vite.config.ts` |
| React compiler plugin | `@vitejs/plugin-react-swc ^4.3.3` | `vite.config.ts` |
| Routing | `react-router-dom ^7.18.3` | `App.tsx` (`Routes`/`Route`), `BrowserRouter` in `main.tsx` |
| 3D graphics | `three ^0.185.1` + `@types/three` | used in `src/pages/Home.tsx` only |
| State management | React `useReducer` + Context | `src/contexts/GameContext.tsx` |
| Persistence | Browser `localStorage` | `GameContext.tsx` (`STORAGE_KEY = 'doomsday_ctf_save'`) |
| Styling | Plain CSS + CSS custom properties + inline `<style>` blocks | `src/index.css`, per-component `<style>` |

> Note on versions: `package.json` declares `typescript ~6.0.2` and `vite ^8.2.2`.
> These are unusually high/nonstandard version numbers as of this writing and should be
> treated as **NEEDS VERIFICATION** for reproducible installs. `react`/`react-dom`
> themselves are **not listed** in `dependencies` (only `@types/three`,
> `react-router-dom`, `three` are), yet React is imported everywhere — this is a
> **manifest inconsistency** (see §25). React presumably resolves transitively or via the
> lockfile; a clean `npm install` correctness is **UNKNOWN / NEEDS VERIFICATION**.

### Backend / Database / Infrastructure
**ABSENT.** No server runtime, ORM, validation lib, auth lib, queue, cache, background
jobs, WebSocket server, reverse proxy, container, or cloud config exist.

---

## 4. Startup Flow (actual)

There is no server process. "Startup" is browser bootstrap of a static SPA.

```
Developer runs `npm run dev`  (script: "vite")   ── OR ── static host serves `npm run build` output
   ↓
Browser loads index.html
   ↓
<script type="module" src="/src/main.tsx"> executes
   ↓
main.tsx: createRoot(#app).render(<StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>)
   ↓
App.tsx mounts <GameProvider> (context)
   ↓
GameProvider init: useReducer(gameReducer, initialState, () => loadSaved() ?? initialState)
      → loadSaved() reads localStorage key "doomsday_ctf_save" and rehydrates GameState
   ↓
Global overlays render: <DoomCursor/>, <Nav/>, <BattleworldOS/>
      (Nav & BattleworldOS self-hide when state.participant is null / on "/")
   ↓
react-router <Routes> matches URL → renders page
   ↓
useEffect in GameProvider persists state to localStorage on every state change
```

Build/run commands (`package.json`):
- Dev: `npm run dev` → `vite`
- Prod build: `npm run build` → `tsc && vite build`
- Preview built output: `npm run preview` → `vite preview`

> **Build not executed during this analysis** (to avoid installing dependencies, per the
> task's "prefer not to install" constraint). Whether `tsc && vite build` succeeds cleanly
> is **NEEDS VERIFICATION**, especially given the missing `react`/`react-dom` manifest
> entries noted in §3.

---

## 5. Architecture (actual, client-only)

```
Browser
  │
  ▼
React SPA (Vite bundle)
  ├── main.tsx ─ ReactDOM root + BrowserRouter
  ├── App.tsx ─ GameProvider + global overlays + <Routes>
  │
  ├── GameContext (single global store, useReducer)
  │        ▲   ▲   ▲   ▲   ▲   ▲
  │        │   │   │   │   │   │  (all pages/components read/dispatch here)
  │        └── persisted to localStorage("doomsday_ctf_save")
  │
  ├── Pages (route targets)
  │     ├── Home        (Three.js intro; startGame())
  │     ├── Hub         (sector selection; universe unlock gating)
  │     ├── Universe    (challenge node list; per-challenge unlock gating)
  │     ├── Challenge   (flag submission via FlagInput; solveChallenge())
  │     ├── Portal      (wrong-answer mini-puzzle; local-only, non-persistent)
  │     └── FinalBoss   (stone synchronization + final reveal)
  │
  ├── Presentational components (Nav, BattleworldOS/Bg/Core, DoomCursor,
  │     HintsPanel, DecoderTool, CluePanel, MetadataPanel, HexViewer, etc.)
  │
  └── Data
        └── challenges.ts  (challenge registry incl. PLAINTEXT flags)  ← source of truth
```

Component responsibilities (input → output):

- **GameContext** — owns all mutable state; input = dispatched actions
  (`START`, `SOLVE`, `RECORD_WRONG`, `USE_HINT`, `SET_CURRENT`, `RESET`); output = derived
  selectors (`isChallengeUnlocked`, `isUniverseUnlocked`, `isStoneCollected`, etc.). Complete.
- **challenges.ts** — static data module; no logic; exports `challenges[]` plus TS types.
  Complete.
- **Challenge page** — renders challenge, gates access via `isChallengeUnlocked`, mounts
  `FlagInput`. On correct: `solveChallenge()`; on wrong: animates then navigates to Portal.
  Complete.
- **FlagInput** — client-side flag comparison. Complete but insecure by design (§17).
- **Portal page** — themed detour with its own local mini-puzzle; solving it does **not**
  change game state — purely a re-entry gate back to the challenge. Complete but note the
  puzzle solve has **no persistence and no effect on scoring** (§8, §26).
- **FinalBoss** — reads `stones`; when 6 collected, shows a static final flag string. Complete.

---

## 6. API Inventory

**No HTTP/API endpoints exist.** There is no server, no route handlers, no `fetch`/XHR,
no health/metrics/debug endpoints. The only "routes" are **client-side react-router paths**:

| Client Route | Source | Component | Guard / Gating | Notes |
| --- | --- | --- | --- | --- |
| `/` | `App.tsx` | `Home` | none | Landing; calls `startGame('Operative','operative@void.ops')` |
| `/hub` | `App.tsx` | `Hub` | redirects to `/` if `!state.participant` | Sector map |
| `/universe/:universeId` | `App.tsx` | `Universe` | redirects to `/hub` if unknown universe | Lists challenges |
| `/challenge/:challengeId` | `App.tsx` | `Challenge` | redirects if unknown or `!isChallengeUnlocked` | Flag submission |
| `/portal/:portalId` | `App.tsx` | `Portal` | redirects to `/hub` if unknown challenge | Wrong-answer mini-puzzle; `?type=` query param selects theme |
| `/final-boss` | `App.tsx` | `FinalBoss` | none | Not linked from Nav; reachable by direct URL |
| `*` | `App.tsx` | — | `<Navigate to="/" replace/>` | Catch-all redirect |

All "guards" are **client-side navigation redirects only** — trivially bypassable by
editing `localStorage` or the running JS. No authorization exists.

---

## 7. Authentication & Authorization

**ABSENT / N/A.**

- **Registration/Login:** none. `Home.handleEnter()` calls
  `startGame('Operative', 'operative@void.ops')` — a **hardcoded** name/email
  (`src/pages/Home.tsx`). The `Participant` shape (`{ name, email }`) exists in
  `GameContext.tsx` but is never populated from user input in the current code (the
  `startGame(name, email)` signature accepts arguments, but the only caller passes constants).
- **Sessions/Tokens/JWT/Cookies:** none. "Session" == `localStorage` game save.
- **Password handling / hashing / reset / logout / refresh tokens:** none exist.
- **Roles / permissions / admin:** none. There is no role system and no admin concept.
- **Enforcement location:** the only access control is **frontend route gating**
  (`isChallengeUnlocked`, `isUniverseUnlocked`, and `if (!state.participant) navigate('/')`),
  which is cosmetic and client-controlled.

The `wv-03` challenge *theme* references an `X-Auth-Token: bG9va19zZWNyZXQ=` header and a
`WWW-Authenticate: Bearer` header, but these are **fake props rendered in `MetadataPanel`**
for puzzle flavor (`src/pages/Challenge.tsx`), not real authentication.

---

## 8. User / Team / Event Model

| Concept | Supported? | Evidence |
| --- | --- | --- |
| Individual player | Partial — a single anonymous local "operative" | `startGame('Operative', ...)` |
| Teams | **No** | no team type/state anywhere |
| Multiple events | **No** | single hardcoded challenge set |
| Event start/end times | Cosmetic only | `Home.tsx` counts down to `2026-12-31T00:00:00`; purely visual, gates nothing |
| Registration / invitations / join / delete | **No** | none |
| Event activation / archival | **No** | none |

The real "model" is a **single-player progression state** (`GameState` in
`GameContext.tsx`):

```
GameState
├── participant: { name, email } | null      // hardcoded on START
├── progress: Record<challengeId, {           // per-challenge tracking
│      solved: boolean, attempts: number,
│      wrongPathVisited: string[], hintsUsed: number }>
├── stones: Stone[]                           // collected infinity stones
├── startedAt: number | null                  // Date.now() at START
├── currentChallengeId: { webverse|osintverse|darknet: string|null }
└── universeUnlocked: { webverse|osintverse|darknet: boolean }
```

---

## 9. Challenge System

**Source of truth:** `src/data/challenges.ts`. 12 challenges across 3 universes, joined
into `export const challenges` (webverse ▸ osintverse ▸ darknet).

`ChallengeData` fields (per `challenges.ts`): `id`, `title`, `category`, `universe`,
`difficulty` (always `'moderate'`), `description`, `narrative`, **`flag` (plaintext)**,
`nextChallengeId` (defines the linear chain), `portalType`, `portalPuzzle`
(`{ type, title, icon, description, clue, puzzleAnswer, data? }`), `hints[]`, `type`,
optional `clueContent` (`{ label, body, format }`), `stone`, `points`, `author`.

Challenge inventory:

| ID | Universe | Category | Stone | Points | Flag (plaintext, in bundle) |
| --- | --- | --- | --- | --- | --- |
| wv-01 | webverse | web | mind | 100 | `DOOM{br0k3n_mult1v3rs3}` |
| wv-02 | webverse | custom | space | 150 | `DOOM{portal_chain_br0k3n}` |
| wv-03 | webverse | web | reality | 200 | `DOOM{auth_matrix_unlocked}` |
| os-01 | osintverse | osint | power | 120 | `DOOM{where_did_he_go}` |
| os-02 | osintverse | osint | soul | 130 | `DOOM{s0cial_g0st}` |
| os-03 | osintverse | forensics | time | 140 | `DOOM{p4per_tr4il}` |
| dn-01 | darknet | forensics | space | 150 | `DOOM{p1x3l_whist1}` |
| dn-02 | darknet | crypto | mind | 160 | `DOOM{c1ph3r_l4b}` |
| dn-03 | darknet | steganography | reality | 170 | `DOOM{h1dd3n_s1gn4l}` |
| dn-04 | darknet | pcap | power | 180 | `DOOM{p4ck3t_c4ptur3}` |
| dn-05 | darknet | reverse | soul | 190 | `DOOM{4ndr01d_c0r3}` |
| dn-06 | darknet | pwn | time | 200 | `DOOM{buff3r_0v3rfl0w}` |
| (final) | — | — | — | — | `DOOM{f1n4l_b0ss_r1ddl3}` (hardcoded in `FinalBoss.tsx`) |

> Observation: `stone` values are **reused across universes** (e.g. `space` is assigned to
> both wv-02 and dn-01; `mind` to wv-01 and dn-02, etc.). Because `stones` is a
> deduplicated set (`state.stones.includes(stone) ? ... : [...]`), the 6 unique stones are
> effectively earned early. The `SOLVE` reducer also treats stones as a **set of 6**, while
> there are 12 challenges — so "all 6 stones" is collected well before all 12 challenges are
> solved (see §11/§26 for the operational consequence).

**Challenge "artifacts":** challenges present *fake* CTF material (source-comment clues,
fake HTTP headers, fake EXIF/metadata, fake LSB/pixel dumps, fake PCAP tables, fake
disassembly, fake vulnerable C). These are **static strings**, not real files or services —
there is nothing to actually download, capture, reverse, or exploit.

**Challenge lifecycle (actual):**
```
Challenge authored in challenges.ts (static)
   ↓
Universe unlocked (webverse always; others gated by prior-universe completion)
   ↓
Challenge unlocked (first in chain, or previous nextChallengeId solved)
   ↓
Player opens /challenge/:id → reads narrative, briefing, clue artifact, hints, decoder
   ↓
Player submits flag (FlagInput)
   ├── correct → solveChallenge() → mark solved, add stone, advance chain, maybe unlock next universe
   └── wrong   → recordWrong() → glitch animation → navigate to /portal/:id (detour)
```

**Flag storage/generation:** **plaintext, static** (no hashing, no encryption, no dynamic
or per-user generation). Visibility/activation is a client-side unlock flag only.

---

## 10. Submission & Flag Validation

**Location:** `src/components/FlagInput.tsx` → `handleSubmit()`.

```
Player types flag → submit
   ↓
guard: ignore if empty/whitespace, or already checking/success
   ↓
setStatus('checking'); setTimeout(300ms) simulates "verifying"
   ↓
compare: input.trim().toUpperCase() === flag.toUpperCase()
   ├── equal   → status 'success' → onCorrect()  (Challenge.handleCorrect → solveChallenge)
   └── not     → status 'error'   → onWrong()     (Challenge.handleWrong → recordWrong + portal)
```

Validation characteristics:
- **Normalization:** `.trim()` (leading/trailing whitespace removed) and case-insensitive
  (`.toUpperCase()` both sides). Internal whitespace is **not** normalized.
- **Case sensitivity:** insensitive.
- **Duplicate submissions:** re-submitting after success is blocked by the `status === 'success'`
  guard within the component instance, but `solveChallenge` is also idempotent (stone add is
  a set union; `solved` just re-set to true).
- **Incorrect handling:** triggers a scripted glitch/collapse animation then routes to
  `/portal/:id?type=<portalType>`.
- **Rate limiting / cooldowns / penalties:** **none.**
- **First blood / partial scoring:** **none.**
- **DB writes / transactions / locking:** **N/A** (no DB). State mutation is a synchronous
  React reducer update, so classic server-side race conditions do not apply. There is no
  concurrency model because there is no shared server state.

**Portal mini-puzzle validation** (`src/pages/Portal.tsx` → `handlePuzzleSubmit`):
`puzzleInput.trim().toLowerCase() === challenge.portalPuzzle.puzzleAnswer.toLowerCase()`.
Solving it only toggles local component state (`puzzleSolved`) to re-enable the "return"
button; it is **not persisted** and does **not** affect progress or scoring.

---

## 11. Scoring System

**No aggregate scoring is implemented or displayed.**

- Each challenge carries a `points` value in `challenges.ts` (100–200), and the Challenge
  page renders `{challenge.points} PTS` as flavor text.
- There is **no total-score accumulator**, no sum of solved points, no per-user score, and
  no scoring formula. `GameState` tracks `progress[id].solved` and a `stones` set, but never
  computes points.
- The "score-like" progression is **stone collection** (6 unique stones) and
  **universe unlock** gating in the `SOLVE` reducer (`GameContext.tsx`):
  - Webverse is always unlocked.
  - Completing the last webverse challenge (with all of wv-01..03 solved) sets
    `universeUnlocked.osintverse = true` and seeds `currentChallengeId.osintverse = 'os-01'`.
  - Completing the last osintverse challenge unlocks `darknet` similarly.
- No difficulty multipliers, no hint penalties (hints are *counted* via `hintsUsed` but never
  subtracted from anything), no first-blood, no tie-breaking.

---

## 12. Leaderboard

**ABSENT.** No leaderboard exists (no component, no data structure, no sorting, no live
updates, no public/private view). There is no multi-user concept to rank. Tracing "a
submission to leaderboard visibility" is **not possible** because the leaderboard does not
exist.

The closest analogue is the **FinalBoss** "reactor" view, which visualizes how many of the
6 stones the single local player has synchronized — a personal progress meter, not a
leaderboard.

---

## 13. Admin System

**ABSENT.** There is no admin UI, no admin route, no admin API, no role check, and no
management surface (no create/edit/publish/disable challenges, no user/team management, no
submission review, no score reset beyond the player's own "Reset progress" button, no logs,
no infra monitoring). Challenge content is edited only by changing `challenges.ts` and
rebuilding.

The only "management" action is a self-service reset:
- `Nav.tsx` → reset button → `confirm(...)` → `resetGame()` (dispatch `RESET`) → navigate `/`.
- `FinalBoss.tsx` → "Reset Progress" → `localStorage.clear()` → navigate `/`.

---

## 14. Realtime / WebSocket

**ABSENT.** No WebSocket, no SSE, no polling, no realtime transport of any kind (grep for
`fetch(`, `ws`, `socket`, `EventSource` in `src/` yields none relevant). All "live"
elements (clock in `BattleworldOS`/`Home`, animated telemetry bars, glitch effects) are
**purely local `setInterval`/CSS animations** with no network involvement.

---

## 15. File Storage / Static Files

- **Challenge attachments / downloads:** none. All challenge "files" (images, PCAPs,
  binaries, documents) are **simulated as static text** inside `clueContent.body` /
  `portalPuzzle` fields; nothing is actually served or downloadable.
- **Uploads / avatars / user content:** none. No upload path exists → no arbitrary-upload,
  path-traversal, or content-validation surface.
- **Static frontend assets:** `public/` (`favicon.svg`, `icons.svg`) and `src/assets/`
  (`hero.png`, `vite.svg`, `typescript.svg`), served by Vite as normal static assets.
- **Access control on assets:** none (all public), which is normal for a static SPA.

---

## 16. Database Schema

**No database exists.** The equivalent persisted structure is the `localStorage` JSON blob
under key `doomsday_ctf_save`, shaped exactly like `GameState` (see §8). There are no
tables, foreign keys, indexes, constraints, relationships, or migrations.

"ER-style" view of the in-memory/localStorage model:

```
GameState (single object, per browser)
 ├── participant           { name, email }          (0..1)
 ├── progress[challengeId]  → ChallengeProgress      (0..12)
 │       { solved, attempts, wrongPathVisited[], hintsUsed }
 ├── stones[]               → Stone enum values       (0..6, deduped)
 ├── currentChallengeId     { webverse, osintverse, darknet }
 └── universeUnlocked       { webverse, osintverse, darknet }

challenges[]  (static, compile-time; NOT persisted)
 └── ChallengeData { id, universe, category, stone, points, flag, nextChallengeId, ... }
```

Rehydration is defensive: `loadSaved()` wraps `JSON.parse` in try/catch and applies
per-field defaults, so a corrupt/partial save degrades gracefully to defaults.

---

## 17. Configuration & Environment Variables

- **Environment variables:** **none.** No `.env`, no `.env.example`, no `import.meta.env`
  or `process.env` usage in `src/` (verified by grep).
- **Secrets / API keys / DB URLs / JWT secrets / admin creds:** **none present** — and none
  are needed, because there is no server. (No secret values to redact.)
- **CORS / allowed origins:** **N/A** (no server).
- **Config files:** only build/tooling config — `vite.config.ts` (React SWC plugin, no
  custom server/proxy/env), `tsconfig.json` (`strict: false`, `noEmit: true`, bundler
  module resolution), `package.json` scripts.
- **Feature flags / debug flags / production flags:** none.
- **Port:** not configured; Vite defaults apply (dev server default port; not pinned).
- **Hardcoded "identity":** `startGame('Operative', 'operative@void.ops')` in `Home.tsx`
  (flavor, not a secret).

---

## 18. Security Review (defensive, no exploitation performed)

> Context: for a *static single-player demo* several of these are "by design." They are
> **Critical only if the app is treated as a real, scored, competitive CTF**, which the
> brief implies. Severities below are stated in that competitive-CTF context.

| # | Finding | Severity (as competitive CTF) | Evidence |
| --- | --- | --- | --- |
| S1 | **All flags shipped in client bundle in plaintext** — every answer is readable in `challenges.ts` / built JS. No server-side validation. | Critical | `src/data/challenges.ts` (`flag:` fields); `FlagInput.tsx` compares client-side |
| S2 | **No authentication / identity** — anyone is "Operative"; no accounts. | Critical (for scoring integrity) | `Home.tsx` `startGame('Operative',...)` |
| S3 | **No authorization / server-side gating** — unlock logic is client `localStorage`; edit it to unlock everything. | Critical | `GameContext.tsx` selectors; route redirects only |
| S4 | **No scoring/leaderboard integrity** — no server means no trustworthy scores possible. | Critical | §11, §12 (absent) |
| S5 | **Final flag hardcoded in UI** (`DOOM{f1n4l_b0ss_r1ddl3}`) rendered directly in DOM. | High | `FinalBoss.tsx` |
| S6 | **Client-side "portal" answers in plaintext** (`puzzleAnswer`, plus `clue` literally states the answer). | High | `challenges.ts` `portalPuzzle.clue`/`puzzleAnswer` |
| S7 | **Manifest omits `react`/`react-dom`** — supply-chain/repro risk; install may pull unexpected transitive versions. | Medium | `package.json` dependencies |
| S8 | **Unusual/likely-nonexistent dependency versions** (`typescript ~6.0.2`, `vite ^8.2.2`, `react-router-dom ^7.18.3`) — verify authenticity to avoid resolution surprises. | Medium (needs verification) | `package.json` |
| S9 | **Unrelated foreign HTML blobs committed** (`wb.html`, `ebj*.html`) — saved AWS/Wayback pages with third-party inline scripts/CSP shipping in the repo root; noise and a minor hygiene/supply-chain smell if ever served. | Low | root dir; headers inspected |
| S10 | **DecoderTool / rendered clue bodies** use React text nodes (auto-escaped), so no obvious XSS sink; `dangerouslySetInnerHTML` not used. | Informational (no issue found) | `DecoderTool.tsx`, `CluePanel.tsx` (needs confirm — see §29) |

**Traditional server-side vuln classes (SQLi, command injection, SSRF, path traversal,
unsafe deserialization, CSRF, IDOR/BOLA, privilege escalation, arbitrary upload):**
**N/A — no server, no DB, no file I/O, no network requests.** The attack surface is the
client only, whose "secrets" are all already public by construction.

**CTF-specific integrity concerns:** because all validation is client-side, a participant
can trivially (a) read every flag from the bundle, (b) mark any challenge solved by editing
`localStorage`, (c) skip unlock gating, and (d) reveal the final flag. There is no
server-side notion of "another team," so cross-team flag submission etc. are not applicable.

---

## 19. Testing

**No tests exist.** No test runner (`jest`, `vitest`, `playwright`, `cypress`, `@testing-library`)
in `package.json`; no `*.test.*`/`*.spec.*` files; no `tests/`/`__tests__/` directories; no
fixtures/mocks/test DB.

```
Tests discovered: 0
Tests executed:   0
Passed:           0
Failed:           0
Skipped:          0
Not run:          N/A (none exist)
```

Type-checking via `tsc` (part of `npm run build`) is the only static gate, and it was
**not executed** here (dependencies not installed per task constraint) → build/typecheck
result is **NEEDS VERIFICATION**.

---

## 20. Deployment

**No deployment tooling exists** (no Dockerfile, compose, k8s, nginx, systemd, CI, or cloud
config). Intended model is inferred purely from Vite:

- **Local dev:** `npm install` then `npm run dev` (Vite dev server, HMR).
- **Production (intended):** `npm run build` → static assets in `dist/` → serve from any
  static host / CDN (e.g., S3+CloudFront, Netlify, GitHub Pages, nginx static). Because it
  uses `BrowserRouter`, the host must **rewrite unknown paths to `index.html`** (SPA
  fallback) or deep links like `/final-boss` will 404 on refresh — **no such rewrite config
  is present in the repo** (a deployment gap; see §25).
- Exposed ports / service deps / persistent storage / health checks / DB startup order:
  **none / N/A.**

---

## 21. Git / Development State

- **Not a git repository.** `git status` failed with
  `fatal: not a git repository (or any of the parent directories): .git`. Therefore branch
  list, commit history, authorship, and change timeline are **unavailable / UNKNOWN**.
- File mtimes are all identical (2026-09-29 17:54), consistent with a single extraction/copy
  rather than incremental development history.
- Code comments hint at iteration (e.g. `challenges.ts` header "Challenge Registry (v2)";
  `Home.tsx` comments "EXACT match to user's original"), suggesting the SPA was refactored
  at least once, but without git this cannot be confirmed.
- Marker scan (`TODO/FIXME/HACK/XXX/placeholder/coming soon/not implemented`): the only hits
  are benign — UI `placeholder=` attributes, a `/** If 'image' shows as a placeholder */`
  doc comment, and the string `'The code format is DOOM-XXXX.'` (a hint). **No genuine
  TODO/FIXME debt markers.**

---

## 22. Dead / Unused / Duplicated Code

- **`src/components/ForensicsViewer.tsx` — DEAD CODE.** Defines an `ForensicsViewer`
  component with its own hardcoded `dn-01` pixel data, but it is **never imported** anywhere
  (grep of all imports shows no reference). The Challenge page instead uses `HexViewer` +
  the `PIXEL_DATA` map. This is a leftover/duplicate of the pixel-viewer idea.
- **`wb.html`, `ebj.html`, `ebj_wb.html`, `ebj_awb.html` — UNRELATED JUNK.** Header
  inspection shows these are **saved copies of external AWS / Internet-Archive (Wayback)
  web pages** (e.g. "Timeouts, retries and backoff with jitter," an AWS 404 error page, a
  Wayback Machine page, an AWS architecture blog). They contain third-party scripts/CSP and
  have **nothing to do with the CTF app**; they are not referenced by any source file
  (grep confirms zero references). Almost certainly accidental commits. Total ~490 KB of
  irrelevant weight in the repo root.
- **Duplicated pixel data:** `dn-01`/`os-03` pixel arrays appear both in `Challenge.tsx`
  (`PIXEL_DATA`) and, for `dn-01`, in the dead `ForensicsViewer.tsx`.
- **Minor CSS smell:** `Portal.tsx` includes `animation: scan 0.5s random infinite;`
  (`.env-signal .interference`) — `random` is not a valid CSS timing function; that
  animation is effectively inert (cosmetic only).

---

## 23. Important File Map

### Core startup
- **`src/main.tsx`** — React root + Router. Everything mounts here.
- **`src/App.tsx`** — route table + `GameProvider` + global overlays. The app's spine.

### State / "data layer"
- **`src/contexts/GameContext.tsx`** — the entire game engine: reducer, unlock/gating logic,
  stone/universe progression, localStorage persistence. **Most important logic file.**
- **`src/data/challenges.ts`** — single source of truth for challenges, flags, hints,
  puzzles. **Most important data file** (and the security crux: plaintext flags).

### Challenge / submission
- **`src/pages/Challenge.tsx`** — challenge presentation + flag submission orchestration.
- **`src/components/FlagInput.tsx`** — the (client-side) flag validator.
- **`src/pages/Portal.tsx`** — wrong-answer mini-puzzle detour.

### Navigation / progression UI
- **`src/pages/Hub.tsx`** — sector map + universe unlock display.
- **`src/pages/Universe.tsx`** — per-universe challenge node list + gating status.
- **`src/pages/FinalBoss.tsx`** — endgame reveal + hardcoded final flag + reset.

### Presentation / chrome
- **`src/index.css`** (~51 KB) — global theme, CSS variables, most layout.
- **`Nav.tsx`, `BattleworldOS.tsx`, `BattleworldBg.tsx`, `BattleworldCore.tsx`,
  `DoomCursor.tsx`, `StoneCounter.tsx`, `HintsPanel.tsx`, `DecoderTool.tsx`,
  `CluePanel.tsx`, `MetadataPanel.tsx`, `HexViewer.tsx`, `NarrativePanel.tsx`,
  `GlitchOverlay.tsx`, `CommandButton.tsx`, `PageTransition.tsx`** — themed UI.

### Config / build
- **`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`.**

### Ignore / junk
- **`ForensicsViewer.tsx`** (dead), **`wb.html`/`ebj*.html`** (unrelated junk).

---

## 24. End-to-End Request Traces (actual code paths)

Because there is no network, these are **in-browser interaction traces**, not HTTP flows.

### Flow A — "Login" (entering the game)
```
Home page ("/") → user clicks "Enter the void"
   → Home.handleEnter()
   → startGame('Operative','operative@void.ops')      // GameContext
   → dispatch({type:'START'})  → reducer sets participant, startedAt, unlocks webverse, currentChallengeId.webverse='wv-01'
   → useEffect persists GameState to localStorage("doomsday_ctf_save")
   → setTimeout 1500ms → navigate('/hub')
(No credentials, no server, no token.)
```

### Flow B — View Challenge
```
Universe page → click challenge node → navigate(`/challenge/wv-01`)
   → Challenge mounts; getChallenge('wv-01') from challenges.ts
   → useEffect guard: if !challenge → /hub ; if !isChallengeUnlocked(id) → /universe/:u
        isChallengeUnlocked: universeUnlocked[u] && (no nextChallengeId ? first-in-chain : progress[nextChallengeId].solved)
   → render narrative, briefing, clueContent (CluePanel), optional MetadataPanel(wv-03)/HexViewer/DecoderTool, HintsPanel
   → render <FlagInput flag={challenge.flag} ...>   // flag already in memory/bundle
```

### Flow C — Submit Flag
```
Challenge page → FlagInput.handleSubmit()
   → input.trim().toUpperCase() === challenge.flag.toUpperCase() ?
      ├── YES → onCorrect() → Challenge.handleCorrect()
      │          → solveChallenge(id)  → dispatch SOLVE
      │              reducer: mark progress[id].solved=true; add stone (set-union);
      │                       advance currentChallengeId[universe]=nextChallengeId;
      │                       if last-in-universe & all solved → unlock next universe
      │          → persist to localStorage (provider useEffect)
      │          → setTimeout 800ms → navigate(nextChallengeId ? `/universe/:u` : '/hub')
      └── NO  → onWrong() → Challenge.handleWrong()
                 → recordWrong(id, portalType) → dispatch RECORD_WRONG (attempts++, wrongPathVisited.push)
                 → scripted collapse animation (phases 0..5)
                 → setTimeout 1500ms → navigate(`/portal/:id?type=<portalType>`)
```

### Flow D — Admin Creates Challenge
```
N/A — no admin exists. "Creating a challenge" = editing src/data/challenges.ts and rebuilding.
```

### Flow E — Leaderboard Update
```
N/A — no leaderboard exists. Closest analogue: FinalBoss reads state.stones.length and
renders the reactor + (at 6/6) the final flag. No aggregation, no ranking.
```

---

## 25. Feature Matrix

| Feature | Frontend | Backend | Database | Tests | Status |
| --- | --- | --- | --- | --- | --- |
| Landing / intro (3D) | Yes | N/A | N/A | No | Implemented |
| "Start game" (hardcoded identity) | Yes | N/A | localStorage | No | Implemented |
| Registration / real login | No | No | No | No | Missing |
| Sector/universe unlock gating | Yes | No | localStorage | No | Implemented (client-only) |
| Challenge listing / detail | Yes | No | static file | No | Implemented |
| Flag submission + validation | Yes | No | N/A | No | Implemented (client-side, insecure) |
| Wrong-answer "portal" mini-puzzle | Yes | No | N/A (non-persistent) | No | Implemented (no scoring effect) |
| Hints (progressive) | Yes | No | localStorage (count) | No | Implemented |
| In-page decoder tool | Yes | No | N/A | No | Implemented |
| Stone collection / progression | Yes | No | localStorage | No | Implemented |
| Final boss reveal | Yes | No | localStorage | No | Implemented |
| Scoring / points aggregation | No | No | No | No | Missing (points are display-only) |
| Leaderboard | No | No | No | No | Missing |
| Teams | No | No | No | No | Missing |
| Multiple events / event lifecycle | No | No | No | No | Missing (countdown is cosmetic) |
| Admin panel / challenge management | No | No | No | No | Missing |
| Realtime / WebSocket | No | No | No | No | Missing |
| File attachments / downloads | No | No | No | No | Missing (all simulated as text) |
| Auth / roles / sessions | No | No | No | No | Missing |
| Tests / CI | No | No | No | No | Missing |
| Docker / deployment config | No | No | No | No | Missing |

---

## 26. Architectural Risks (distinct from security)

```
Risk: Everything is client-side / no server of record.
Evidence: No backend, no API, no DB; flags & progress in bundle + localStorage.
Affected: entire app.
Impact: Cannot run a trustworthy scored/competitive event; results are unverifiable & spoofable.
Why it matters: This is the defining limitation for any "CTF platform" use.
```
```
Risk: Missing react/react-dom in package.json.
Evidence: dependencies lists only @types/three, react-router-dom, three.
Affected: build reproducibility, fresh installs, CI.
Impact: `npm install` on a clean machine may fail or resolve React unpredictably.
Why it matters: Onboarding/build fragility; must be verified before any deploy.
```
```
Risk: SPA deep-link routing without host rewrite config.
Evidence: BrowserRouter used; no nginx/host SPA-fallback config committed.
Affected: production static hosting.
Impact: Refresh/deep-link to /challenge/:id, /final-boss → 404 on many static hosts.
Why it matters: Broken UX in production unless the host is configured externally.
```
```
Risk: Stone model (6) decoupled from challenge count (12) and reused stones.
Evidence: challenges.ts reuses stones across universes; SOLVE dedupes into a 6-set.
Affected: progression/endgame pacing.
Impact: All 6 stones (and thus final-boss unlock) are earned before all challenges are solved,
        undermining the "collect via completing everything" narrative.
Why it matters: Progression logic doesn't match the intended 12-challenge arc.
```
```
Risk: React Hooks rule violation in HintsPanel.
Evidence: HintsPanel.tsx returns early `if (hints.length === 0) return null` BEFORE calling
          useGame()/useState() — conditional hook calls.
Affected: HintsPanel.
Impact: Latent bug; harmless today only because every challenge has non-empty hints.
        Would break (hook order) if a hint-less challenge is ever added.
Why it matters: Fragile; violates the Rules of Hooks.
```
```
Risk: Repository hygiene — ~490 KB of unrelated foreign HTML committed at root.
Evidence: wb.html / ebj*.html are saved AWS/Wayback pages, unreferenced.
Affected: repo cleanliness, review noise, potential confusion/supply-chain smell.
Impact: Low, but pollutes the project and could mislead automated tooling.
Why it matters: Signals loose commit discipline; should be investigated/removed (not by me).
```
```
Risk: Observability / error handling minimal.
Evidence: try/catch around Three.js init and localStorage parse; otherwise console.error only.
Affected: diagnosing client issues.
Impact: Low for a demo, but no telemetry/logging exists.
```

---

## 27. CTF Operational Model (how an event would *actually* run with this code)

1. **How is the event created?** It isn't, dynamically — content is baked into
   `challenges.ts` at build time. "Creating an event" = editing code and redeploying.
2. **How do players register?** They don't. Clicking "Enter the void" assigns a hardcoded
   local "Operative" identity; state is per-browser in `localStorage`.
3. **How do teams work?** No teams exist.
4. **How are challenges published?** They are always present in the bundle; visibility is a
   client-side unlock flag gated by linear progression.
5. **How do players access challenge info?** Via `/universe/:id` → `/challenge/:id`; all
   material (clues, fake headers/pixels/pcap/etc.) is static text rendered client-side.
6. **How do they submit flags?** In-page `FlagInput`; the answer is compared against the
   plaintext flag already loaded in the browser.
7. **How does scoring work?** It doesn't aggregate — points are decorative; progress is
   tracked as solved-flags + a 6-stone set.
8. **How does the leaderboard update?** There is no leaderboard.
9. **What can admins monitor?** Nothing — there is no admin/observability tier.
10. **What if the server restarts?** There is no server. Static hosting has no state to lose;
    each player's progress lives in their own browser.
11. **What if the database is unavailable?** N/A (no DB). If `localStorage` is disabled,
    progress won't persist across reloads, but the app still runs in-memory for the session.
12. **What under high submission load?** Irrelevant server-side (static assets scale via
    CDN); all logic is per-client, so there is no shared contention or race condition.
13. **How are challenge files distributed?** They aren't — "files" are simulated as strings;
    nothing is downloadable.
14. **How are flags protected?** They aren't — plaintext in the client bundle.
15. **What operational pieces are missing?** Essentially all of them for a real platform:
    accounts/auth, server-side flag validation, scoring/leaderboard, teams, events lifecycle,
    admin, persistence/DB, realtime, file hosting, tests, CI, and deployment config.

---

## 28. Current State Assessment

### 1. What this project is
A polished, single-player, Marvel-"Doomsday"-themed **CTF-style puzzle SPA**. It presents a
linear story across three "universes," lets a lone local player submit answers to 12
themed puzzles, collect Infinity Stones, and reach a Doctor Doom finale. It is a
front-end/demo artifact, not a server-backed competitive platform.

### 2. Current architecture
Vite + React + TypeScript SPA. One global `useReducer` store (`GameContext`) persisted to
`localStorage`; a static `challenges.ts` data module; react-router pages; Three.js for the
intro; heavy themed CSS. No backend of any kind.

### 3. Implemented capabilities
Intro/3D landing, start-game (hardcoded identity), client-side unlock gating, challenge
browsing/detail, client-side flag validation, wrong-answer portal detours, progressive
hints, an in-page multi-format decoder, stone progression, and a final-boss reveal — all
persisted locally.

### 4. Partial capabilities
Points exist as data/labels but are never aggregated (no scoring). The `Participant.email`
and the `startGame(name,email)` signature exist but are fed constants (no real registration).
The event countdown is cosmetic. Portal mini-puzzles work but don't affect progress.

### 5. Missing capabilities (needed for a real CTF platform)
Backend/API, server-side flag validation, database/persistence, authentication &
authorization, accounts/teams, scoring + leaderboard, event lifecycle, admin panel,
realtime updates, real file/attachment hosting, tests, CI/CD, and deployment config.

### 6. Security findings (top)
Plaintext flags in the client bundle (S1), no auth (S2), no server-side authorization (S3),
no score integrity (S4), hardcoded final flag (S5) — all Critical/High **if** treated as a
scored competition. Manifest omits React (S7) and lists suspicious versions (S8). Classic
server vuln classes are N/A (no server).

### 7. Reliability findings
No server to fail (good for uptime) but also no source of truth. Fresh-install/build risk
from the missing React deps; SPA deep-link 404 risk without host rewrite; a latent Hooks
violation in `HintsPanel`; progression/stone mismatch (6 stones vs 12 challenges).

### 8. Technical debt
Dead `ForensicsViewer.tsx`; ~490 KB of unrelated foreign HTML committed at root; duplicated
pixel data; an invalid CSS animation timing (`random`); `strict: false` TypeScript; no tests;
no git history.

### 9. Critical files to understand first
`src/contexts/GameContext.tsx` → `src/data/challenges.ts` → `src/App.tsx` →
`src/pages/Challenge.tsx` + `src/components/FlagInput.tsx` → `src/pages/Portal.tsx`.

### 10. Recommended next investigation areas (investigation only — no changes proposed)
- Confirm intent: demo/storytelling artifact vs. aspiring competitive platform (drives everything).
- Verify a clean `npm install && npm run build` actually succeeds given missing React deps
  and unusual dependency versions.
- Confirm no `dangerouslySetInnerHTML`/XSS sinks in clue/decoder rendering (spot-check done;
  full sweep recommended).
- Determine provenance/intent of the `wb.html`/`ebj*.html` blobs (accidental commit?).
- Clarify the intended stone↔challenge relationship (should all 12 be required?).
- Establish whether this repo is meant to be paired with a separate backend elsewhere
  (there is no evidence of one here).

---

## 29. Open Questions / Unknowns (NEEDS VERIFICATION)

- **Build/typecheck status:** `tsc && vite build` was **not run** (deps not installed per
  task constraint). Success is unverified, especially given missing `react`/`react-dom` in
  `package.json`.
- **Dependency authenticity:** `typescript ~6.0.2`, `vite ^8.2.2`, `react-router-dom
  ^7.18.3`, `three ^0.185.1` — version strings not validated against real published versions.
- **Git history:** unavailable (not a git repo) → project maturity/timeline unknown.
- **Intended deployment target & SPA fallback config:** not present in repo; assumed static
  hosting.
- **XSS sweep:** no `dangerouslySetInnerHTML` was observed and React escapes text nodes, but
  a full audit of every rendered `clueContent.body`/decoder output path was not exhaustively
  traced.
- **Whether a separate backend exists elsewhere:** no evidence in this repository; cannot be
  confirmed or denied from here.
- **Full read of `src/index.css`** (~51 KB) and every small presentational component was
  **not** performed line-by-line; findings there are limited to what pages/components
  reference. No functional logic is expected in CSS, but this is noted for completeness.

---

# WHAT I NOW UNDERSTAND

If I were handing this to another senior engineer, here is the honest picture.

**What the system is.** "Avengers: Doomsday CTF" is a **client-side-only React SPA** — a
themed, single-player CTF *experience*, not a CTF *server*. Despite the folder being named
`ctf` and the brief describing a full platform, there is no backend, no database, no API,
no auth, no scoring service, no leaderboard, and no realtime layer anywhere in the tree. I
verified this both structurally (no `server/`, `api/`, `Dockerfile`, `.env`, tests) and by
grepping the source: there is not a single `fetch`, `axios`, WebSocket, `process.env`, or
`import.meta.env` usage. Everything runs in the browser.

**How the components interact.** `main.tsx` boots React under `BrowserRouter`. `App.tsx`
wraps everything in a single `GameProvider` (a `useReducer` store in
`src/contexts/GameContext.tsx`) and renders global chrome (`DoomCursor`, `Nav`,
`BattleworldOS`) plus the route table. Every page reads and mutates one global `GameState`
via context selectors/dispatchers, and the provider mirrors that state into `localStorage`
under `doomsday_ctf_save` on every change (rehydrated defensively on load). The challenge
content — titles, narrative, hints, fake artifacts, per-challenge "portal" mini-puzzles,
and, crucially, the **plaintext flags** — all live in one static module,
`src/data/challenges.ts`.

**How the CTF lifecycle works.** The player starts on `Home` (a Three.js scene with a
cosmetic countdown), clicks "Enter the void," and is assigned a **hardcoded** "Operative"
identity — there is no registration or login. From the `Hub`, three "universes" (Webverse,
Osintverse, Darknet) are unlocked linearly: Webverse is always open, and finishing a
universe's last challenge unlocks the next. Inside a `Universe`, challenges are a linear
chain gated by `isChallengeUnlocked`. On a challenge page, the player submits a flag through
`FlagInput`, which does a **case-insensitive, trimmed string compare against the flag already
present in the bundle**. A correct answer dispatches `SOLVE` (marks solved, adds the
challenge's Infinity Stone to a deduplicated set, advances the chain, and possibly unlocks
the next universe); a wrong answer plays a glitch animation and routes to a themed `Portal`
detour whose mini-puzzle is purely local and doesn't affect progress. Collecting all six
stones lets `FinalBoss` reveal a hardcoded final flag.

**Where the important logic lives.** The brain is `GameContext.tsx` (state shape, reducer,
unlock/gating, stone/universe progression, persistence). The content and the security crux
are in `challenges.ts` (plaintext flags). The submission path is `Challenge.tsx` +
`FlagInput.tsx`, and the detour is `Portal.tsx`. Everything else is presentation.

**What is solid.** For what it actually is — a demo — it's coherent and polished: clean
reducer-based state, defensive `localStorage` rehydration, tidy route guards, consistent
theming, and a genuinely nice UX (3D intro, animated portals, decoder tool, HUD).

**What is incomplete.** Points are defined per challenge but **never aggregated** — there is
no scoring, no leaderboard, no teams, no events lifecycle, and no admin. The
`startGame(name,email)` API and `Participant.email` hint at a registration flow that was
never wired up. The stone model (6) is decoupled from the challenge count (12) and reuses
stones, so the endgame unlocks earlier than the "solve everything" narrative implies. There
are no tests, no CI, and no deployment config.

**What is risky.** As a *competitive* CTF this is fundamentally unsound: all flags are
readable in the shipped JS, and progress is spoofable via `localStorage`, so no result is
trustworthy. Practically, `package.json` **omits `react`/`react-dom`** while the whole app
imports React, and it pins unusual tool versions — so a clean install/build is a real
question mark. `BrowserRouter` without an SPA-fallback host config will 404 on deep-link
refresh. `HintsPanel` calls hooks after an early return (a latent Rules-of-Hooks bug, benign
only because every challenge currently has hints). And the repo carries dead code
(`ForensicsViewer.tsx`) plus ~490 KB of **unrelated saved AWS/Wayback HTML pages**
(`wb.html`, `ebj*.html`) that don't belong to the project at all.

**What still needs investigation.** First, confirm intent — is this meant to stay a
single-player demo, or become a real platform? That decision governs everything. Then verify
a clean `npm install && npm run build` given the missing React deps; do a full XSS sweep of
clue/decoder rendering; determine why the foreign HTML blobs were committed; clarify the
intended stone↔challenge relationship; and confirm whether a separate backend is expected to
exist elsewhere (there is no trace of one here). I have not changed any code, and I am not
proposing code changes — only these areas to look at next.
