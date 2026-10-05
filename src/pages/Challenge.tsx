import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import { api } from '../api/client'
import FlagInput from '../components/FlagInput'
import HintsPanel from '../components/HintsPanel'
import DecoderTool from '../components/DecoderTool'
import CluePanel from '../components/CluePanel'
import MetadataPanel from '../components/MetadataPanel'
import HexViewer from '../components/HexViewer'
import NarrativePanel from '../components/NarrativePanel'
import GlitchOverlay from '../components/GlitchOverlay'
import PageTransition from '../components/PageTransition'
import BattleworldBg from '../components/BattleworldBg'
import CommandButton from '../components/CommandButton'
import Watermark from '../components/Watermark'
import { useAntiCheat } from '../anticheat/useAntiCheat'

// Mock pixel data per challenge
const PIXEL_DATA: Record<string, { pos: string; rgb: [number, number, number]; note?: string }[]> = {
  'dn-01': [
    { pos: '12,34',  rgb: [255, 0, 0],   note: 'anomalous' },
    { pos: '23,45',  rgb: [0, 255, 0],   note: 'anomalous' },
    { pos: '67,89',  rgb: [0, 0, 255],   note: 'anomalous' },
    { pos: '88,99',  rgb: [255, 255, 0], note: 'anomalous' },
  ],
  'os-03': [
    { pos: '0,0',    rgb: [0x44, 0x4F, 0x4F] },
    { pos: '0,1',    rgb: [0x4D, 0x7B, 0x70] },
    { pos: '1,0',    rgb: [0x34, 0x70, 0x65] },
    { pos: '1,1',    rgb: [0x72, 0x5F, 0x74] },
  ],
}

const UNIVERSE_COLOR: Record<string, string> = {
  webverse: 'var(--wv-primary)',
  osintverse: 'var(--os-primary)',
  darknet: 'var(--dn-primary)',
}

const generateTelemetry = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const getPercent = (offset: number) => {
    return Math.abs((hash * offset) % 60) + 30; // 30-90 range
  }
  
  return {
    targetSignal: getPercent(1),
    memoryIntegrity: getPercent(2),
    traceLevel: getPercent(3),
    scanDepth: getPercent(4),
  }
}

