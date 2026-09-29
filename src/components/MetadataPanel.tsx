interface Props {
  headers: Record<string, string>
  title?: string
}

export default function MetadataPanel({ headers, title = 'RESPONSE HEADERS' }: Props) {
  return (
    <div className="metadata-panel corner-brackets">
      <h4>◆ {title}</h4>
      {Object.entries(headers).map(([key, val]) => (
        <div key={key} className="metadata-row">
          <span className="metadata-key">{key}:</span>
          <span className="metadata-val">{val}</span>
        </div>
      ))}
    </div>
  )
}
