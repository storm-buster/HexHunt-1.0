import { useState, type FormEvent, type CSSProperties, type ClipboardEvent, type DragEvent } from 'react'
import { recordSignal } from '../anticheat/telemetry'

type SubmitResult = 'correct' | 'incorrect' | 'duplicate' | 'locked' | 'not_live'

interface Props {
  /** Submits the flag to the backend and resolves with the server verdict. */
  onSubmit: (value: string) => Promise<SubmitResult>
  onCorrect: () => void
  onWrong: () => void
  color?: string
  glow?: string
}

export default function FlagInput({ onSubmit, onCorrect, onWrong, color, glow }: Props) {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle')
  const [successPhase, setSuccessPhase] = useState<'match' | 'granted'>('match')
  const [note, setNote] = useState<string>('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || status === 'checking' || status === 'success') return
    setStatus('checking')
    setNote('')

    // Server-authoritative validation — no flag ever exists on the client.
    let result: SubmitResult = 'incorrect'
    try {
      result = await onSubmit(input.trim())
    } catch {
      result = 'incorrect'
    }

    if (result === 'correct' || result === 'duplicate') {
      setStatus('success')
      setSuccessPhase('match')
      setTimeout(() => {
        setSuccessPhase('granted')
        setTimeout(onCorrect, 300)
      }, 300)
    } else {
      setStatus('error')
      if (result === 'locked') setNote('CHALLENGE LOCKED')
      else if (result === 'not_live') setNote('CTF IS NOT LIVE')
      onWrong()
    }
  }

  // HARD RULE: the answer must be TYPED. Intercept every paste / clipboard /
  // text-drop path (covers Ctrl+V, Cmd+V, context-menu Paste, drag-drop) and
  // record a coarse anti-cheat signal (never the clipboard contents). This is an
  // interaction restriction only — the server remains authoritative.
  const blockPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    recordSignal('PASTE_ATTEMPT')
  }
  const blockDrop = (e: DragEvent<HTMLInputElement>) => {
    e.preventDefault()
    recordSignal('DROP_TEXT_ATTEMPT')
  }
  const blockDragOver = (e: DragEvent<HTMLInputElement>) => {
    e.preventDefault()
  }
  const blockCopyCut = (e: ClipboardEvent<HTMLInputElement>) => {
    // Don't let the answer be lifted off the field either.
    e.preventDefault()
    recordSignal(e.type === 'cut' ? 'CUT_ATTEMPT' : 'COPY_ATTEMPT')
  }

  return (
    <>
      <style>{`
        .flag-input-wrap { position: relative; width: 100%; max-width: 600px; }
        .flag-input__note {
          margin: 0.5rem 0 0; font-family: var(--mono-font, "Space Mono", monospace);
          font-size: 0.68rem; letter-spacing: 0.06em; color: var(--text-muted, #888);
        }
        .flag-status { 
          display: inline-flex; align-items: center; gap: 8px;
          font-family: var(--mono-font, "Space Mono", monospace); font-size: 0.75rem; letter-spacing: 0.1em;
          padding: 6px 12px; border-radius: 4px; margin-bottom: 0.75rem;
          text-transform: uppercase;
          transition: all 0.3s ease;
        }
        .flag-status--idle { color: var(--text-muted, #888); border: 1px solid var(--border, #333); background: var(--s1, #111); }
        .flag-status--checking { color: var(--signal, #f0b93d); border: 1px solid rgba(240,185,61,0.3); background: rgba(240,185,61,0.05); }
        .flag-status--success { color: var(--emerald, #2BE066); border: 1px solid var(--border-emerald, #2BE066); background: rgba(43,224,102,0.1); }
        .flag-status--error { color: var(--danger, #c73a32); border: 1px solid rgba(199,58,50,0.5); background: rgba(199,58,50,0.1); }
        
        .flag-status__dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: currentColor;
        }
        
        .flag-status--idle .flag-status__dot { animation: blink 1.5s ease-in-out infinite; }
        .flag-status--checking .flag-status__dot { animation: blink 0.5s ease-in-out infinite; }
        
        .flag-input {
          display: flex;
          position: relative;
          overflow: hidden;
          border-radius: 4px;
        }
        
        .flag-input__field {
          flex: 1;
          padding: 12px 16px;
          font-family: var(--mono-font, "Space Mono", monospace);
          font-size: 1rem;
          background: var(--s1, #111);
          color: var(--text-primary, #fff);
          border: 1px solid var(--border, #333);
          border-right: none;
          outline: none;
          border-radius: 4px 0 0 4px;
          transition: border-color 0.3s;
        }
        
        .flag-input__field:focus {
          border-color: var(--ch-color, var(--emerald, #2BE066));
        }

        .flag-input--checking .flag-input__field {
          position: relative;
        }
        
        .flag-input--checking::after {
          content: ''; 
          position: absolute; 
          top: 0; left: 0;
          width: 60px; height: 100%;
          background: linear-gradient(90deg, transparent, var(--ch-glow, var(--emerald-glow, rgba(43,224,102,0.5))), transparent);
          animation: scanSweep 0.6s ease-in-out infinite;
          pointer-events: none;
        }
        
        @keyframes scanSweep { 
          from { left: -60px; } 
          to { left: 100%; } 
        }

        .flag-input__btn {
          padding: 0 24px;
          background: var(--s2, #222);
          color: var(--text-primary, #fff);
          border: 1px solid var(--border, #333);
          border-radius: 0 4px 4px 0;
          font-family: var(--mono-font, "Space Mono", monospace);
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .flag-input__btn:hover:not(:disabled) {
          background: var(--ch-color, var(--emerald, #2BE066));
          color: #000;
        }
        
        .flag-input__btn:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .flag-input--success .flag-input__field,
        .flag-input--success .flag-input__btn {
          border-color: var(--emerald, #2BE066);
          animation: emeraldPulse 0.5s ease-out;
        }
        
        .flag-input--success .flag-input__btn {
          background: var(--emerald, #2BE066);
          color: #000;
        }

        @keyframes emeraldPulse {
          0% { box-shadow: 0 0 0 0 var(--emerald-glow, rgba(43,224,102,0.4)); }
          100% { box-shadow: 0 0 0 20px transparent; }
        }

        .flag-input--error {
          animation: errorShake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
        
        .flag-input--error .flag-input__field,
        .flag-input--error .flag-input__btn {
          border-color: var(--danger, #c73a32);
        }

        @keyframes errorShake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
        
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .flag-input--checking::after,
          .flag-input--error,
          .flag-status--idle .flag-status__dot,
          .flag-status--checking .flag-status__dot,
          .flag-input--success .flag-input__field,
          .flag-input--success .flag-input__btn {
            animation: none !important;
          }
        }
      `}</style>

      <div
        className="flag-input-wrap"
        style={{
          '--ch-color': color || 'var(--emerald, #2BE066)',
          '--ch-glow': glow || 'var(--emerald-glow, rgba(43,224,102,0.5))',
        } as CSSProperties}
      >
        <div className={`flag-status flag-status--${status}`}>
          <span className="flag-status__dot" />
          {status === 'idle' && 'AWAITING INPUT'}
          {status === 'checking' && 'VERIFYING SIGNATURE...'}
          {status === 'success' && successPhase === 'match' && 'SIGNATURE MATCH'}
          {status === 'success' && successPhase === 'granted' && 'ACCESS GRANTED'}
          {status === 'error' && (note || 'SIGNATURE REJECTED')}
        </div>

        <form 
          onSubmit={handleSubmit} 
          className={`flag-input flag-input--${status}`}
          data-sfx={status === 'success' ? 'correct' : status === 'error' ? 'wrong' : undefined}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={blockPaste}
            onDrop={blockDrop}
            onDragOver={blockDragOver}
            onCopy={blockCopyCut}
            onCut={blockCopyCut}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="DOOM{...}"
            className="flag-input__field"
            aria-describedby="flag-input-note"
            disabled={status === 'checking' || status === 'success'}
          />
          <button
            type="submit"
            className="flag-input__btn"
            disabled={status === 'checking' || status === 'success'}
          >
            {status === 'success' ? '✓' : 'EXECUTE'}
          </button>
        </form>

        <p id="flag-input-note" className="flag-input__note">
          Type your answer manually — paste is disabled.
        </p>
      </div>
    </>
  )
}
