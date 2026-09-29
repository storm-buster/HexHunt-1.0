import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import type { PortalType } from '../data/challenges'
import PageTransition from '../components/PageTransition'
import BattleworldBg from '../components/BattleworldBg'
import CommandButton from '../components/CommandButton'

// ── Portal theme class mapping ──────────────────────────────
const PORTAL_THEME: Record<string, string> = {
  'hidden-pixel':    'webverse',
  'recursive-loop':  'webverse',
  'time-based':      'webverse',
  'rabbit-hole':    'osintverse',
  'osint-redirect': 'osintverse',
  'document-rabbit':'osintverse',
  'signal':         'darknet',
  'cipher-loop':    'darknet',
  'packet':         'darknet',
  'reverse-loop':   'darknet',
  'pwn-terminal':   'darknet',
}

const PORTAL_TITLE: Record<PortalType, string> = {
  'hidden-pixel':    'Hidden Pixel Portal',
  'recursive-loop':  'Recursive Portal',
  'time-based':      'Time Portal',
  'rabbit-hole':    'Rabbit Hole',
  'osint-redirect': 'OSINT Portal',
  'document-rabbit': 'Document Portal',
  'signal':         'Signal Portal',
  'cipher-loop':    'Cipher Portal',
  'packet':         'Packet Portal',
  'reverse-loop':   'Reverse Portal',
  'pwn-terminal':   'Pwn Terminal',
}

const PORTAL_ICON: Record<PortalType, string> = {
  'hidden-pixel':    '⚡',
  'recursive-loop':  '🌀',
  'time-based':      '⏰',
  'rabbit-hole':    '🕳️',
  'osint-redirect': '🔍',
  'document-rabbit': '📄',
  'signal':         '📡',
  'cipher-loop':    '🔐',
  'packet':         '🌐',
  'reverse-loop':   '⚙️',
  'pwn-terminal':   '💻',
}

const PORTAL_BG: Record<string, string> = {
  webverse:  'portal--webverse',
  osintverse: 'portal--osintverse',
  darknet:  'portal--darknet',
  default:  'portal--default',
}

