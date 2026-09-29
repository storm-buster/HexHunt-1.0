import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import PageTransition from '../components/PageTransition'
import BattleworldBg from '../components/BattleworldBg'
import CommandButton from '../components/CommandButton'

export default function Auth() {
  const navigate = useNavigate()
  const { login, register, state } = useGame()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'register') await register(name, email, password)
      else await login(email, password)
      navigate('/team')
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageTransition>
      <BattleworldBg variant="hub" />
      <main className="auth-screen">
        <style>{`
          .auth-screen { position: relative; z-index: 1; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
          .auth-card { background: rgba(10,15,12,0.92); border: 1px solid var(--emerald, #2be066); border-radius: 8px; padding: 2rem; width: 100%; max-width: 420px; box-shadow: 0 0 40px rgba(43,224,102,0.12); }
          .auth-card h1 { font-family: var(--heading-font, 'Barlow Condensed', sans-serif); color: var(--emerald, #2be066); margin: 0 0 0.25rem; letter-spacing: 0.06em; }
          .auth-card p.sub { color: var(--text-muted, #7d9585); font-family: var(--mono-font, 'Space Mono', monospace); font-size: 0.8rem; margin: 0 0 1.5rem; }
          .auth-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
          .auth-tab { flex: 1; padding: 0.5rem; background: transparent; border: 1px solid var(--border, #17381f); color: var(--text-muted); border-radius: 4px; cursor: pointer; font-family: var(--mono-font, monospace); letter-spacing: 0.08em; }
          .auth-tab.active { border-color: var(--emerald); color: var(--emerald); background: rgba(43,224,102,0.08); }
          .auth-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 0.9rem; }
          .auth-field label { font-size: 0.72rem; color: var(--text-muted); font-family: var(--mono-font, monospace); letter-spacing: 0.08em; text-transform: uppercase; }
          .auth-field input { background: var(--s1, #0a140d); border: 1px solid var(--border, #17381f); color: var(--text-primary, #e8efe9); padding: 10px 12px; border-radius: 4px; font-family: var(--mono-font, monospace); outline: none; }
          .auth-field input:focus { border-color: var(--emerald); }
          .auth-error { color: var(--danger, #c73a32); font-family: var(--mono-font, monospace); font-size: 0.82rem; margin-bottom: 0.75rem; }
        `}</style>
        <form className="auth-card" onSubmit={submit}>
          <h1>◆ ENLIST OPERATIVE</h1>
          <p className="sub">Battleworld requires a verified identity. {state.event ? `CTF status: ${state.event.status}` : ''}</p>
          <div className="auth-tabs">
            <button type="button" className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>LOG IN</button>
            <button type="button" className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>REGISTER</button>
          </div>
          {mode === 'register' && (
            <div className="auth-field">
              <label>Operative Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your codename" required minLength={2} />
            </div>
          )}
          <div className="auth-field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@multiverse.net" required />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 chars, letters + numbers" required minLength={8} />
          </div>
          {error && <div className="auth-error">✗ {error}</div>}
          <CommandButton type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'TRANSMITTING…' : mode === 'register' ? 'CREATE IDENTITY' : 'AUTHENTICATE'}
          </CommandButton>
        </form>
      </main>
    </PageTransition>
  )
}
