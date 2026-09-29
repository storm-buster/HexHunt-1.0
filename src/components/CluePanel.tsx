import { useState } from 'react'

interface Props {
  label: string
  body: string
  format?: 'code' | 'image' | 'terminal' | 'metadata'
  color?: string
}

export default function CluePanel({ label, body, format = 'code', color }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="clue-panel" style={{ ['--ch-color' as any]: color } as any}>
      <div className="clue-panel__header" onClick={() => setOpen(!open)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)}>
        <span className="clue-panel__label">{open ? '▼' : '▶'} {label}</span>
        <button className="clue-panel__toggle" type="button">
          {open ? 'HIDE' : 'REVEAL'}
        </button>
      </div>
      {open && (
        <div className="clue-panel__body">
          {format === 'image' ? (
            <div className="clue-panel__image" style={{
              padding: '2rem', background: 'var(--s0)', fontFamily: 'var(--mono)',
              fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center',
              border: '1px solid var(--border)', borderRadius: '6px',
            }}>
              ◆ IMAGE DATA ◆<br/><br/>
              <span style={{ whiteSpace: 'pre-wrap', textAlign: 'left', display: 'block' }}>{body}</span>
            </div>
          ) : format === 'terminal' ? (
            <div className="terminal">
              <div className="terminal__bar">
                <span className="terminal__dot terminal__dot--red" />
                <span className="terminal__dot terminal__dot--yellow" />
                <span className="terminal__dot terminal__dot--green" />
              </div>
              <div className="terminal__body" style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
            </div>
          ) : (
            <pre className="clue-panel__code">{body}</pre>
          )}
        </div>
      )}
    </div>
  )
}
