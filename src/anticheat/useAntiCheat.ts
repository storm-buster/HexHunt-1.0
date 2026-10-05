import { useEffect } from 'react'
import { recordSignal, flushSignals } from './telemetry'

// Injected once: make gameplay content non-selectable while preserving inputs.
const STYLE_ID = 'ac-gameplay-style'
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
    body.ac-active, body.ac-active .challenge, body.ac-active main {
      -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;
      -webkit-touch-callout: none;
    }
    /* Preserve legitimate input: the answer field must remain fully usable. */
    body.ac-active input, body.ac-active textarea, body.ac-active [contenteditable="true"] {
      -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; user-select: text;
    }
    @media print { body.ac-active * { visibility: hidden !important; } }
  `
  document.head.appendChild(el)
}

/**
 * Copy-protection + behavioral telemetry for authenticated CTF GAMEPLAY pages
 * ONLY (mount this hook inside those route components — never in admin). It is a
 * DETERRENT, not a security boundary: the server stays authoritative. It cannot
 * (and does not claim to) prevent OS screenshots, phone cameras, or devtools.
 *
 * Behaviour while mounted:
 *  - challenge content is non-selectable (inputs stay selectable/typable)
 *  - copy / cut / context-menu / drag-copy are blocked (+ coarse telemetry)
 *  - Ctrl/Cmd+C,X,U,P,S and common devtools shortcuts are blocked (best-effort)
 *  - visibility/blur/focus are recorded as coarse signals (not blocked)
 */
export function useAntiCheat(): void {
  useEffect(() => {
    ensureStyle()
    document.body.classList.add('ac-active')

    const onCopy = (e: Event) => { e.preventDefault(); recordSignal('COPY_ATTEMPT') }
    const onCut = (e: Event) => { e.preventDefault(); recordSignal('CUT_ATTEMPT') }
    const onContextMenu = (e: Event) => { e.preventDefault(); recordSignal('CONTEXT_MENU_ATTEMPT') }
    const onDragStart = (e: Event) => { e.preventDefault() }

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      // Copy/cut: block (typing is unaffected — these only act on selections).
      if (k === 'c') { e.preventDefault(); recordSignal('COPY_ATTEMPT'); return }
      if (k === 'x') { e.preventDefault(); recordSignal('CUT_ATTEMPT'); return }
      // View-source / save → deter.
      if (k === 'u' || k === 's') { e.preventDefault(); recordSignal('DEVTOOLS_SHORTCUT_ATTEMPT'); return }
      // Print → deter (best-effort; print CSS also hides content).
      if (k === 'p') { e.preventDefault(); recordSignal('PRINT_ATTEMPT'); return }
      // Devtools combos (Ctrl/Cmd+Shift+I/J/C).
      if (e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) {
        e.preventDefault(); recordSignal('DEVTOOLS_SHORTCUT_ATTEMPT')
      }
    }

    const onVisibility = () => { if (document.hidden) recordSignal('VISIBILITY_HIDDEN') }
    const onBlur = () => recordSignal('WINDOW_BLUR')
    const onFocus = () => recordSignal('WINDOW_FOCUS')

    // Capture phase so content handlers run before anything else.
    document.addEventListener('copy', onCopy, true)
    document.addEventListener('cut', onCut, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('dragstart', onDragStart, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)

    return () => {
      document.body.classList.remove('ac-active')
      document.removeEventListener('copy', onCopy, true)
      document.removeEventListener('cut', onCut, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      void flushSignals()
    }
  }, [])
}
