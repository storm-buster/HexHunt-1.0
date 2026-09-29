interface Props {
  pixels: { pos: string; rgb: [number, number, number]; note?: string }[]
  title?: string
}

export default function HexViewer({ pixels, title = 'PIXEL DATA' }: Props) {
  const toHex = (r: number, g: number, b: number) =>
    `#${r.toString(16).padStart(2, '0').toUpperCase()}${g.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`

  return (
    <div className="hex-viewer corner-brackets">
      <div className="hex-viewer__header">
        <span className="hex-viewer__title">◆ {title}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          {pixels.length} ENTRIES
        </span>
      </div>
      {pixels.map((px, i) => (
        <div key={i} className="hex-viewer__pixel">
          <div className="hex-viewer__swatch" style={{ background: `rgb(${px.rgb.join(',')})` }} />
          <span className="hex-viewer__rgb">[{px.pos}] rgb({px.rgb.join(', ')})</span>
          <span className="hex-viewer__hex">{toHex(...px.rgb)}</span>
          {px.note && <span style={{ color: 'var(--signal)', fontSize: '0.65rem', fontFamily: 'var(--mono)' }}>⚠ {px.note}</span>}
        </div>
      ))}
    </div>
  )
}
