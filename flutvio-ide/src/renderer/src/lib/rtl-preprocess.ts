/**
 * rtl-preprocess.ts — Approach C (Phase 0) — pure, testable, no DOM.
 *
 * Problems this solves vs. the naive version:
 *  - Never touches ANSI/OSC escape sequences (colors, cursor moves).
 *  - Only reverses Arabic runs; Latin/numbers keep their order.
 *  - Buffers partial lines so a chunk boundary never splits a line.
 *
 * Known limitation (to report in PROGRESS.md): it does NOT join Arabic letters
 * (contextual shaping), because a terminal grid cannot shape glyphs.
 */

const ARABIC = '\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF'
const ARABIC_CHAR = new RegExp(`[${ARABIC}]`)
// An Arabic run: starts with an Arabic letter, may contain spaces/Arabic punctuation.
const ARABIC_RUN = new RegExp(`[${ARABIC}][${ARABIC}\\s\\u060C\\u061B\\u061F]*`, 'g')
// ANSI CSI and OSC sequences — passed through untouched.
const ESCAPE = /(\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))/

export function containsArabic(text: string): boolean {
  return ARABIC_CHAR.test(text)
}

/** Reverses Arabic runs in a plain text segment (no escape sequences inside). */
export function reverseArabicRuns(text: string): string {
  return text.replace(ARABIC_RUN, (run) => {
    // Keep trailing whitespace outside the reversed block so spacing stays put.
    const trimmed = run.replace(/\s+$/, '')
    const tail = run.slice(trimmed.length)
    return [...trimmed].reverse().join('') + tail
  })
}

/** Processes one complete line: skips escape sequences, reverses Arabic text. */
export function preprocessLine(line: string): string {
  if (!containsArabic(line)) return line
  return line
    .split(ESCAPE)
    .map((part, i) => (i % 2 === 1 ? part : reverseArabicRuns(part))) // odd indexes are the captured escapes
    .join('')
}

/**
 * Stateful stream processor. Feed raw PTY chunks; get back text safe to write.
 * Incomplete trailing line is held until its newline arrives.
 */
