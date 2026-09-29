import type { ReactNode } from 'react'

interface Props {
  label: string
  children: ReactNode
}

export default function NarrativePanel({ label, children }: Props) {
  return (
    <div className="narrative-panel corner-brackets">
      <div className="narrative-panel__label">◆ {label}</div>
      <div className="narrative-panel__text">{children}</div>
    </div>
  )
}
