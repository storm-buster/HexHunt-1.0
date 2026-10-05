import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { useEffect } from 'react'

// Mock the telemetry module so component handlers record calls synchronously.
vi.mock('./telemetry', () => ({
  recordSignal: vi.fn(),
  flushSignals: vi.fn().mockResolvedValue(undefined),
}))

// Mock GameContext for the watermark (authoritative, server-hydrated state).
let gameState: any = {}
vi.mock('../contexts/GameContext', () => ({
  useGame: () => ({ state: gameState }),
}))

import { recordSignal } from './telemetry'
import { useAntiCheat } from './useAntiCheat'
import FlagInput from '../components/FlagInput'
import Watermark from '../components/Watermark'

afterEach(() => { cleanup(); vi.clearAllMocks(); document.body.className = '' })

// Tiny host that mounts the gameplay copy-protection hook.
function Protected() {
  useAntiCheat()
  return <div data-testid="protected">challenge content</div>
}

describe('answer input — manual typing only (paste blocked)', () => {
  it('blocks paste and records a PASTE_ATTEMPT signal', () => {
    render(<FlagInput onSubmit={vi.fn().mockResolvedValue('incorrect')} onCorrect={vi.fn()} onWrong={vi.fn()} />)
    const input = screen.getByPlaceholderText('DOOM{...}')
    const prevented = !fireEvent.paste(input, { clipboardData: { getData: () => 'DOOM{pasted}' } })
    expect(prevented).toBe(true)
    expect(recordSignal).toHaveBeenCalledWith('PASTE_ATTEMPT')
  })

  it('blocks text drop into the answer field', () => {
    render(<FlagInput onSubmit={vi.fn().mockResolvedValue('incorrect')} onCorrect={vi.fn()} onWrong={vi.fn()} />)
    const input = screen.getByPlaceholderText('DOOM{...}')
    const prevented = !fireEvent.drop(input, { dataTransfer: { getData: () => 'DOOM{dropped}' } })
    expect(prevented).toBe(true)
    expect(recordSignal).toHaveBeenCalledWith('DROP_TEXT_ATTEMPT')
  })

  it('allows normal keyboard typing', () => {
    render(<FlagInput onSubmit={vi.fn().mockResolvedValue('incorrect')} onCorrect={vi.fn()} onWrong={vi.fn()} />)
    const input = screen.getByPlaceholderText('DOOM{...}') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'DOOM{typed}' } })
    expect(input.value).toBe('DOOM{typed}')
  })

  it('still submits the typed answer normally', async () => {
    const onSubmit = vi.fn().mockResolvedValue('correct')
    render(<FlagInput onSubmit={onSubmit} onCorrect={vi.fn()} onWrong={vi.fn()} />)
    const input = screen.getByPlaceholderText('DOOM{...}') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  DOOM{typed}  ' } })
    fireEvent.click(screen.getByText('EXECUTE'))
    expect(onSubmit).toHaveBeenCalledWith('DOOM{typed}')
  })

  it('shows the manual-typing instruction', () => {
    render(<FlagInput onSubmit={vi.fn().mockResolvedValue('incorrect')} onCorrect={vi.fn()} onWrong={vi.fn()} />)
    expect(screen.getByText(/Type your answer manually — paste is disabled\./i)).toBeTruthy()
  })
})

describe('gameplay copy-protection hook', () => {
  it('marks the body active while mounted and removes it on unmount', () => {
    const { unmount } = render(<Protected />)
    expect(document.body.classList.contains('ac-active')).toBe(true)
    unmount()
    expect(document.body.classList.contains('ac-active')).toBe(false)
  })

  it('blocks copy and records COPY_ATTEMPT', () => {
    render(<Protected />)
    const ev = new Event('copy', { cancelable: true, bubbles: true })
    document.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(recordSignal).toHaveBeenCalledWith('COPY_ATTEMPT')
  })

  it('blocks the context menu and records CONTEXT_MENU_ATTEMPT', () => {
    render(<Protected />)
    const ev = new Event('contextmenu', { cancelable: true, bubbles: true })
    document.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(recordSignal).toHaveBeenCalledWith('CONTEXT_MENU_ATTEMPT')
  })

  it('blocks Ctrl+C / Ctrl+P / Ctrl+U key combos', () => {
    render(<Protected />)
    for (const [key, signal] of [['c', 'COPY_ATTEMPT'], ['p', 'PRINT_ATTEMPT'], ['u', 'DEVTOOLS_SHORTCUT_ATTEMPT']] as const) {
      const ev = new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true, bubbles: true })
      document.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
      expect(recordSignal).toHaveBeenCalledWith(signal)
    }
  })

  it('does NOT block ordinary typing keys', () => {
    render(<Protected />)
    const ev = new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true })
    document.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('dynamic watermark', () => {
  beforeEach(() => {
    gameState = {
      participant: { id: 'u1', name: 'Avinash', email: 'a@x.com' },
      team: { id: 't1', name: 'Team Doom' },
      event: { session: { sessionNumber: 3 } },
    }
  })

  it('renders authoritative team + player + session identifiers', () => {
    render(<Watermark />)
    const wm = screen.getByTestId('ac-watermark')
    expect(wm.textContent).toContain('Team Doom')
    expect(wm.textContent).toContain('Avinash')
    expect(wm.textContent).toContain('S3')
  })

  it('contains no secrets (no flags, passwords, tokens, hashes)', () => {
    render(<Watermark />)
    const html = screen.getByTestId('ac-watermark').innerHTML
    expect(html).not.toMatch(/DOOM\{|password|passwordHash|Bearer |eyJ|token|cookie/i)
  })

  it('renders nothing before auth/team hydration', () => {
    gameState = { participant: null, team: null, event: null }
    const { container } = render(<Watermark />)
    expect(container.querySelector('[data-testid="ac-watermark"]')).toBeNull()
  })
})
