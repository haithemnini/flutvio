/**
 * RTLTestPane.tsx
 * ═══════════════════════════════════════════════════════════════════
 * Phase 0 — RTL/BiDi Proof of Concept
 *
 * Tests THREE approaches for Arabic text in xterm.js:
 *
 *   Approach A: Default xterm.js (no addon)
 *   Approach B: + xterm-addon-unicode11 (better CJK/Arabic char widths)
 *   Approach C: Server-side bidi-js preprocessing (flip RTL lines before display)
 *
 * HOW TO READ RESULTS:
 *   - Type `echo "مرحبا flutter run --machine"` in the terminal
 *   - Observe if Arabic renders left-to-right, right-to-left, or garbled
 *   - Use the approach switcher buttons and compare
 *   - Log results in PROGRESS.md
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { createBidiStream, createRtlStream } from '../../lib/rtl-preprocess'

// ─── Types ────────────────────────────────────────────────────────────────────

type RTLApproach = 'A_default' | 'B_unicode11' | 'C_bidi_preprocess' | 'D_rtl_lines'

interface ApproachInfo {
  id: RTLApproach
  label: string
  description: string
  risk: 'low' | 'medium' | 'high'
}

const APPROACHES: ApproachInfo[] = [
  {
    id: 'A_default',
    label: 'A: Default xterm',
    description: 'خام — xterm.js بدون إضافات. الأرجح سيكون مكسور.',
    risk: 'high',
  },
  {
    id: 'B_unicode11',
    label: 'B: + Unicode11',
    description: 'مع إضافة unicode11 لتحسين عرض المحارف العربية.',
    risk: 'medium',
  },
  {
    id: 'C_bidi_preprocess',
    label: 'C: Bidi Preprocess',
    description: 'معالجة عكس نصوص العربية في الواجهة قبل الكتابة إلى xterm (بدون لمس تسلسلات الألوان).',
    risk: 'high',
  },
  {
    id: 'D_rtl_lines',
    label: 'D: RTL Lines',
    description: 'مثل B، والسطر الذي يبدأ بالعربية يُقرأ من اليمين لليسار.',
    risk: 'low',
  },
]

// ─── Terminal Factory ─────────────────────────────────────────────────────────

function createTerminal(approach: RTLApproach): {
  term: Terminal
  fitAddon: FitAddon
} {
  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "Cascadia Code", "Noto Sans Mono", monospace',
    fontSize: 14,
    lineHeight: 1.5,
    letterSpacing: 0,
    theme: {
      background: '#0d0d10',
      foreground: '#e8e8ed',
      cursor: '#4f8ef7',
      cursorAccent: '#0d0d10',
      selectionBackground: '#4f8ef740',
      black: '#1a1a20',
      red: '#ef4444',
      green: '#3dd68c',
      yellow: '#f59e0b',
      blue: '#4f8ef7',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#e8e8ed',
      brightBlack: '#52525e',
      brightRed: '#f87171',
      brightGreen: '#6ee7b7',
      brightYellow: '#fbbf24',
      brightBlue: '#93c5fd',
      brightMagenta: '#c084fc',
      brightCyan: '#67e8f9',
      brightWhite: '#f8fafc',
    },
    allowTransparency: false,
    scrollback: 2000,
    // Required so the unicode11 addon can set the Unicode version
    allowProposedApi: approach === 'B_unicode11' || approach === 'D_rtl_lines',
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())

  if (approach === 'B_unicode11' || approach === 'D_rtl_lines') {
    const unicode11 = new Unicode11Addon()
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'
  }

  return { term, fitAddon }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RTLTestPane(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const disposeDataRef = useRef<(() => void) | null>(null)
  const disposeExitRef = useRef<(() => void) | null>(null)

  const [approach, setApproach] = useState<RTLApproach>('A_default')
  const [ptyReady, setPtyReady] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<'untested' | 'pass' | 'partial' | 'fail'>('untested')

  const appendLog = (msg: string): void => {
    setLog((prev) => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  // ── Mount terminal ──────────────────────────────────────────────────────────
  const mountTerminal = useCallback(async () => {
    if (!containerRef.current) return

    // Destroy previous terminal if switching approach
    if (termRef.current) {
      await window.flutvio.pty.kill('rtl')
      disposeDataRef.current?.()
      disposeExitRef.current?.()
      termRef.current.dispose()
      termRef.current = null
    }

    const { term, fitAddon } = createTerminal(approach)
    termRef.current = term
    fitAddonRef.current = fitAddon

    // Clear container
    containerRef.current.innerHTML = ''
    term.open(containerRef.current)
    fitAddon.fit()

    const { cols, rows } = term

    // Wire PTY
    const { pid } = await window.flutvio.pty.create({ id: 'rtl', cols, rows })
    setPtyReady(true)
    appendLog(`PTY spawned (pid=${pid}) — approach: ${approach}`)

    // Data from PTY → terminal display (Approach C uses a per-mount line-buffered stream)
    const bidi = createBidiStream()
    const rtl = createRtlStream()
    disposeDataRef.current = window.flutvio.pty.onData((_sid, data) => {
      term.write(
        approach === 'C_bidi_preprocess' ? bidi.push(data)
        : approach === 'D_rtl_lines' ? rtl.push(data)
        : data,
      )
    })

    disposeExitRef.current = window.flutvio.pty.onExit((_sid, code) => {
      appendLog(`PTY exited (code=${code})`)
      setPtyReady(false)
    })

    // User keystrokes → PTY
    term.onData((data) => {
      window.flutvio.pty.write('rtl', data)
    })

    // Resize observer
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      const { cols: c, rows: r } = term
      window.flutvio.pty.resize('rtl', c, r)
    })
    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [approach])

  useEffect(() => {
    const cleanup = mountTerminal()
    return () => {
      cleanup?.then((fn) => fn?.())
    }
  }, [mountTerminal])

  // ── Send Arabic test command ────────────────────────────────────────────────
  const sendArabicTest = (): void => {
    if (!ptyReady) return
    // A realistic Flutter dev workflow line with mixed Arabic/English
    const testCommands = [
      'echo "=== اختبار RTL ==="',
      'echo "تشغيل flutter run على جهاز iPhone 15"',
      'echo "⚡ Hot Reload جاهز | flutter run --machine"',
      'echo "اسم المشروع: flutvio | اللغة: Dart"',
      'printf "\\033[32mنجح\\033[0m البناء في 12 ثانية — build/app.apk\\n"',
    ]
    testCommands.forEach((cmd) => {
      window.flutvio.pty.write('rtl', cmd + '\r')
    })
    appendLog('Arabic test commands sent')
  }

  const currentApproach = APPROACHES.find((a) => a.id === approach)!

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-2 border-b border-border-subtle">
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-text-primary">
            Phase 0 — RTL/BiDi Proof of Concept
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            اختبار عرض النص العربي داخل xterm.js — سجّل النتائج في PROGRESS.md
          </p>
        </div>
        {/* Result badge */}
        <div className={`px-2.5 py-1 rounded text-xs font-mono font-medium border ${
          result === 'untested' ? 'bg-surface-3 text-text-secondary border-border-subtle' :
          result === 'pass'    ? 'bg-green-900/30 text-accent-green border-green-800/50' :
          result === 'partial' ? 'bg-yellow-900/30 text-accent-orange border-yellow-800/50' :
                                 'bg-red-900/30 text-accent-red border-red-800/50'
        }`}>
          {result === 'untested' ? '⏳ UNTESTED' :
           result === 'pass'    ? '✅ PASS' :
           result === 'partial' ? '⚠️ PARTIAL' : '❌ FAIL'}
        </div>
      </div>

      {/* ── Approach Switcher ── */}
      <div className="flex items-stretch gap-0 border-b border-border-subtle bg-surface-1">
        {APPROACHES.map((a) => (
          <button
            key={a.id}
            onClick={() => setApproach(a.id)}
            className={`flex-1 px-4 py-3 text-left transition-colors border-r border-border-subtle last:border-r-0 ${
              approach === a.id
                ? 'bg-surface-3 text-text-primary'
                : 'text-text-tertiary hover:bg-surface-2 hover:text-text-secondary'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                a.risk === 'low'    ? 'bg-accent-green' :
                a.risk === 'medium' ? 'bg-accent-orange' : 'bg-accent-red'
              }`} />
              <span className="text-xs font-mono font-semibold">{a.label}</span>
            </div>
            <p className="text-xs text-text-tertiary mt-1 font-arabic leading-relaxed">
              {a.description}
            </p>
          </button>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-1 border-b border-border-subtle">
        <button
          onClick={sendArabicTest}
          disabled={!ptyReady}
          className="px-3 py-1.5 text-xs font-mono bg-accent-blue/10 text-accent-blue border border-accent-blue/30 rounded hover:bg-accent-blue/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ⚡ إرسال أوامر Arabic/English
        </button>

        <div className="h-4 w-px bg-border-subtle" />

        <span className="text-xs text-text-tertiary font-mono">سجّل النتيجة:</span>

        {(['pass', 'partial', 'fail'] as const).map((r) => (
          <button
            key={r}
            onClick={() => {
              setResult(r)
              appendLog(`Result logged: ${r.toUpperCase()} (${currentApproach.label})`)
            }}
            className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
              result === r
                ? r === 'pass'    ? 'bg-accent-green/20 text-accent-green border-accent-green/40'
                : r === 'partial' ? 'bg-accent-orange/20 text-accent-orange border-accent-orange/40'
                :                   'bg-accent-red/20 text-accent-red border-accent-red/40'
                : 'text-text-tertiary border-border-subtle hover:border-border-default'
            }`}
          >
            {r === 'pass' ? '✅ Pass' : r === 'partial' ? '⚠️ Partial' : '❌ Fail'}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${ptyReady ? 'bg-accent-green' : 'bg-text-disabled'}`} />
          <span className="text-xs text-text-tertiary font-mono">
            {ptyReady ? 'PTY Ready' : 'Starting…'}
          </span>
        </div>
      </div>

      {/* ── Terminal + Log ── */}
      <div className="flex flex-1 min-h-0">
        {/* Terminal */}
        <div className="flex-1 relative overflow-hidden">
          <div
            ref={containerRef}
            className={`absolute inset-0 p-1 ${approach === 'D_rtl_lines' ? 'rtl-inline' : ''}`}
          />
        </div>

        {/* Result Log sidebar */}
        <div className="w-64 border-l border-border-subtle bg-surface-2 flex flex-col">
          <div className="px-3 py-2 border-b border-border-subtle">
            <span className="text-xs font-mono text-text-tertiary uppercase tracking-widest">
              Session Log
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {log.length === 0 && (
              <p className="text-xs text-text-disabled italic">سجّل فارغ — ابدأ الاختبار</p>
            )}
            {log.map((entry, i) => (
              <div key={i} className="text-xs text-text-secondary font-mono leading-relaxed break-all">
                {entry}
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-border-subtle">
            <p className="text-xs text-text-tertiary leading-relaxed font-arabic">
              بعد الاختبار، انسخ النتائج إلى:
            </p>
            <code className="text-xs text-accent-blue font-mono">PROGRESS.md</code>
          </div>
        </div>
      </div>
    </div>
  )
}
