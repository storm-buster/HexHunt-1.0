import { useState } from 'react'

export default function DecoderTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode] = useState<'hex2bin' | 'bin2b64' | 'b642txt' | 'caesar' | 'rot13'>('hex2bin')
  const [error, setError] = useState('')

  const process = () => {
    setError('')
    try {
      switch (mode) {
        case 'hex2bin': {
          let hex = input.replace(/\s+/g, '').replace(/0x/gi, '')
          if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error('Invalid hex')
          if (hex.length % 2 !== 0) hex = '0' + hex
          const bytes = hex.match(/.{2}/g)!
          setOutput(bytes.map(b => parseInt(b, 16).toString(2).padStart(8, '0')).join(' '))
          break
        }
        case 'bin2b64': {
          const bin = input.replace(/\s+/g, '')
          if (!/^[01]+$/.test(bin)) throw new Error('Invalid binary')
          const padded = bin.padEnd(Math.ceil(bin.length / 8) * 8, '0')
          const str = padded.match(/.{8}/g)!.map(b => String.fromCharCode(parseInt(b, 2))).join('')
          setOutput(btoa(str))
          break
        }
        case 'b642txt': {
          setOutput(atob(input))
          break
        }
        case 'caesar':
        case 'rot13': {
          setOutput(input.replace(/[a-zA-Z]/g, c => {
            const base = c >= 'a' ? 97 : 65
            return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base)
          }))
          break
        }
      }
    } catch (err: any) {
      setError(err.message || 'Decode failed')
    }
  }

  return (
    <div className="decoder-tool corner-brackets">
      <h3>◆ MULTIVERSE DECODER</h3>
      <div className="decoder-tool__body">
        <select className="decoder__mode" value={mode} onChange={e => setMode(e.target.value as any)}>
          <option value="hex2bin">HEX → BINARY</option>
          <option value="bin2b64">BINARY → BASE64</option>
          <option value="b642txt">BASE64 → TEXT</option>
          <option value="caesar">CAESAR (SHIFT 13)</option>
          <option value="rot13">ROT13</option>
        </select>
        <div className="decoder__io">
          <label>INPUT STREAM</label>
          <textarea className="decoder__input" value={input} onChange={e => setInput(e.target.value)} placeholder="Paste encoded data..." rows={3} />
        </div>
        <button className="decoder__btn" onClick={process} type="button">▶ EXECUTE DECODE</button>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.78rem', fontFamily: 'var(--mono)' }}>✗ {error}</p>}
        <div className="decoder__io">
          <label>OUTPUT STREAM</label>
          <textarea className="decoder__output" value={output} readOnly rows={3} placeholder="Decoded output..." />
        </div>
      </div>
    </div>
  )
}