export function createBidiStream(): { push: (chunk: string) => string; flush: () => string } {
  let pending = ''
  return {
    push(chunk: string): string {
      const data = pending + chunk
      const lastNl = data.lastIndexOf('\n')
      if (lastNl === -1) {
        pending = data
        return ''
      }
      pending = data.slice(lastNl + 1)
      return data
        .slice(0, lastNl + 1)
        .split('\n')
        .map((line, i, arr) => (i === arr.length - 1 ? line : preprocessLine(line)))
        .join('\n')
    },
    flush(): string {
      const out = preprocessLine(pending)
      pending = ''
      return out
    },
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// Approach D — RTL paragraph lines.
//
// Chromium (xterm's DOM renderer) already shapes Arabic and orders the letters
// inside an Arabic run correctly, but it lays every row out as an LTR paragraph,
// so "تشغيل flutter run على جهاز iPhone 15" reads left-to-right.
//
// For lines whose first strong character is Arabic (Unicode rule P2) we reorder
// the *runs* the way an RTL paragraph shows them:
//   - Arabic runs are written in logical order; Chromium displays them RTL with
//     correct letter joining. We never reverse Arabic letters ourselves.
//   - Spaces/punctuation at the edges of an Arabic run are placed manually
//     (reversed + bracket-mirrored), so they land on the correct side.
//   - An LRM mark before each Latin/number run stops Chromium from pulling
//     numbers into the preceding Arabic text.
// Lines starting with Latin text (prompts, commands, logs) are left untouched.
// ═══════════════════════════════════════════════════════════════════════════

/** LEFT-TO-RIGHT MARK (U+200E), zero-width. */
export const LRM = String.fromCodePoint(0x200e)

// Hebrew + Arabic blocks and Arabic presentation forms.
const RTL_RANGES: Array<[number, number]> = [
  [0x0590, 0x08ff],
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfeff],
]
// Latin (incl. accented), Greek, Cyrillic letters and ASCII digits.
const LTR_RANGES: Array<[number, number]> = [
  [0x30, 0x39],
  [0x41, 0x5a],
  [0x61, 0x7a],
  [0xc0, 0x24f],
  [0x370, 0x3ff],
  [0x400, 0x4ff],
]
const MIRROR: Record<string, string> = {
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<',
  '«': '»', '»': '«',
}

const SGR = /^\x1b\[[0-9;]*m$/
const ANY_ESCAPE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g

type Dir = 'L' | 'R' | 'N'

const inRanges = (cp: number, ranges: Array<[number, number]>): boolean =>
  ranges.some(([lo, hi]) => cp >= lo && cp <= hi)

function charDir(ch: string): Dir {
  const cp = ch.codePointAt(0) ?? 0
  if (inRanges(cp, RTL_RANGES)) return 'R'
  if (inRanges(cp, LTR_RANGES)) return 'L'
  return 'N'
}

/** Base direction from the first strong character, or null if there is none. */
export function baseDirection(text: string): 'ltr' | 'rtl' | null {
  for (const ch of text.replace(ANY_ESCAPE, '')) {
    const d = charDir(ch)
    if (d === 'R') return 'rtl'
    if (d === 'L') return 'ltr'
  }
  return null
}

interface Token {
  ch: string
  dir: Dir
  style: string // active SGR sequence(s) for this char; '' = default
}

/**
 * Splits a line into characters, remembering each one's color/style.
 * Returns null if the line has non-color escapes (cursor moves etc.) — those
 * lines are not safe to reorder.
 */
function tokenize(line: string): { tokens: Token[]; hasStyle: boolean; endStyle: string } | null {
  const tokens: Token[] = []
  let style = ''
  let hasStyle = false
  let last = 0
  const pushText = (text: string): void => {
    for (const ch of text) tokens.push({ ch, dir: charDir(ch), style })
  }
  ANY_ESCAPE.lastIndex = 0
  for (let m = ANY_ESCAPE.exec(line); m; m = ANY_ESCAPE.exec(line)) {
    pushText(line.slice(last, m.index))
    last = m.index + m[0].length
    if (!SGR.test(m[0])) return null
    hasStyle = true
    style = m[0] === '\x1b[0m' || m[0] === '\x1b[m' ? '' : style + m[0]
  }
  pushText(line.slice(last))
  return { tokens, hasStyle, endStyle: style }
}

/**
 * Neutrals (spaces, punctuation) between two strong characters of the same
 * direction take that direction; otherwise the paragraph direction (R).
 */
function resolveNeutrals(tokens: Token[]): Dir[] {
  const dirs = tokens.map((t) => t.dir)
  let i = 0
  while (i < dirs.length) {
    if (dirs[i] !== 'N') { i++; continue }
    let j = i
    while (j < dirs.length && dirs[j] === 'N') j++
    const before = i > 0 ? dirs[i - 1] : 'R'
    const after = j < dirs.length ? dirs[j] : 'R'
    const resolved: Dir = before === after ? before : 'R'
    for (let k = i; k < j; k++) dirs[k] = resolved
    i = j
  }
  return dirs
}

/** Neutrals placed by hand: reversed order, brackets mirrored. */
const manualNeutrals = (tokens: Token[]): Token[] =>
  [...tokens].reverse().map((t) => ({ ...t, ch: MIRROR[t.ch] ?? t.ch }))

/**
 * One RTL run, prepared for an LTR row: the Arabic core
 * stays in logical order (Chromium displays it RTL with joined letters); edge
 * spaces/punctuation are placed by hand on the correct side.
 */
function rtlSegment(tokens: Token[]): Token[] {
  const first = tokens.findIndex((t) => t.dir === 'R')
  if (first === -1) return manualNeutrals(tokens) // no letters at all
  let last = tokens.length - 1
  while (tokens[last].dir !== 'R') last--
  return [
    ...manualNeutrals(tokens.slice(last + 1)), // trailing → left side
    ...tokens.slice(first, last + 1),
    ...manualNeutrals(tokens.slice(0, first)), // leading → right side
  ]
}

/**
 * Converts one line (no newline) into the text to write to xterm so that it
 * displays as an RTL paragraph. Non-RTL lines are returned unchanged.
 */
export function toRtlDisplay(line: string): string {
  const cr = line.endsWith('\r') ? '\r' : ''
  const body = cr ? line.slice(0, -1) : line
  if (body.includes('\r') || baseDirection(body) !== 'rtl') return line

  const parsed = tokenize(body)
  if (!parsed) return line
  const { tokens, hasStyle, endStyle } = parsed
  const dirs = resolveNeutrals(tokens)

  // Group into runs of the same resolved direction.
  const runs: Array<{ dir: Dir; tokens: Token[] }> = []
  tokens.forEach((t, i) => {
    const prev = runs[runs.length - 1]
    if (prev && prev.dir === dirs[i]) prev.tokens.push(t)
    else runs.push({ dir: dirs[i], tokens: [t] })
  })

  // RTL paragraph: runs appear right-to-left, i.e. reversed for an LTR row.
  const ordered: Token[] = []
  for (const run of runs.reverse()) {
    if (run.dir === 'L') {
      // Shield numbers/Latin from the Arabic before them (not needed at col 0).
      if (ordered.length) ordered.push({ ch: LRM, dir: 'N', style: run.tokens[0].style })
      ordered.push(...run.tokens)
      continue
    }
    // Requires xterm row spans to be `display: inline` (see .rtl-inline in
    // globals.css) so Chromium's bidi flows across color/cursor spans.
    ordered.push(...rtlSegment(run.tokens))
  }

  if (!hasStyle) return ordered.map((t) => t.ch).join('') + cr

  // Re-emit colors per character so they follow their text after reordering.
  let out = ''
  let current: string | null = null
  for (const t of ordered) {
    if (t.style !== current) {
      out += '\x1b[0m' + t.style
      current = t.style
    }
    out += t.ch
  }
  // Leave the terminal in the style the original line ended with.
  return out + '\x1b[0m' + endStyle + cr
}

/**
 * Stream wrapper for Approach D. Unlike Approach C it never holds text back:
 * only lines that arrive complete (start-of-line to newline) inside a chunk are
 * reordered; partial lines (prompts, typing echo) pass through immediately.
 */
export function createRtlStream(): { push: (chunk: string) => string } {
  let atLineStart = true
  return {
    push(chunk: string): string {
      let out = ''
      let i = 0
      while (i < chunk.length) {
        const nl = chunk.indexOf('\n', i)
        if (nl === -1) {
          out += chunk.slice(i)
          atLineStart = false
          break
        }
        const line = chunk.slice(i, nl)
        out += (atLineStart ? toRtlDisplay(line) : line) + '\n'
        atLineStart = true
        i = nl + 1
      }
      return out
    },
  }
}