export default function Portal() {
  const { portalId } = useParams<{ portalId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { getChallenge, checkPortal } = useGame()

  const [puzzleInput, setPuzzleInput] = useState('')
  const [puzzleError, setPuzzleError] = useState('')
  const [puzzleSolved, setPuzzleSolved] = useState(false)

  // portalId is the challengeId (e.g. "wv-01")
  const challenge = getChallenge(portalId ?? '')
  const portalType = (searchParams.get('type') ?? 'hidden-pixel') as PortalType
  const theme = PORTAL_THEME[portalType] ?? 'default'

  useEffect(() => {
    if (!challenge) navigate('/hub')
  }, [challenge, navigate])

  // Portal is a mandatory gate: once the puzzle is solved, show the existing
  // success transition and AUTOMATICALLY return to the original challenge.
  // There is no manual return/bypass — solving is the only way back.
  const challengeId = challenge?.id
  useEffect(() => {
    if (!puzzleSolved || !challengeId) return
    const t = setTimeout(() => navigate(`/challenge/${challengeId}`), 1600)
    return () => clearTimeout(t)
  }, [puzzleSolved, challengeId, navigate])

  if (!challenge) return null

  const handlePuzzleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // Portal answers are validated server-side (never shipped to the client).
    const correct = await checkPortal(challenge.id, puzzleInput.trim())
    if (correct) {
      setPuzzleSolved(true)
      setPuzzleError('')
    } else {
      setPuzzleError('Incorrect. Look at the clue more carefully.')
    }
  }
  
  // Deterministic stability percentage based on hash of type name
  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash);
  }
  const stabilityPct = 10 + (hashString(portalType) % 80);

  const renderEnvironment = (type: PortalType) => {
    switch (type) {
      case 'hidden-pixel':
        return (
          <div className={`portal-env env-hidden-pixel ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="grid">
              {Array.from({ length: 64 }).map((_, i) => {
                const r = Math.floor(Math.random() * 255);
                const g = Math.floor(Math.random() * 255);
                const b = Math.floor(Math.random() * 255);
                return <div key={i} className="cell" style={{ backgroundColor: `rgb(${r},${g},${b})` }} />
              })}
            </div>
            <div className="scan-beam" />
            <div className="readout">RGB SCANNING...</div>
            <div className="coord-overlay">SYS.COORD [X:10,Y:20]</div>
          </div>
        );
      case 'recursive-loop':
        return (
          <div className={`portal-env env-recursive-loop ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="perspective-container">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="ring" style={{ width: `${300 - i*30}px`, height: `${300 - i*30}px`, animationDuration: `${2 + i*0.5}s`, opacity: 1 - i*0.1 }} />
              ))}
            </div>
          </div>
        );
      case 'time-based':
        return (
          <div className={`portal-env env-time-based ${puzzleSolved ? 'resolved' : ''}`}>
            {[10, 20, 30].map((speed, i) => (
              <div key={i} className="clock-ring" style={{ width: `${260 - i*60}px`, height: `${260 - i*60}px`, animationDuration: `${speed}s` }}>
                <div className="ticks" />
              </div>
            ))}
            <div className="energy-core" />
          </div>
        );
      case 'rabbit-hole':
        return (
          <div className={`portal-env env-rabbit-hole ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="perspective-container">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="square-frame" style={{ width: `${300 - i*40}px`, height: `${300 - i*40}px`, transform: `rotate(${i*15}deg) translateZ(${-i*50}px)`, opacity: 1 - i*0.15 }} />
              ))}
              <div className="falling-particles" />
            </div>
          </div>
        );
      case 'osint-redirect':
        return (
          <div className={`portal-env env-osint-redirect ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="radar">
              <div className="sweep" />
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="target" style={{ top: `${Math.random()*80 + 10}%`, left: `${Math.random()*80 + 10}%`, animationDelay: `${Math.random()}s` }} />
              ))}
            </div>
            <div className="readout">TRACKING ANOMALY</div>
          </div>
        );
      case 'document-rabbit':
        return (
          <div className={`portal-env env-document-rabbit ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="doc-content">
              {[1, 2, 3, 4, 5, 6, 7].map(i => (
                <div key={i} className="text-line" style={{ width: `${Math.random()*40 + 40}%` }}>
                  {i % 2 === 0 && <div className="redacted" />}
                </div>
              ))}
            </div>
            <div className="classified-stamp">CLASSIFIED</div>
            <div className="doc-scan-line" />
          </div>
        );
      case 'signal':
        return (
          <div className={`portal-env env-signal ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="waveform">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bar" style={{ animationDelay: `${i*0.1}s`, height: `${Math.random()*60 + 20}%` }} />
              ))}
            </div>
            <div className="sine-wave" />
            <div className="interference" />
            <div className="readout">FREQ: 144.02MHz</div>
          </div>
        );
      case 'cipher-loop':
        return (
          <div className={`portal-env env-cipher-loop ${puzzleSolved ? 'resolved' : ''}`}>
            {[1, 2, 3].map((ring, i) => (
              <div key={i} className={`cipher-ring dir-${i%2===0?'cw':'ccw'}`} style={{ width: `${280 - i*60}px`, height: `${280 - i*60}px`, animationDuration: `${10 + i*5}s` }}>
                {Array.from({ length: 12 }).map((_, j) => (
                  <div key={j} className="char" style={{ transform: `rotate(${j*30}deg) translateY(-${130 - i*30}px)` }}>
                    {String.fromCharCode(65 + Math.random()*26)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      case 'packet':
        return (
          <div className={`portal-env env-packet ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="network">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="node" style={{ top: `${Math.random()*80+10}%`, left: `${Math.random()*80+10}%` }} />
              ))}
              <div className="packet-counter">PKTS: 4092</div>
            </div>
          </div>
        );
      case 'reverse-loop':
        return (
          <div className={`portal-env env-reverse-loop ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="hex-dump">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="hex-line">
                  <span className="addr">0x{(0x1000 + i*16).toString(16)}</span>
                  <span className="hex"> 89 e5 83 ec 10 c7 45 f4</span>
                </div>
              ))}
            </div>
            <div className="cursor" />
          </div>
        );
      case 'pwn-terminal':
        return (
          <div className={`portal-env env-pwn-terminal ${puzzleSolved ? 'resolved' : ''}`}>
            <div className="stack-frames">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="frame">
                  <span className="addr">0x7fff{(Math.random()*0xffff).toString(16).padStart(4,'0')}</span>
                  <span className="val">AAAAAAAA</span>
                </div>
              ))}
            </div>
            <div className="fmt-str">%x %x %x %x %n</div>
            <div className="cursor" />
          </div>
        );
      default:
        return <div className="portal-env" />;
    }
  }

  return (
    <PageTransition>
      <BattleworldBg variant="portal" />
      <style>{`
        .portal-env {
          position: relative;
          width: 300px;
          height: 300px;
          margin: 0 auto 2rem;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--emerald-dim, #1FAF5A);
          border-radius: 8px;
          overflow: hidden;
          transition: all 1s ease;
        }
        .portal-env.resolved {
          transform: scale(0.9);
          opacity: 0;
        }
        @media (max-width: 768px) {
          .portal-env {
            width: 100%;
            height: 200px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .portal-env * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
        /* Hidden Pixel */
        .env-hidden-pixel .grid { display: grid; grid-template-columns: repeat(8, 1fr); width: 100%; height: 100%; }
        .env-hidden-pixel .scan-beam { position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: var(--emerald); box-shadow: 0 0 10px var(--emerald); animation: scan 2s linear infinite; }
        .env-hidden-pixel .readout, .env-hidden-pixel .coord-overlay { position: absolute; color: var(--emerald); font-family: var(--mono-font); font-size: 0.7rem; background: rgba(0,0,0,0.8); padding: 2px 4px; }
        .env-hidden-pixel .readout { bottom: 10px; left: 10px; }
        .env-hidden-pixel .coord-overlay { top: 10px; right: 10px; }
        @keyframes scan { 0% { top: 0; } 100% { top: 100%; } }

        /* Recursive Loop */
        .env-recursive-loop .perspective-container { position: absolute; width: 100%; height: 100%; perspective: 400px; transform-style: preserve-3d; display: flex; align-items: center; justify-content: center; transform: rotateX(15deg); }
        .env-recursive-loop .ring { position: absolute; border: 2px solid var(--emerald); border-radius: 50%; box-shadow: 0 0 10px inset var(--emerald); animation: spin-ring linear infinite; }
        @keyframes spin-ring { 0% { transform: rotateZ(0deg); } 100% { transform: rotateZ(360deg); } }

        /* Time Based */
        .env-time-based { display: flex; align-items: center; justify-content: center; }
        .env-time-based .clock-ring { position: absolute; border-radius: 50%; background: repeating-conic-gradient(from 0deg, transparent 0deg, transparent 28deg, var(--emerald) 29deg, var(--emerald) 30deg); -webkit-mask: radial-gradient(transparent 90%, black 90%); animation: spin-ring linear infinite; }
        .env-time-based .energy-core { width: 20px; height: 20px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 15px var(--emerald); animation: pulse 1s infinite alternate; }
        @keyframes pulse { 0% { transform: scale(0.8); opacity: 0.5; } 100% { transform: scale(1.2); opacity: 1; } }

        /* Rabbit Hole */
        .env-rabbit-hole .perspective-container { position: absolute; width: 100%; height: 100%; perspective: 300px; display: flex; align-items: center; justify-content: center; }
        .env-rabbit-hole .square-frame { position: absolute; border: 2px solid var(--bronze, #8A6238); box-shadow: 0 0 10px var(--bronze); }
        .env-rabbit-hole .falling-particles { position: absolute; width: 100%; height: 100%; background-image: radial-gradient(var(--emerald) 1px, transparent 1px); background-size: 20px 20px; animation: fall 3s linear infinite; opacity: 0.3; }
        @keyframes fall { 0% { transform: translateY(0); } 100% { transform: translateY(20px); } }

        /* OSINT Redirect */
        .env-osint-redirect .radar { width: 100%; height: 100%; border-radius: 50%; border: 1px solid var(--emerald); position: relative; overflow: hidden; }
        .env-osint-redirect .sweep { position: absolute; width: 50%; height: 50%; top: 0; left: 50%; background: conic-gradient(from 0deg, transparent, rgba(43,224,102,0.5)); transform-origin: 0% 100%; animation: spin-ring 2s linear infinite; }
        .env-osint-redirect .target { position: absolute; width: 6px; height: 6px; background: red; border-radius: 50%; animation: pulse 1.5s infinite; }
        .env-osint-redirect .readout { position: absolute; bottom: 5px; left: 5px; color: var(--emerald); font-family: var(--mono-font); font-size: 0.7rem; }
        .env-osint-redirect::before, .env-osint-redirect::after { content: ''; position: absolute; background: rgba(43,224,102,0.3); }
        .env-osint-redirect::before { width: 100%; height: 1px; top: 50%; }
        .env-osint-redirect::after { width: 1px; height: 100%; left: 50%; }

        /* Document Rabbit */
        .env-document-rabbit { background: #e0e0e0; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .env-document-rabbit .text-line { height: 10px; background: #bdbdbd; position: relative; }
        .env-document-rabbit .redacted { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #000; }
        .env-document-rabbit .classified-stamp { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); color: red; border: 3px solid red; font-family: Impact, sans-serif; font-size: 2rem; padding: 5px; opacity: 0.6; }
        .env-document-rabbit .doc-scan-line { position: absolute; left: 0; top: 0; width: 100%; height: 5px; background: rgba(43,224,102,0.5); animation: scan 3s linear infinite; }

        /* Signal */
        .env-signal { display: flex; align-items: flex-end; justify-content: space-around; padding-bottom: 30px; }
        .env-signal .waveform { display: flex; width: 100%; height: 60%; align-items: flex-end; justify-content: space-around; position: absolute; bottom: 30px; }
        .env-signal .bar { width: 8%; background: var(--emerald); animation: eq 1s ease-in-out infinite alternate; }
        .env-signal .sine-wave { position: absolute; top: 30%; left: 0; width: 100%; height: 2px; background: rgba(43,224,102,0.5); }
        .env-signal .interference { position: absolute; width: 100%; height: 5px; background: rgba(255,255,255,0.2); animation: scan 0.5s random infinite; }
        .env-signal .readout { position: absolute; bottom: 5px; right: 5px; color: var(--emerald); font-family: var(--mono-font); font-size: 0.7rem; }
        @keyframes eq { 0% { transform: scaleY(0.5); } 100% { transform: scaleY(1); } }

        /* Cipher Loop */
        .env-cipher-loop { display: flex; align-items: center; justify-content: center; }
        .env-cipher-loop .cipher-ring { position: absolute; border-radius: 50%; border: 1px dashed var(--emerald-dim); animation-timing-function: steps(12, end) !important; }
        .env-cipher-loop .dir-cw { animation: spin-ring linear infinite; }
        .env-cipher-loop .dir-ccw { animation: spin-ring reverse linear infinite; }
        .env-cipher-loop .char { position: absolute; top: 50%; left: 50%; color: var(--emerald); font-family: var(--mono-font); transform-origin: 0 0; }

        /* Packet */
        .env-packet { background: #000; }
        .env-packet .network { width: 100%; height: 100%; position: relative; }
        .env-packet .node { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 5px var(--emerald); }
        .env-packet .packet-counter { position: absolute; top: 10px; left: 10px; color: var(--emerald); font-family: var(--mono-font); font-size: 0.7rem; }
        
        /* Reverse Loop */
        .env-reverse-loop { background: #000; padding: 10px; font-family: var(--mono-font); font-size: 0.8rem; overflow: hidden; }
        .env-reverse-loop .hex-dump { display: flex; flex-direction: column; animation: scroll-up 5s linear infinite; }
        .env-reverse-loop .hex-line { display: flex; gap: 10px; color: var(--emerald); margin-bottom: 4px; }
        .env-reverse-loop .addr { color: var(--text-muted); }
        .env-reverse-loop .cursor { width: 8px; height: 12px; background: var(--emerald); position: absolute; bottom: 10px; left: 10px; animation: blink 1s step-end infinite; }
        @keyframes scroll-up { 0% { transform: translateY(100%); } 100% { transform: translateY(-100%); } }

        /* Pwn Terminal */
        .env-pwn-terminal { background: #000; padding: 10px; font-family: var(--mono-font); font-size: 0.8rem; display: flex; flex-direction: column; gap: 10px; }
        .env-pwn-terminal .frame { display: flex; gap: 15px; border-bottom: 1px solid var(--emerald-dim); padding-bottom: 5px; color: var(--emerald); }
        .env-pwn-terminal .addr { color: var(--danger); }
        .env-pwn-terminal .fmt-str { color: var(--bronze); margin-top: auto; }
        .env-pwn-terminal .cursor { width: 8px; height: 12px; background: var(--emerald); animation: blink 1s step-end infinite; }
        @keyframes blink { 50% { opacity: 0; } }

      `}</style>
      <main className={`portal ${PORTAL_BG[theme]}`}>
        <div className="portal__bg-effect" aria-hidden="true" />
        <div className="portal__glitch" aria-hidden="true" />

        <div className="portal__panel panel">
          {/* Diagnostic Bar */}
          <div style={{ fontFamily: 'var(--mono-font, "Space Mono", monospace)', fontSize: '0.8rem', color: 'var(--emerald, #2BE066)', marginBottom: '1.5rem', borderBottom: '1px solid var(--emerald-dim, #1FAF5A)', paddingBottom: '0.75rem', letterSpacing: '0.05em' }}>
            <div style={{ marginBottom: '0.5rem' }}>PORTAL BREACH // DIMENSION: [{portalType.toUpperCase()}]</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div>STABILITY: {'█'.repeat(Math.floor(stabilityPct/10))}{'░'.repeat(10-Math.floor(stabilityPct/10))} {stabilityPct}%</div>
            </div>
          </div>

          {/* Header */}
          <div className="portal__header">
            <span className="portal__icon">{PORTAL_ICON[portalType]}</span>
            <h1 className="portal__title">{PORTAL_TITLE[portalType] ?? 'Portal'}</h1>
            <p className="portal__subtitle">
              You entered a wrong flag. Solve the puzzle to return.
            </p>
          </div>

          {/* Portal Environment Render */}
          {renderEnvironment(portalType)}

          {/* Puzzle Interface */}
          <div className="portal__card">
            <div style={{ fontFamily: 'var(--mono-font, "Space Mono", monospace)', fontSize: '0.8rem', color: 'var(--emerald)', marginBottom: '1rem' }}>
              PORTAL STABILITY {'█'.repeat(Math.floor(stabilityPct/10))}{'░'.repeat(10-Math.floor(stabilityPct/10))} {stabilityPct}%<br/>
              DIMENSIONAL SIGNATURE: [{portalType}]<br/>
              ANOMALY: DETECTED<br/>
              ────────────────<br/>
              DECRYPTION TERMINAL
            </div>
            <div className="portal__clue">
              {challenge.portalPuzzle.description}
            </div>

            <form onSubmit={handlePuzzleSubmit} className="portal__puzzle-form">
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--s1, #0A0D0A)', border: '1px solid var(--emerald-dim, #1FAF5A)', padding: '0.5rem 1rem', borderRadius: '4px' }}>
                <span style={{ color: 'var(--emerald, #2BE066)', marginRight: '0.5rem', fontFamily: 'var(--mono-font, "Space Mono", monospace)' }}>&gt; ENTER RESPONSE</span>
                <input
                  type="text"
                  value={puzzleInput}
                  onChange={(e) => setPuzzleInput(e.target.value)}
                  placeholder="[________________]"
                  className="portal__puzzle-input"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary, #E8EFE9)', flex: 1, outline: 'none', fontFamily: 'var(--mono-font, "Space Mono", monospace)', marginLeft: '1rem' }}
                  disabled={puzzleSolved}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="portal__puzzle-btn"
                style={{ marginTop: '1rem', width: '100%', background: 'var(--emerald-dim, #1FAF5A)', color: 'var(--s0, #050705)', border: 'none', padding: '0.75rem', fontFamily: 'var(--heading-font, "Barlow Condensed", sans-serif)', fontSize: '1.1rem', cursor: puzzleSolved ? 'default' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                disabled={puzzleSolved}
              >
                {puzzleSolved ? '✓ STABILIZED' : '[ STABILIZE PORTAL ]'}
              </button>
            </form>

            {puzzleError && <p className="portal__puzzle-error" style={{ color: 'var(--danger, #C73A32)', marginTop: '1rem', fontFamily: 'var(--mono-font, "Space Mono", monospace)', fontSize: '0.9rem' }}>✗ {puzzleError}</p>}
            {puzzleSolved && (
              <div className="portal__puzzle-success" style={{ color: 'var(--emerald, #2BE066)', marginTop: '1rem', fontFamily: 'var(--mono-font, "Space Mono", monospace)', fontSize: '0.9rem' }}>
                PORTAL STABILIZED — REALIGNING BREACH TERMINAL…
              </div>
            )}

            <div className="portal__hint" style={{ marginTop: '1rem' }}>
              💡 <em>{challenge.portalPuzzle.clue}</em>
            </div>
          </div>

          {/* No manual return/bypass. Solving the puzzle is the only way back;
              on success the component auto-navigates to the original challenge. */}
          <div className="portal__actions" style={{ marginTop: '2rem', textAlign: 'center', fontFamily: 'var(--mono-font, "Space Mono", monospace)', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
            {puzzleSolved ? (
              <span style={{ color: 'var(--emerald, #2BE066)' }}>◆ RETURN VECTOR LOCKED — REENTERING BREACH TERMINAL…</span>
            ) : (
              <span style={{ color: 'var(--text-muted, #66736A)' }}>⚠ PORTAL SEALED — STABILIZE THE ANOMALY TO RETURN</span>
            )}
          </div>
        </div>
      </main>
    </PageTransition>
  )
}