export default function Challenge() {
  const { challengeId } = useParams<{ challengeId: string }>()
  const navigate = useNavigate()
  const {
    state,
    getChallenge,
    solveChallenge,
    recordWrong,
    submitFlag,
    isChallengeUnlocked,
  } = useGame()

  const challenge = getChallenge(challengeId ?? '')
  const [wrong, setWrong] = useState(false)
  const [showGlitch, setShowGlitch] = useState(false)
  const [showAuthHeader, setShowAuthHeader] = useState(false)
  const [collapsePhase, setCollapsePhase] = useState(-1)

  useEffect(() => {
    if (state.loading) return
    if (!challenge) {
      navigate('/hub')
      return
    }
    if (!isChallengeUnlocked(challenge.id)) {
      navigate(`/universe/${challenge.universe}`)
    }
  }, [challenge, navigate, isChallengeUnlocked, state.loading])

  const telemetry = useMemo(() => challenge ? generateTelemetry(challenge.id) : null, [challenge?.id])

  // Authoritative per-team clue comes from the server (per ChallengeInstance),
  // NOT the bundled template. Multi-step challenges return only the CURRENT
  // step's material (final-phase material is withheld until the intermediate is
  // verified server-side).
  const [serverClue, setServerClue] = useState<{ label: string; body: string; format?: string } | null>(null)
  const [stepInfo, setStepInfo] = useState<{ step?: number; totalSteps?: number; awaitingIntermediate?: boolean }>({})
  const [stepInput, setStepInput] = useState('')
  const [stepError, setStepError] = useState('')
  const [stepBusy, setStepBusy] = useState(false)
  const challengeKey = challenge?.id
  const unlocked = challenge ? isChallengeUnlocked(challenge.id) : false

  const loadServerChallenge = async (id: string) => {
    try {
      const r: any = await api.challenge(id)
      setServerClue(r?.challenge?.clueContent ?? null)
      setStepInfo({ step: r?.challenge?.step, totalSteps: r?.challenge?.totalSteps, awaitingIntermediate: r?.challenge?.awaitingIntermediate })
    } catch { /* locked/not-live — leave null */ }
  }

  useEffect(() => {
    if (!challengeKey || state.loading || !unlocked) return
    void loadServerChallenge(challengeKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeKey, state.loading, unlocked])

  const verifyIntermediate = async () => {
    if (!challengeKey || !stepInput.trim() || stepBusy) return
    setStepBusy(true); setStepError('')
    try {
      const res = await api.challengeStep(challengeKey, stepInput.trim())
      if (res.step?.ok) {
        setStepInput('')
        await loadServerChallenge(challengeKey) // reveals the final-phase material
      } else {
        setStepError('Incorrect intermediate value. Re-check your work.')
      }
    } catch {
      setStepError('Verification failed.')
    } finally {
      setStepBusy(false)
    }
  }

  // Copy-protection + telemetry for this gameplay page (called unconditionally
  // before any early return to keep hook order stable).
  useAntiCheat()

  if (!challenge || !telemetry) return null

  const color = UNIVERSE_COLOR[challenge.universe]

  const handleCorrect = () => {
    solveChallenge(challenge.id)
    setTimeout(() => {
      // If this is the last challenge in a universe, return to hub to show new universe
      if (!challenge.nextChallengeId) {
        navigate('/hub')
      } else {
        navigate(`/universe/${challenge.universe}`)
      }
    }, 800)
  }

  const handleWrong = () => {
    setWrong(true)
    recordWrong(challenge.id, challenge.portalType)
    
    setCollapsePhase(0)
    setTimeout(() => setCollapsePhase(1), 200)
    setTimeout(() => {
      setCollapsePhase(2)
      setShowGlitch(true)
    }, 500)
    setTimeout(() => setCollapsePhase(3), 800)
    setTimeout(() => setCollapsePhase(4), 1100)
    setTimeout(() => {
      setCollapsePhase(5)
      navigate(`/portal/${challenge.id}?type=${challenge.portalType}`)
    }, 1500)
  }

  const pixels = PIXEL_DATA[challenge.id]
  const bgVariant = ['webverse', 'osintverse', 'darknet'].includes(challenge.universe) 
    ? challenge.universe as any 
    : 'challenge'

  return (
    <PageTransition>
      <BattleworldBg variant={bgVariant} />
      <Watermark />
      <main
        className={`challenge ${wrong ? 'challenge--shake' : ''}`}
        style={{ ['--ch-color' as any]: color } as any}
      >
        <GlitchOverlay visible={showGlitch} phase={Math.max(0, collapsePhase)} />

        {collapsePhase >= 1 && collapsePhase < 3 && (
          <div className="collapse-msg">SIGNATURE REJECTED</div>
        )}
        {collapsePhase === 3 && (
          <div className="collapse-msg">REALITY ANCHOR LOST</div>
        )}
        {collapsePhase >= 4 && (
          <div className="collapse-msg">DIMENSIONAL BREACH DETECTED</div>
        )}

        <div style={{ marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
          <CommandButton
            variant="ghost"
            onClick={() => navigate(`/universe/${challenge.universe}`)}
          >
            ← RETURN TO SECTOR
          </CommandButton>
        </div>

        <div className="terminal-wrapper">
          <div className="terminal-header">
            <div className="terminal-header-left">
              <span>┌───</span>
              <span className="terminal-title">BREACH TERMINAL</span>
              <span>────</span>
            </div>
            <div className="terminal-header-right">
              <span>────</span>
              <span className="terminal-status">{wrong ? 'SYSTEM: CRITICAL' : 'SYSTEM: ACTIVE'}</span>
              <span className={`terminal-indicator ${wrong ? 'terminal-indicator--error' : ''}`}></span>
              <span>────┐</span>
            </div>
          </div>
          
          <div className="terminal-body">
            <div className="terminal-meta-bar">
              <span className="challenge__id">{challenge.id.toUpperCase()}</span>
              <span className="challenge__stone" style={{ color }}>
                ◆ {challenge.stone.toUpperCase()} STONE
              </span>
              <span className="challenge__id" style={{ marginLeft: 'auto' }}>
                {challenge.points} PTS
              </span>
            </div>

            <div className="challenge-content-area">
              <div className="challenge-main">
                <h1 className="challenge__title">{challenge.title}</h1>
                <p className="challenge__narrative">{challenge.narrative}</p>

                <NarrativePanel label="BRIEFING">{challenge.description}</NarrativePanel>

                {serverClue && (
                  <CluePanel
                    label={serverClue.label}
                    body={serverClue.body}
                    format={serverClue.format as any}
                    color={color}
                  />
                )}

                {challenge.id === 'wv-03' && (
                  <>
                    <button className="challenge__auth-btn" onClick={() => setShowAuthHeader(true)}>
                      🔍 Check Response Headers
                    </button>
                    {showAuthHeader && (
                      <MetadataPanel
                         headers={{
                           'Content-Type': 'application/json',
                           'X-Auth-Token': 'bG9va19zZWNyZXQ=',
                           'Server': 'Multiverse-Gateway/2.0',
                           'WWW-Authenticate': 'Bearer realm="multiverse"',
                         }}
                      />
                    )}
                  </>
                )}

                {pixels && <HexViewer pixels={pixels} title="PIXEL ANALYSIS" />}
                {challenge.type === 'decoder' && <DecoderTool />}
                
                <HintsPanel challengeId={challenge.id} hints={challenge.hints} />
              </div>

              <aside className="telemetry-panel">
                <div className="telemetry-title">◆ SYSTEM TELEMETRY</div>
                
                <div className="telemetry-row">
                  <span className="telemetry-label">TARGET SIGNAL</span>
                  <div className="telemetry-bar-bg">
                    <div className="telemetry-bar" style={{ 
                      width: `${wrong ? 99 : telemetry.targetSignal}%`, 
                      background: wrong ? 'var(--danger, #c73a32)' : 'var(--emerald, #2BE066)' 
                    }}></div>
                  </div>
                  <span className="telemetry-val" style={{ color: wrong ? 'var(--danger)' : 'var(--emerald)' }}>
                    {wrong ? '99%' : `${telemetry.targetSignal}%`}
                  </span>
                </div>
                
                <div className="telemetry-row">
                  <span className="telemetry-label">MEMORY INTG</span>
                  <div className="telemetry-bar-bg">
                    <div className="telemetry-bar" style={{ 
                      width: `${wrong ? 99 : telemetry.memoryIntegrity}%`, 
                      background: wrong ? 'var(--danger, #c73a32)' : 'var(--emerald, #2BE066)' 
                    }}></div>
                  </div>
                  <span className="telemetry-val" style={{ color: wrong ? 'var(--danger)' : 'var(--emerald)' }}>
                    {wrong ? 'CRITICAL' : `${telemetry.memoryIntegrity}%`}
                  </span>
                </div>
                
                <div className="telemetry-row">
                  <span className="telemetry-label">ENCRYPTION</span>
                  <span className="telemetry-val" style={{ width: 'auto', flex: 1, textAlign: 'right', color: wrong ? 'var(--danger)' : 'var(--emerald)' }}>
                    {wrong ? 'FAILED' : 'ACTIVE'}
                  </span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-label">TRACE LEVEL</span>
                  <div className="telemetry-bar-bg">
                    <div className="telemetry-bar" style={{ 
                      width: `${wrong ? 99 : telemetry.traceLevel}%`, 
                      background: wrong ? 'var(--danger, #c73a32)' : 'var(--signal, #f0b93d)' 
                    }}></div>
                  </div>
                  <span className="telemetry-val" style={{ color: wrong ? 'var(--danger)' : 'var(--signal)' }}>
                    {wrong ? 'HIGH' : `${telemetry.traceLevel}%`}
                  </span>
                </div>
                
                <div className="telemetry-row">
                  <span className="telemetry-label">SCAN DEPTH</span>
                  <div className="telemetry-bar-bg">
                    <div className="telemetry-bar" style={{ 
                      width: `${wrong ? 99 : telemetry.scanDepth}%`, 
                      background: wrong ? 'var(--danger, #c73a32)' : 'var(--emerald, #2BE066)' 
                    }}></div>
                  </div>
                  <span className="telemetry-val" style={{ color: wrong ? 'var(--danger)' : 'var(--emerald)' }}>
                    {wrong ? 'MAX' : `${telemetry.scanDepth}%`}
                  </span>
                </div>
              </aside>
            </div>

            <div className="terminal-divider">
              <span>──</span>
              <span>{stepInfo.totalSteps ? `OBJECTIVE — STEP ${stepInfo.step} OF ${stepInfo.totalSteps}` : 'EXECUTE FLAG SUBMISSION'}</span>
              <span className="terminal-divider-line"></span>
            </div>

            {stepInfo.awaitingIntermediate ? (
              <div className="step-verify" style={{ width: '100%', maxWidth: 600 }}>
                <div className={`flag-status flag-status--${stepError ? 'error' : 'idle'}`} style={{ marginBottom: '0.75rem' }}>
                  <span className="flag-status__dot" />
                  {stepError || 'SUBMIT INTERMEDIATE VALUE TO UNLOCK THE NEXT STEP'}
                </div>
                <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden' }}>
                  <input
                    type="text"
                    value={stepInput}
                    onChange={(e) => setStepInput(e.target.value)}
                    onPaste={(e) => e.preventDefault()}
                    onDrop={(e) => e.preventDefault()}
                    onDragOver={(e) => e.preventDefault()}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="intermediate value"
                    aria-label="intermediate value"
                    disabled={stepBusy}
                    style={{ flex: 1, padding: '12px 16px', fontFamily: 'var(--mono-font, monospace)', background: 'var(--s1,#111)', color: 'var(--text-primary,#fff)', border: `1px solid ${color}`, borderRight: 'none', borderRadius: '4px 0 0 4px', outline: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={verifyIntermediate}
                    disabled={stepBusy}
                    style={{ padding: '0 24px', background: 'var(--s2,#222)', color: 'var(--text-primary,#fff)', border: `1px solid ${color}`, borderRadius: '0 4px 4px 0', fontFamily: 'var(--mono-font, monospace)', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    {stepBusy ? '…' : 'VERIFY'}
                  </button>
                </div>
                <p className="flag-input__note" style={{ margin: '0.5rem 0 0', fontFamily: 'var(--mono-font, monospace)', fontSize: '0.68rem', color: 'var(--text-muted,#888)' }}>
                  Type the value manually — paste is disabled.
                </p>
              </div>
            ) : (
              <FlagInput
                onSubmit={(value) => submitFlag(challenge.id, value)}
                onCorrect={handleCorrect}
                onWrong={handleWrong}
                color={color}
              />
            )}
          </div>
          
          <div className="terminal-footer">
            <span>└──────────────────</span>
            <span>──────────────────┘</span>
          </div>
        </div>

        <style>{`
          .collapse-msg { 
            position: fixed; inset: 0; display: flex; align-items: center;
            justify-content: center; z-index: 1000; font-family: var(--heading-font, "Orbitron", sans-serif);
            font-size: 2rem; color: var(--danger, #c73a32); text-shadow: 0 0 20px var(--danger-glow, rgba(199,58,50,0.8));
            animation: fadeSlideUp 0.3s ease-out; pointer-events: none; text-align: center;
          }
          
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .terminal-wrapper {
            border: 1px solid var(--ch-color, var(--emerald));
            background: rgba(10, 10, 10, 0.8);
            backdrop-filter: blur(4px);
            position: relative;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          
          .terminal-header, .terminal-footer {
            display: flex; justifyContent: space-between; align-items: center;
            font-family: var(--mono-font, "Space Mono", monospace); font-size: 0.8rem;
            color: var(--ch-color, var(--emerald)); padding: 0.5rem 1rem;
          }
          
          .terminal-header { border-bottom: 1px solid var(--ch-color, var(--emerald)); }
          .terminal-header-left, .terminal-header-right { display: flex; align-items: center; gap: 0.5rem; }
          .terminal-title { letter-spacing: 0.1em; }
          .terminal-status { letter-spacing: 0.1em; }
          
          .terminal-indicator {
            width: 8px; height: 8px; background: var(--ch-color, var(--emerald)); 
            border-radius: 50%; display: inline-block; animation: blink 1s infinite;
          }
          .terminal-indicator--error { background: var(--danger, #c73a32); animation: blink 0.2s infinite; }
          
          .terminal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
          
          .terminal-meta-bar {
            display: flex; align-items: center; gap: 1rem;
            padding-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.1);
          }
          
          .challenge-content-area {
            display: flex; gap: 2rem;
            flex-direction: column;
          }
          
          @media (min-width: 768px) {
            .challenge-content-area { flex-direction: row; }
            .challenge-main { flex: 1; min-width: 0; }
            .telemetry-panel { width: 250px; flex-shrink: 0; }
          }
          
          .telemetry-panel {
            border: 1px solid rgba(255,255,255,0.1);
            background: var(--s0, #050505);
            padding: 1rem;
            border-radius: 4px;
            font-family: var(--mono-font, "Space Mono", monospace);
            font-size: 0.75rem;
            height: fit-content;
          }
          
          .telemetry-title {
            color: var(--text-muted, #888);
            margin-bottom: 1rem;
            letter-spacing: 0.1em;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding-bottom: 0.5rem;
          }
          
          .telemetry-row {
            display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;
          }
          
          .telemetry-label {
            width: 90px; color: var(--text-secondary, #AAB8AE);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          
          .telemetry-bar-bg {
            flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;
          }
          
          .telemetry-bar {
            height: 100%; border-radius: 3px;
            transition: width 0.3s ease, background-color 0.3s ease;
            background-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%);
            background-size: 200% 100%;
            animation: shimmer 2s infinite linear;
          }
          
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          
          .telemetry-val {
            width: 45px; text-align: right; font-weight: bold;
          }
          
          .terminal-divider {
            display: flex; align-items: center; gap: 1rem; 
            font-family: var(--mono-font, "Space Mono", monospace); fontSize: 0.85rem; 
            color: var(--text-secondary, #AAB8AE); letter-spacing: 0.1em;
          }
          .terminal-divider-line {
            flex: 1; height: 1px; background: var(--text-secondary, #AAB8AE); opacity: 0.3;
          }
          
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
          
          @media (prefers-reduced-motion: reduce) {
            .telemetry-bar, .terminal-indicator { animation: none !important; }
          }
        `}</style>
      </main>
    </PageTransition>
  )
}
