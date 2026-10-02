import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AdminSocket } from './ws';

function useServerClock(base: string | null) {
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString().replace('T', ' ').slice(0, 19)), 1000);
    return () => clearInterval(t);
  }, []);
  return base ? now : now;
}

function fmtSeconds(s: number | null): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString() : '—';
}

// ── Login ─────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('admin@doomsday.ctf');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { user } = await api.login(email, password);
      if (user.role !== 'ADMIN') throw new Error('This account is not an administrator');
      onLogin();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>◆ DOOMSDAY // ADMIN</h1>
        <p className="muted">Battleworld Command — restricted access</p>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></label>
        <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></label>
        {err && <div className="error">{err}</div>}
        <button disabled={busy} type="submit">{busy ? 'AUTHENTICATING…' : 'LOG IN'}</button>
      </form>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [event, setEvent] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [hidden, setHidden] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [feed, setFeed] = useState<string[]>([]);
  const socketRef = useRef<AdminSocket | null>(null);
  const clock = useServerClock(event?.serverTime ?? null);

  const refresh = useCallback(async () => {
    try {
      const [ev, st, lb, tm, ch, sb, hd, ss] = await Promise.all([
        api.event(), api.statistics(), api.leaderboard(), api.teams(),
        api.challenges(), api.submissions(50), api.hidden(), api.sessions(),
      ]);
      setEvent(ev); setStats(st.statistics); setLeaderboard(lb.leaderboard);
      setTeams(tm.teams); setChallenges(ch.challenges); setSubmissions(sb.submissions);
      setHidden(hd.hidden); setSessions(ss.sessions);
    } catch (e: any) {
      if (String(e.message).includes('401') || String(e.message).toLowerCase().includes('auth')) onLogout();
    }
  }, [onLogout]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 15000); // safety fallback; WS drives live updates

    const socket = new AdminSocket((msg) => {
      const ts = new Date().toLocaleTimeString();
      const line = `[${ts}] ${msg.type}${msg.payload ? ' ' + JSON.stringify(msg.payload) : ''}`;
      setFeed((f) => [line, ...f].slice(0, 100));
      // Any state-affecting event triggers a targeted refresh.
      if (msg.type !== 'CONNECTED' && msg.type !== 'PONG') refresh();
    });
    socket.onStatus = setConnected;
    socket.connect();
    socketRef.current = socket;

    return () => { clearInterval(poll); socket.close(); };
  }, [refresh]);

  const doStart = async () => { try { await api.startEvent(); await refresh(); } catch (e: any) { alert(e.message); } };
  const doClose = async () => { if (confirm('Stop the CTF? This completes & archives the current session. It cannot be reopened.')) { try { await api.closeEvent(); await refresh(); } catch (e: any) { alert(e.message); } } };
  const doExport = async (s: any) => { try { await api.exportSession(s.id, `hexhunt-session-${String(s.sessionNumber).padStart(3, '0')}.zip`); } catch (e: any) { alert(e.message); } };

  const status = event?.status ?? 'NOT_STARTED';
  const session = event?.session ?? null;
  const statusText = status === 'NO_ACTIVE_SESSION' ? 'NO ACTIVE SESSION' : status;
  const startLabel = status === 'NO_ACTIVE_SESSION' ? 'START NEW SESSION' : 'START CTF';

  return (
    <div className="dash">
      <header className="topbar">
        <div className="brand">◆ DOOMSDAY // ADMIN</div>
        <div className="topbar-right">
          <span className={`ws-dot ${connected ? 'on' : 'off'}`} title={connected ? 'Live' : 'Reconnecting'} />
          <span className="muted">{connected ? 'LIVE' : 'OFFLINE'}</span>
          <span className="muted mono">SERVER {clock}</span>
          <button className="ghost" onClick={async () => { await api.logout(); onLogout(); }}>Log out</button>
        </div>
      </header>

      {/* Event control */}
      <section className="panel">
        <h2>Event Control</h2>
        <div className="event-control">
          <div className={`status-badge ${status}`}>CTF STATUS: {statusText}{session ? ` · SESSION #${session.sessionNumber}` : ''}</div>
          <div className="event-times">
            <span>Start: {fmtTime(session?.startedAt)}</span>
            <span>Hidden activation: {session?.hiddenActivated ? fmtTime(session?.hiddenActivationAt) : (status === 'LIVE' ? 'scheduled (hidden)' : '—')}</span>
            <span>Completed sessions: {event?.completedSessions ?? 0}</span>
          </div>
          <div className="btns">
            <button onClick={doStart} disabled={status === 'LIVE'}>▶ {startLabel}</button>
            <button className="danger" onClick={doClose} disabled={status !== 'LIVE'}>■ STOP CTF</button>
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section className="panel">
        <h2>Statistics</h2>
        <div className="stat-grid">
          <Stat label="Registered Users" value={stats?.registeredUsers} />
          <Stat label="Registered Teams" value={stats?.registeredTeams} />
          <Stat label="Active Teams" value={stats?.activeTeams} />
          <Stat label="Solved Challenges" value={stats?.solvedChallenges} />
          <Stat label="Total Submissions" value={stats?.totalSubmissions} />
          <Stat label="Correct" value={stats?.correctSubmissions} />
          <Stat label="Incorrect" value={stats?.incorrectSubmissions} />
          <Stat label="Leader" value={stats?.currentLeader?.teamName ?? '—'} />
          <Stat label="Hidden ✓/✗" value={stats ? `${stats.hiddenOutcomes.correct}/${stats.hiddenOutcomes.incorrect}` : '—'} />
          <Stat label="WS Clients" value={event?.wsClients} />
        </div>
      </section>

      <div className="cols">
        {/* Leaderboard */}
        <section className="panel">
          <h2>Live Leaderboard</h2>
          <table>
            <thead><tr><th>#</th><th>Team</th><th>Members</th><th>Solves</th><th>Score</th><th>Last Solve</th></tr></thead>
            <tbody>
              {leaderboard.map((r) => (
                <tr key={r.teamId}>
                  <td>{r.rank}</td><td>{r.teamName}</td>
                  <td className="muted">{r.members?.map((m: any) => m.name).join(', ')}</td>
                  <td>{r.solves}</td><td className="mono">{r.score}</td><td>{fmtTime(r.lastSolveAt)}</td>
                </tr>
              ))}
              {leaderboard.length === 0 && <tr><td colSpan={6} className="muted">No teams yet</td></tr>}
            </tbody>
          </table>
        </section>

        {/* Submission feed */}
        <section className="panel">
          <h2>Submission Feed</h2>
          <table>
            <thead><tr><th>Time</th><th>Team</th><th>Player</th><th>Challenge</th><th>Result</th><th>Pts</th></tr></thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className={s.result === 'CORRECT' ? 'row-ok' : s.result === 'INCORRECT' ? 'row-bad' : ''}>
                  <td>{fmtTime(s.submittedAt)}</td><td>{s.team}</td><td>{s.player}</td>
                  <td>{s.challenge}</td><td>{s.result}</td><td className="mono">{s.awardedPoints}</td>
                </tr>
              ))}
              {submissions.length === 0 && <tr><td colSpan={6} className="muted">No submissions yet</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <div className="cols">
        {/* Team monitor */}
        <section className="panel">
          <h2>Team Monitor</h2>
          {teams.map((t) => (
            <div key={t.id} className="team-card">
              <div className="team-head">
                <strong>{t.name}</strong>
                <span className="mono">{t.score} pts · {t.solveCount} solves</span>
              </div>
              <div className="muted">Members: {t.members.map((m: any) => `${m.name} (${m.role})`).join(', ')}</div>
              <div className="muted small">Invite: {t.inviteCode} · Last activity: {fmtTime(t.lastActivity)}</div>
              <div className="chips">
                {t.solvedChallenges.map((c: any) => <span key={c.challengeId} className="chip">{c.challengeId} +{c.awardedPoints}</span>)}
                {t.hidden && <span className={`chip ${t.hidden.correct ? 'chip-ok' : 'chip-bad'}`}>hidden {t.hidden.scoreDelta > 0 ? '+' : ''}{t.hidden.scoreDelta}</span>}
              </div>
            </div>
          ))}
          {teams.length === 0 && <div className="muted">No teams yet</div>}
        </section>

        {/* Challenge monitor */}
        <section className="panel">
          <h2>Challenge Monitor</h2>
          <table>
            <thead><tr><th>Challenge</th><th>Universe</th><th>Pts</th><th>Solves</th><th>First Blood</th><th>Avg Solve</th></tr></thead>
            <tbody>
              {challenges.map((c) => (
                <tr key={c.id}>
                  <td>{c.id} · {c.title}</td><td>{c.universe}</td><td className="mono">{c.points}</td>
                  <td>{c.solveCount}</td><td>{c.firstBlood?.team ?? '—'}</td><td>{fmtSeconds(c.avgSolveSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* Hidden level */}
      <section className="panel">
        <h2>Hidden Level</h2>
        <div className="hidden-info">
          <span className={`status-badge ${hidden?.status}`}>STATUS: {hidden?.status ?? 'NOT_STARTED'}</span>
          <span>Reward: +{hidden?.reward ?? '—'}</span>
          <span>Penalty: -{hidden?.penalty ?? '—'}</span>
          <span>Activation (T+30): {hidden?.activationAt ? fmtTime(hidden.activationAt) : '—'}{hidden?.status === 'SCHEDULED' ? ' (scheduled)' : ''}</span>
        </div>

        {/* Per-team selection — visible to ADMIN only (never to players). */}
        <table>
          <thead><tr><th>Team</th><th>Selected Player</th><th>Submitted</th><th>Result</th><th>Δ Score</th></tr></thead>
          <tbody>
            {(hidden?.teams ?? []).map((t: any, i: number) => (
              <tr key={i} className={t.submitted ? (t.correct ? 'row-ok' : 'row-bad') : ''}>
                <td>{t.team}</td><td>{t.selectedPlayer}</td>
                <td>{t.submitted ? 'YES' : 'no'}</td>
                <td>{t.submitted ? (t.correct ? 'CORRECT' : 'INCORRECT') : '—'}</td>
                <td className="mono">{t.submitted ? `${t.scoreDelta > 0 ? '+' : ''}${t.scoreDelta}` : '—'}</td>
              </tr>
            ))}
            {(!hidden?.teams || hidden.teams.length === 0) && <tr><td colSpan={5} className="muted">No teams selected yet (activates at T+30)</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Session history + export */}
      <section className="panel">
        <h2>Session History</h2>
        <table>
          <thead><tr><th>#</th><th>Status</th><th>Started</th><th>Completed</th><th>Duration</th><th>Teams</th><th>Solves</th><th>Export</th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className={s.status === 'LIVE' ? 'row-ok' : ''}>
                <td className="mono">#{s.sessionNumber}</td>
                <td>{s.status}</td>
                <td>{fmtTime(s.startedAt)}</td>
                <td>{fmtTime(s.completedAt)}</td>
                <td>{fmtSeconds(s.durationSeconds)}</td>
                <td>{s.teamsParticipating}</td>
                <td>{s.totalSolves}</td>
                <td>
                  <button className="ghost" onClick={() => doExport(s)}>⤓ DOWNLOAD</button>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && <tr><td colSpan={8} className="muted">No sessions yet — press START CTF to begin session #1</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Live event log */}
      <section className="panel">
        <h2>Live Event Log (WebSocket)</h2>
        <pre className="feed">{feed.join('\n') || 'Waiting for events…'}</pre>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="stat">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api.me().then((r) => setAuthed(r.user.role === 'ADMIN')).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="login-wrap"><div className="muted">Loading…</div></div>;
  return authed ? <Dashboard onLogout={() => setAuthed(false)} /> : <Login onLogin={() => setAuthed(true)} />;
}
