import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import PageTransition from '../components/PageTransition'
import BattleworldBg from '../components/BattleworldBg'
import CommandButton from '../components/CommandButton'
import Watermark from '../components/Watermark'
import { useAntiCheat } from '../anticheat/useAntiCheat'

export default function Hidden() {
  const navigate = useNavigate()
  const { state, submitHidden } = useGame()
  useAntiCheat()
  const hidden = state.hidden
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<{ correct: boolean; scoreDelta: number } | null>(null)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const res = await submitHidden(answer)
      setOutcome(res)
    } catch (err: any) {
      setError(err?.message ?? 'Submission failed')
    } finally { setBusy(false) }
  }

  const attempted = hidden?.attempted || outcome !== null
  const result = outcome ?? hidden?.result ?? null

  return (
    <PageTransition>
      <BattleworldBg variant="boss" />
      <Watermark />
      <main className="hidden-screen">
        <style>{`
          .hidden-screen { position: relative; z-index: 1; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
          .hidden-card { background: rgba(20,6,6,0.92); border: 1px solid var(--danger, #c73a32); border-radius: 8px; padding: 2rem; max-width: 560px; width: 100%; box-shadow: 0 0 50px rgba(199,58,50,0.25); animation: dpulse 2s infinite alternate; }
          @keyframes dpulse { from { box-shadow: 0 0 30px rgba(199,58,50,0.2);} to { box-shadow: 0 0 60px rgba(199,58,50,0.4);} }
          .hidden-card h1 { font-family: var(--heading-font, 'Barlow Condensed', sans-serif); color: var(--danger, #c73a32); margin: 0 0 0.5rem; letter-spacing: 0.05em; }
          .warn { font-family: var(--mono-font, 'Space Mono', monospace); color: var(--signal, #f0b93d); white-space: pre-wrap; background: #000; border: 1px solid var(--danger); border-radius: 6px; padding: 1rem; margin: 1rem 0; font-size: 0.85rem; line-height: 1.5; }
          .hidden-card input { width: 100%; background: #000; border: 1px solid var(--danger, #c73a32); color: var(--text-primary, #e8efe9); padding: 12px; border-radius: 4px; font-family: var(--mono-font, monospace); outline: none; margin-bottom: 1rem; }
          .odesc { color: var(--text-secondary, #aab8ae); font-family: var(--sans, 'Rajdhani', sans-serif); }
          .result-ok { color: var(--emerald, #2be066); font-family: var(--mono-font, monospace); font-size: 1.1rem; }
          .result-bad { color: var(--danger, #c73a32); font-family: var(--mono-font, monospace); font-size: 1.1rem; }
          .err { color: var(--danger); font-family: var(--mono-font, monospace); }
        `}</style>

        <div className="hidden-card">
          <h1>⚠ HIDDEN LEVEL DETECTED</h1>

          {!hidden?.activated && (
            <>
              <p className="odesc">No anomaly is currently active. The hidden level appears once, 30 minutes into the live event.</p>
              <CommandButton variant="ghost" onClick={() => navigate('/hub')}>← RETURN TO COMMAND</CommandButton>
            </>
          )}

          {hidden?.activated && !hidden?.available && (
            <>
              <p className="odesc">The anomaly pulled in a different operative from your squad. Only the selected operative can engage it — coordinate with your team.</p>
              {attempted && (
                <p className={result?.correct ? 'result-ok' : 'result-bad'}>
                  Team result recorded: {result?.correct ? '+' : ''}{result?.scoreDelta ?? 0} points.
                </p>
              )}
              <CommandButton variant="ghost" onClick={() => navigate('/hub')}>← RETURN TO COMMAND</CommandButton>
            </>
          )}

          {hidden?.activated && hidden?.available && (
            <>
              <div className="warn">{hidden.warning ?? 'This challenge carries exceptional risk.'}</div>
              {hidden.challenge && (
                <>
                  <h2 style={{ color: 'var(--text-primary)', fontFamily: 'var(--heading-font)' }}>{hidden.challenge.title}</h2>
                  <p className="odesc">{hidden.challenge.narrative}</p>
                  <p className="odesc">{hidden.challenge.description}</p>
                  {hidden.challenge.clueContent?.body && (
                    <pre className="warn" style={{ color: 'var(--emerald)', borderColor: 'var(--emerald-dim, #1faf5a)' }}>{hidden.challenge.clueContent.body}</pre>
                  )}
                </>
              )}

              {attempted ? (
                <div style={{ marginTop: '1rem' }}>
                  {result?.correct
                    ? <p className="result-ok">✓ ANOMALY NEUTRALIZED — {result.scoreDelta > 0 ? '+' : ''}{result.scoreDelta} POINTS</p>
                    : <p className="result-bad">✗ REALITY COLLAPSE — {result?.scoreDelta ?? 0} POINTS</p>}
                  <p className="odesc">Your team has used its single attempt.</p>
                  <CommandButton onClick={() => navigate('/hub')} style={{ marginTop: '1rem' }}>← RETURN TO COMMAND</CommandButton>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="DOOM{...}" autoFocus />
                  {error && <div className="err">✗ {error}</div>}
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <CommandButton variant="ghost" onClick={() => navigate('/hub')}>CANCEL</CommandButton>
                    <CommandButton type="submit" variant="danger" disabled={busy} style={{ flex: 1 }}>
                      {busy ? 'SUBMITTING…' : 'SUBMIT (ONE ATTEMPT)'}
                    </CommandButton>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </PageTransition>
  )
}
