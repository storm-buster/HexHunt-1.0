import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the API client so we can inspect exactly what telemetry sends.
vi.mock('../api/client', () => ({
  api: { telemetry: vi.fn().mockResolvedValue({ ok: true, recorded: 1 }) },
}))

import { api } from '../api/client'
import { recordSignal, flushSignals, _pendingForTest } from './telemetry'

describe('anti-cheat telemetry client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // drain any queued signals from previous tests
    return flushSignals()
  })

  it('batches signals as {type,count} and sends only coarse counters (no content)', async () => {
    recordSignal('COPY_ATTEMPT')
    recordSignal('COPY_ATTEMPT')
    recordSignal('PASTE_ATTEMPT')
    expect(_pendingForTest()).toEqual({ COPY_ATTEMPT: 2, PASTE_ATTEMPT: 1 })

    await flushSignals()

    expect(api.telemetry).toHaveBeenCalledTimes(1)
    const sent = (api.telemetry as any).mock.calls[0][0] as Array<Record<string, unknown>>
    // Only type + count keys — never clipboard/answer/value/content payloads.
    for (const e of sent) {
      expect(Object.keys(e).sort()).toEqual(['count', 'type'])
      expect(JSON.stringify(e)).not.toMatch(/DOOM\{|answer|clipboard|value|content|password/i)
    }
    expect(sent).toEqual(expect.arrayContaining([
      { type: 'COPY_ATTEMPT', count: 2 },
      { type: 'PASTE_ATTEMPT', count: 1 },
    ]))
  })

  it('flush with an empty queue sends nothing', async () => {
    await flushSignals()
    expect(api.telemetry).not.toHaveBeenCalled()
  })

  it('is best-effort: a failing telemetry call never throws', async () => {
    ;(api.telemetry as any).mockRejectedValueOnce(new Error('network down'))
    recordSignal('WINDOW_BLUR')
    await expect(flushSignals()).resolves.toBeUndefined()
  })
})
