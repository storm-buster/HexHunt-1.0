import { useState } from 'react'
import { useGame } from '../contexts/GameContext'

interface Props {
  challengeId: string
  hints: string[]
}

export default function HintsPanel({ challengeId, hints }: Props) {
  const { useHint } = useGame()
  const [hintIdx, setHintIdx] = useState(0)
  const [show, setShow] = useState(false)

  // Guard AFTER hooks so the hook count is stable regardless of `hints`.
  if (hints.length === 0) return null

  const revealHint = () => {
    setShow(true)
    useHint(challengeId)
  }

  const nextHint = () => {
    if (hintIdx < hints.length - 1) {
      setHintIdx(hintIdx + 1)
      useHint(challengeId)
    }
  }

  return (
    <div className="hints">
      <button className="hints__toggle" onClick={show ? () => setShow(false) : revealHint} type="button">
        {show ? '↑ HIDE INTEL' : `⚠ REVEAL INTEL (${hintIdx + 1}/${hints.length})`}
      </button>
      {show && (
        <div className="hints__content">
          <p className="hints__text">◆ {hints[hintIdx]}</p>
          {hintIdx < hints.length - 1 && (
            <button className="hints__next" onClick={nextHint} type="button">
              NEXT INTEL →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
