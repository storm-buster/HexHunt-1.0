import { useGame } from '../contexts/GameContext'

// Dynamic, non-intrusive watermark tiled across gameplay content. Identity comes
// from the authoritative server-hydrated GameContext (never client-supplied).
// Contains ONLY safe identifiers (team name, player display name, session #) —
// never passwords, hashes, tokens, cookies, flags, or answers. pointer-events
// is disabled so it never blocks challenge controls, and it is faint enough to
// read challenges through, yet hard to crop out of a screenshot (repeated tiles).
export default function Watermark() {
  const { state } = useGame()
  const player = state.participant?.name ?? ''
  const team = state.team?.name ?? ''
  const session = state.event?.session?.sessionNumber

  if (!player && !team) return null // not yet authenticated/hydrated

  const parts = [team, player].filter(Boolean)
  const label = `${parts.join(' · ')}${session ? ` · S${session}` : ''}`
  // Enough repeats to tile a large viewport without being obtrusive.
  const tiles = Array.from({ length: 60 }, (_, i) => i)

  return (
    <div className="ac-watermark" aria-hidden="true" data-testid="ac-watermark">
      <style>{`
        .ac-watermark {
          position: fixed; inset: 0; z-index: 40;
          pointer-events: none; user-select: none; overflow: hidden;
          display: flex; flex-wrap: wrap; align-content: center; justify-content: center;
          gap: 48px 64px; transform: rotate(-24deg) scale(1.4);
          opacity: 0.06;
        }
        .ac-watermark__tag {
          font-family: var(--mono-font, "Space Mono", monospace);
          font-size: 0.8rem; letter-spacing: 0.08em; white-space: nowrap;
          color: var(--emerald, #2BE066);
        }
        .ac-watermark__badge {
          position: fixed; right: 10px; bottom: 10px; z-index: 41;
          pointer-events: none; user-select: none;
          font-family: var(--mono-font, "Space Mono", monospace);
          font-size: 0.62rem; letter-spacing: 0.06em;
          color: var(--text-muted, #888); opacity: 0.5;
          background: rgba(0,0,0,0.35); padding: 2px 8px; border-radius: 3px;
        }
        @media print { .ac-watermark { opacity: 0.25 !important; } }
      `}</style>
      {tiles.map((i) => (
        <span className="ac-watermark__tag" key={i}>{label}</span>
      ))}
      <div className="ac-watermark__badge">{label}</div>
    </div>
  )
}
