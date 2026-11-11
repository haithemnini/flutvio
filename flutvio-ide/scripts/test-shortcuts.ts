/**
 * scripts/test-shortcuts.ts — the Mac editing keys the terminal translates for the shell, and the
 * shortcut list shown in Settings.
 * Run: npx tsx scripts/test-shortcuts.ts
 */

import { SHORTCUT_GROUPS, terminalKey } from '../src/renderer/src/lib/shortcuts'

let failed = 0
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`)
}
const key = (k: string, mods: Partial<{ metaKey: boolean; altKey: boolean; ctrlKey: boolean; shiftKey: boolean }> = {}): string | null =>
  terminalKey({ key: k, metaKey: false, altKey: false, ctrlKey: false, shiftKey: false, ...mods })

check('plain Backspace is left to the terminal', key('Backspace'), null)
check('⌥⌫ deletes the previous word', key('Backspace', { altKey: true }), '\x17')
check('⌥⌦ deletes the next word', key('Delete', { altKey: true }), '\x1bd')
check('⌘⌫ deletes the line', key('Backspace', { metaKey: true }), '\x15')
check('⌥← / ⌥→ move by word', [key('ArrowLeft', { altKey: true }), key('ArrowRight', { altKey: true })], ['\x1bb', '\x1bf'])
check('⌘← / ⌘→ jump to line start / end', [key('ArrowLeft', { metaKey: true }), key('ArrowRight', { metaKey: true })], ['\x01', '\x05'])
check('⇧↩ is a newline without submit', key('Enter', { shiftKey: true }), '\x1b\r')
check('plain Enter, ⌃C and letters are untouched', [key('Enter'), key('c', { ctrlKey: true }), key('a'), key('v', { metaKey: true })], [null, null, null, null])

const all = SHORTCUT_GROUPS.flatMap((g) => g.items)
check('shortcut list: every entry has keys and a label', all.every((s) => s.keys.trim() && s.label.trim()), true)
check('shortcut list: no duplicate rows inside a group', SHORTCUT_GROUPS.every((g) => new Set(g.items.map((s) => s.keys)).size === g.items.length), true)

console.log(`${10 - failed}/10 passed`)
process.exit(failed ? 1 : 0)
