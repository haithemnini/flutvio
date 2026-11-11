/**
 * TerminalView.tsx — the workspace shell (xterm.js + node-pty).
 *
 * Uses the Phase 0 winner, Approach D: unicode11 widths + RTL line ordering
 * (createRtlStream) + inline row spans (.rtl-inline) so Arabic reads correctly.
 * Remount (change `key`) to start a fresh shell in another folder.
 */

import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { createRtlStream } from '../../lib/rtl-preprocess'
import { currentTheme, onThemeChange } from '../../lib/appearance'
import { terminalTheme } from '../../lib/themes'
import { fontStack, getSettings, subscribeSettings } from '../../lib/settings'
import { runCommand, useCommand } from '../../lib/commands'
import { terminalKey } from '../../lib/shortcuts'

interface Props {
  /** PTY session id (one per terminal tab). */
  id: string
  /** Folder the shell starts in (usually the Flutter project). */
  cwd?: string
  /** Typed into the new shell (e.g. resuming an agent session). */
  command?: string
  /** Shown and selected: takes keyboard focus when it becomes true. */
  active?: boolean
  /** The program rang the bell (agents do this when they need attention). */
  onBell?: () => void
}

const KEY_NAMES: Record<number, string> = { 8: 'Backspace', 46: 'Delete', 37: 'ArrowLeft', 39: 'ArrowRight', 13: 'Enter' }

export default function TerminalView({ id, cwd, command, active = false, onBell }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const bellRef = useRef(onBell)
  bellRef.current = onBell

  // Typing goes to the terminal that is showing.
  useEffect(() => {
    if (!active) return
    termRef.current?.focus()
    if (import.meta.env.DEV) Object.assign(window, { __flutvioTerm: termRef.current })
  }, [active])

  // Menu: Terminal › Clear (⌘K is handled in the key handler below) and Edit › Select All.
  useCommand(['clear-terminal', 'select-all'], (cmd) => {
    if (cmd.id === 'clear-terminal') {
      if (activeRef.current) termRef.current?.clear()
    } else if (containerRef.current?.contains(document.activeElement)) termRef.current?.selectAll()
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cleanup: (() => void) | null = null
    let cancelled = false

    // xterm measures the cell size once, so wait for the bundled font first.
    void document.fonts
      .load('13px "JetBrains Mono"')
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) cleanup = mount(el)
      })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [id, cwd])

  function mount(el: HTMLDivElement): () => void {
    const s0 = getSettings()
    const term = new Terminal({
      fontFamily: fontStack(s0.editorFontFamily),
      fontSize: s0.terminalFontSize,
      lineHeight: 1.35,
      theme: terminalTheme(currentTheme()),
      scrollback: 10_000,
      cursorBlink: s0.terminalCursorBlink,
      cursorStyle: s0.terminalCursor,
      allowProposedApi: true, // needed by the unicode11 addon
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.open(el)
    fit.fit()
    termRef.current = term
    if (activeRef.current) {
      term.focus()
      if (import.meta.env.DEV) Object.assign(window, { __flutvioTerm: term })
    }

    // Mac editing keys (word / line delete and movement, ⇧↩) and the terminal's own ⌘K / ⌘D.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      // keyCode is the physical key: with ⌥ held, `key` can be a composed character instead of its name.
      const seq = terminalKey({ key: KEY_NAMES[e.keyCode] ?? e.key, metaKey: e.metaKey, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
      if (seq !== null) {
        e.preventDefault()
        window.flutvio.pty.write(id, seq)
        return false
      }
      if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
        const k = e.key.toLowerCase()
        if (k === 'k') {
          e.preventDefault()
          term.clear()
          return false
        }
        if (k === 'd') {
          e.preventDefault()
          runCommand({ id: 'split-terminal' })
          return false
        }
      }
      return true
    })
    const bell = term.onBell(() => bellRef.current?.())

    // PTY → screen (Arabic-first lines are re-ordered to read right-to-left).
    const rtl = createRtlStream()
    const offData = window.flutvio.pty.onData((sid, data) => {
      if (sid === id) term.write(rtl.push(data))
    })
    const offExit = window.flutvio.pty.onExit((sid, code) => {
      if (sid === id) term.write(`\r\n\x1b[2m[shell exited with code ${code}]\x1b[0m\r\n`)
    })
    // Keyboard → PTY
    const input = term.onData((data) => window.flutvio.pty.write(id, data))

    // Creating a session replaces any previous one in the main process, so a
    // StrictMode double-mount simply ends with the second shell alive.
    void window.flutvio.pty.create({ id, cols: term.cols, rows: term.rows, cwd, command })

    const observer = new ResizeObserver(() => {
      if (!el.offsetWidth || !el.offsetHeight) return // hidden
      fit.fit()
      void window.flutvio.pty.resize(id, term.cols, term.rows)
    })
    observer.observe(el)

    // Theme and terminal settings apply live.
    const offTheme = onThemeChange(() => {
      term.options.theme = terminalTheme(currentTheme())
    })
    const offSettings = subscribeSettings(() => {
      const s = getSettings()
      const font = fontStack(s.editorFontFamily)
      if (term.options.fontSize !== s.terminalFontSize || term.options.fontFamily !== font) {
        term.options.fontSize = s.terminalFontSize
        term.options.fontFamily = font
        fit.fit()
        void window.flutvio.pty.resize(id, term.cols, term.rows)
      }
      term.options.cursorStyle = s.terminalCursor
      term.options.cursorBlink = s.terminalCursorBlink
    })

    return () => {
      offTheme()
      offSettings()
      observer.disconnect()
      bell.dispose()
      if (termRef.current === term) termRef.current = null
      input.dispose()
      offData()
      offExit()
      term.dispose()
    }
  }

  return <div ref={containerRef} className="rtl-inline h-full w-full" data-testid="terminal" />
}
