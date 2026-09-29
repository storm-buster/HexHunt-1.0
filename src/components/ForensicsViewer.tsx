import { useState } from 'react'

interface Props {
  challengeId: string
}

export default function ForensicsViewer({ challengeId }: Props) {
  const [showHex, setShowHex] = useState(false)

  const challengeData: Record<string, { pixels: [number, number, number][] }> = {
    'dn-01': {
      pixels: [
        [0, 0, 0], [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ],
    },
  }

  const data = challengeData[challengeId]

  return (
    <div className="forensics-viewer corner-brackets">
      <h3>◆ IMAGE ANALYSIS</h3>
      <div className="forensics-viewer__body">
        <button className="forensics__btn" onClick={() => setShowHex(!showHex)} type="button">
          {showHex ? '↑ HIDE PIXEL DATA' : '▶ REVEAL PIXEL DATA (HEX)'}
        </button>
        {showHex && data && (
          <pre className="forensics__hex">
{JSON.stringify(data.pixels, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}