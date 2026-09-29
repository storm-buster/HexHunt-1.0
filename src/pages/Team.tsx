import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import PageTransition from '../components/PageTransition'
import BattleworldBg from '../components/BattleworldBg'
import CommandButton from '../components/CommandButton'

export default function Team() {
  const navigate = useNavigate()
  const { state, createTeam, joinTeam } = useGame()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyJoinCode = async () => {
    const cc = state.team?.inviteCode
    if (!cc) return
    try { await navigator.clipboard.writeText(cc); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard unavailable */ }
  }

  // Already on a team → show the join code prominently, then let them proceed.
  if (state.team) {
    return (
      <PageTransition>
        <BattleworldBg variant="hub" />
        <main className="team-screen">
          <div className="team-card">
            <h1>◆ SQUAD ACTIVE</h1>
            <p className="sub">You are enlisted with <strong>{state.team.name}</strong> ({state.team.memberCount}/3 operatives).</p>
            <div className="team-members">
              {state.team.members.map((m) => <span key={m.id} className="chip">{m.name} · {m.role}</span>)}
            </div>
            <div className="join-box">
              <div className="join-label">TEAM ID / JOIN CODE — share with your squad</div>
              <div className="join-row">
                <code className="join-code">{state.team.inviteCode}</code>
                <button type="button" className="copy-btn" onClick={copyJoinCode}>{copied ? '✓ COPIED' : 'COPY'}</button>
              </div>
              <div className="join-hint">Teammates enter this code on the Join screen. Max 3 members.</div>
            </div>
            <CommandButton onClick={() => navigate('/hub')} style={{ width: '100%' }}>ENTER COMMAND CENTER</CommandButton>
          </div>
          <Styles />
        </main>
      </PageTransition>
    )
  }

  const doCreate = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    // On success, stay on this screen — the SQUAD ACTIVE view above renders the
    // join code so the owner can share it before entering the hub.
    try { await createTeam(name) }
    catch (err: any) { setError(err?.message ?? 'Could not create team') }
    finally { setBusy(false) }
  }
  const doJoin = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try { await joinTeam(code); navigate('/hub') }
    catch (err: any) { setError(err?.message ?? 'Could not join team') }
    finally { setBusy(false) }
  }

  return (
    <PageTransition>
      <BattleworldBg variant="hub" />
      <main className="team-screen">
        <div className="team-grid">
          <form className="team-card" onSubmit={doCreate}>
            <h1>◆ FORM A SQUAD</h1>
            <p className="sub">Create a team (max 3 operatives). You'll get an invite code to share.</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" minLength={2} required />
            <CommandButton type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? '…' : 'CREATE TEAM'}</CommandButton>
          </form>
          <form className="team-card" onSubmit={doJoin}>
            <h1>◆ JOIN A SQUAD</h1>
            <p className="sub">Enter an invite code from your team owner.</p>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="INVITE CODE" required />
            <CommandButton type="submit" variant="secondary" disabled={busy} style={{ width: '100%' }}>{busy ? '…' : 'JOIN TEAM'}</CommandButton>
          </form>
        </div>
        {error && <div className="team-error">✗ {error}</div>}
        <Styles />
      </main>
    </PageTransition>
  )
}

function Styles() {
  return (
    <style>{`
      .team-screen { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1rem; }
      .team-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; width: 100%; max-width: 780px; }
      @media (max-width: 700px) { .team-grid { grid-template-columns: 1fr; } }
      .team-card { background: rgba(10,15,12,0.92); border: 1px solid var(--emerald, #2be066); border-radius: 8px; padding: 1.75rem; display: flex; flex-direction: column; gap: 0.9rem; }
      .team-card h1 { font-family: var(--heading-font, 'Barlow Condensed', sans-serif); color: var(--emerald, #2be066); margin: 0; letter-spacing: 0.05em; }
      .team-card p.sub { color: var(--text-muted, #7d9585); font-family: var(--mono-font, 'Space Mono', monospace); font-size: 0.78rem; margin: 0; }
      .team-card input { background: var(--s1, #0a140d); border: 1px solid var(--border, #17381f); color: var(--text-primary, #e8efe9); padding: 10px 12px; border-radius: 4px; font-family: var(--mono-font, monospace); outline: none; }
      .team-card input:focus { border-color: var(--emerald); }
      .team-members { display: flex; gap: 6px; flex-wrap: wrap; }
      .chip { font-family: var(--mono-font, monospace); font-size: 0.72rem; padding: 2px 8px; border-radius: 3px; background: rgba(43,224,102,0.08); border: 1px solid var(--border, #17381f); color: var(--emerald); }
      .invite { font-family: var(--mono-font, monospace); font-size: 0.8rem; color: var(--text-secondary, #aab8ae); }
      .invite code { color: var(--signal, #f0b93d); }
      .join-box { border: 1px solid var(--emerald, #2be066); border-radius: 6px; padding: 0.9rem 1rem; background: rgba(43,224,102,0.05); display: flex; flex-direction: column; gap: 0.5rem; }
      .join-label { font-family: var(--mono-font, monospace); font-size: 0.7rem; color: var(--text-muted, #7d9585); letter-spacing: 0.1em; text-transform: uppercase; }
      .join-row { display: flex; align-items: center; gap: 0.75rem; }
      .join-code { font-family: var(--mono-font, monospace); font-size: 1.4rem; letter-spacing: 0.25em; color: var(--signal, #f0b93d); background: var(--s0, #050705); border: 1px solid var(--border, #17381f); border-radius: 4px; padding: 0.4rem 0.8rem; flex: 1; text-align: center; }
      .copy-btn { font-family: var(--mono-font, monospace); font-size: 0.75rem; letter-spacing: 0.08em; color: var(--s0, #050705); background: var(--emerald, #2be066); border: none; border-radius: 4px; padding: 0.5rem 0.9rem; cursor: pointer; font-weight: 700; }
      .join-hint { font-family: var(--mono-font, monospace); font-size: 0.7rem; color: var(--text-muted, #7d9585); }
      .team-error { color: var(--danger, #c73a32); font-family: var(--mono-font, monospace); }
    `}</style>
  )
}
