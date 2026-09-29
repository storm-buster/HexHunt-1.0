import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// Mutable mock state so we can simulate auth hydration (participant null -> set).
let mockState: any = { participant: null, stones: [], hidden: null }
vi.mock('../contexts/GameContext', () => ({
  useGame: () => ({ state: mockState }),
}))
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/team' }),
}))

import BattleworldOS from '../components/BattleworldOS'
import HintsPanel from '../components/HintsPanel'

describe('BattleworldOS — hooks-order regression (Team page black screen)', () => {
  beforeEach(() => {
    mockState = { participant: null, stones: [], hidden: null }
  })

  it('TEST 5 — renders null while auth is loading (no participant) without crashing', () => {
    const { container } = render(<BattleworldOS />)
    expect(container.querySelector('.bw-os')).toBeNull()
  })

  it('TEST 4/5 — does NOT crash when participant hydrates after first render', () => {
    // First render: unauthenticated (component returns null).
    const { rerender, container } = render(<BattleworldOS />)
    expect(container.querySelector('.bw-os')).toBeNull()

    // Auth resolves -> participant becomes available. Before the fix this threw
    // "Rendered more hooks than during the previous render" and blanked the app.
    mockState = { participant: { name: 'Avinash' }, stones: [], hidden: null }
    expect(() => rerender(<BattleworldOS />)).not.toThrow()
    expect(container.querySelector('.bw-os')).not.toBeNull()
  })
})

describe('HintsPanel — hooks-order regression', () => {
  it('renders nothing for empty hints and renders for non-empty, without hook errors', () => {
    const empty = render(<HintsPanel challengeId="wv-01" hints={[]} />)
    expect(empty.container.firstChild).toBeNull()

    const withHints = render(<HintsPanel challengeId="wv-01" hints={['hint a', 'hint b']} />)
    expect(withHints.container.querySelector('.hints')).not.toBeNull()
  })
})
