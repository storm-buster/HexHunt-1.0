import { api } from '../api/client'

// Coarse behavioral signal types — MUST mirror the server allow-list. We send
// only the type + a count; never any clipboard/answer/content payload.
export type AntiCheatSignal =
  | 'COPY_ATTEMPT'
  | 'CUT_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'DROP_TEXT_ATTEMPT'
  | 'CONTEXT_MENU_ATTEMPT'
  | 'PRINT_ATTEMPT'
  | 'DEVTOOLS_SHORTCUT_ATTEMPT'
  | 'VISIBILITY_HIDDEN'
  | 'WINDOW_BLUR'
  | 'WINDOW_FOCUS'

const pending = new Map<AntiCheatSignal, number>()
let timer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 4000

/** Queue a coarse signal; sent (batched) to the server after a debounce. */
export function recordSignal(type: AntiCheatSignal): void {
  pending.set(type, (pending.get(type) ?? 0) + 1)
  if (timer == null) timer = setTimeout(() => { void flushSignals() }, DEBOUNCE_MS)
}

/** Flush queued signals to the server. Best-effort — never throws, never blocks gameplay. */
export async function flushSignals(): Promise<void> {
  if (timer != null) { clearTimeout(timer); timer = null }
  if (pending.size === 0) return
  const events = Array.from(pending.entries()).map(([type, count]) => ({ type, count }))
  pending.clear()
  try {
    await api.telemetry(events)
  } catch {
    /* telemetry is best-effort evidence, not gameplay-critical — swallow errors */
  }
}

/** Test-only inspection of the queued batch. */
export function _pendingForTest(): Record<string, number> {
  return Object.fromEntries(pending)
}
