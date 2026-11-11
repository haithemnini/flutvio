/** Unit tests for the RTL preprocessors (Approach C and D). Run: npx tsx scripts/test-rtl-preprocess.ts */
import assert from 'node:assert/strict'
import {
  preprocessLine, reverseArabicRuns, createBidiStream, containsArabic,
  baseDirection, toRtlDisplay, createRtlStream, LRM,
} from '../src/renderer/src/lib/rtl-preprocess'

const cases: Array<[string, () => void]> = [
  ['English-only line is untouched', () => {
    assert.equal(preprocessLine('flutter run --machine'), 'flutter run --machine')
  }],
  ['Arabic run is reversed, Latin order kept', () => {
    assert.equal(reverseArabicRuns('مرحبا flutter'), 'ابحرم flutter')
  }],
  ['trailing spaces after Arabic stay in place', () => {
    assert.equal(reverseArabicRuns('مرحبا  '), 'ابحرم  ')
  }],
  ['ANSI color codes are not reversed or corrupted', () => {
    const colored = '\x1b[32mمرحبا\x1b[0m flutter'
    assert.equal(preprocessLine(colored), '\x1b[32mابحرم\x1b[0m flutter')
  }],
  ['OSC sequence (window title) survives', () => {
    const osc = '\x1b]0;مشروع\x07مرحبا'
    assert.equal(preprocessLine(osc), '\x1b]0;مشروع\x07ابحرم')
  }],
  ['stream holds partial line until newline', () => {
    const s = createBidiStream()
    assert.equal(s.push('مر'), '')           // no newline yet -> held
    assert.equal(s.push('حبا\n'), 'ابحرم\n') // completed -> emitted, reversed
  }],
  ['stream keeps prompt (no newline) pending until flush', () => {
    const s = createBidiStream()
    assert.equal(s.push('line1\nprompt> '), 'line1\n')
    assert.equal(s.flush(), 'prompt> ')
  }],
  ['containsArabic detects Arabic only', () => {
    assert.equal(containsArabic('abc'), false)
    assert.equal(containsArabic('abc م'), true)
  }],

  // ── Approach D: RTL paragraph lines ──
  ['D: base direction comes from the first strong character', () => {
    assert.equal(baseDirection('تشغيل flutter'), 'rtl')
    assert.equal(baseDirection('=== اختبار RTL'), 'rtl')
    assert.equal(baseDirection('admin % echo "تشغيل"'), 'ltr')
    assert.equal(baseDirection('=== 123 ==='), 'ltr')
    assert.equal(baseDirection('---'), null)
  }],
  ['D: lines starting with Latin are untouched', () => {
    const line = 'admin@mac ~ % echo "تشغيل flutter run"'
    assert.equal(toRtlDisplay(line), line)
  }],
  ['D: runs are ordered right-to-left, letters never reversed', () => {
    assert.equal(
      toRtlDisplay('تشغيل flutter run على جهاز iPhone 15'),
      `iPhone 15 على جهاز ${LRM}flutter run تشغيل`,
    )
  }],
  ['D: punctuation stays on the Arabic side', () => {
    assert.equal(
      toRtlDisplay('اسم المشروع: flutvio | اللغة: Dart'),
      `Dart :اللغة | ${LRM}flutvio :اسم المشروع`,
    )
  }],
  ['D: symbols at both ends of the line', () => {
    assert.equal(toRtlDisplay('=== اختبار RTL ==='), `=== ${LRM}RTL اختبار ===`)
  }],
  ['D: brackets at the edge are mirrored', () => {
    assert.equal(toRtlDisplay('مرحبا (عالم)'), '(مرحبا (عالم')
  }],
  ['D: numbers after Arabic get an LRM shield', () => {
    assert.equal(toRtlDisplay('البناء في 12 ثانية'), `ثانية ${LRM}12 البناء في`)
  }],
  ['D: pure Arabic line is unchanged', () => {
    assert.equal(toRtlDisplay('مرحبا بالعالم'), 'مرحبا بالعالم')
  }],
  ['D: trailing \\r is preserved', () => {
    assert.equal(toRtlDisplay('مرحبا flutter\r'), 'flutter مرحبا\r')
  }],
  ['D: colors follow their characters after reordering', () => {
    const out = toRtlDisplay('\x1b[32mنجح\x1b[0m flutter')
    assert.equal(out, '\x1b[0mflutter \x1b[0m\x1b[32mنجح\x1b[0m')
  }],
  ['D: a colored word inside Arabic text stays in logical order', () => {
    // Chromium orders it across spans (rows are display:inline in Approach D).
    const out = toRtlDisplay('\x1b[32mنجح\x1b[0m البناء')
    assert.equal(out, '\x1b[0m\x1b[32mنجح\x1b[0m البناء\x1b[0m')
  }],
  ['D: lines with cursor movement are left alone', () => {
    const line = '\x1b[2Kمرحبا flutter'
    assert.equal(toRtlDisplay(line), line)
  }],
  ['D: stream reorders complete lines, passes partial lines through at once', () => {
    const s = createRtlStream()
    assert.equal(s.push('مرحبا flutter\r\nprompt% '), 'flutter مرحبا\r\nprompt% ')
    assert.equal(s.push('مر'), 'مر') // typing echo is never delayed
    assert.equal(s.push('حبا flutter\n'), 'حبا flutter\n') // mid-line: not reordered
  }],
]

let failed = 0
for (const [name, fn] of cases) {
  try { fn(); console.log(`PASS  ${name}`) }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      -> ${(e as Error).message}`) }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed ? 1 : 0)
