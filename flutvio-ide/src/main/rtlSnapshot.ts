/**
 * rtlSnapshot.ts — Phase 0 automated visual test (dev only).
 *
 * Enabled only when FLUTVIO_RTL_SNAPSHOT=<output dir> is set.
 * For each approach (A/B/C): select it, send the Arabic/English test
 * commands, then save a PNG of the window. Quits when done.
 *
 * Run: FLUTVIO_RTL_SNAPSHOT=./rtl-results npm run dev
 */

import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const APPROACHES = [
  { label: 'A: Default xterm', file: 'A_default.png' },
  { label: 'B: + Unicode11', file: 'B_unicode11.png' },
  { label: 'C: Bidi Preprocess', file: 'C_bidi_preprocess.png' },
  { label: 'D: RTL Lines', file: 'D_rtl_lines.png' },
]

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function clickButton(win: BrowserWindow, text: string): Promise<boolean> {
  return win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => b.textContent && b.textContent.includes(${JSON.stringify(text)}))
    if (!btn || btn.disabled) return false
    btn.click()
    return true
  })()`)
}

// ─── Typing test: real keyboard events into the terminal (Approach D) ────────

/** Types text the way a keyboard does: keyDown → char → keyUp per character. */
async function typeText(win: BrowserWindow, text: string): Promise<void> {
  for (const ch of text) {
    const modifiers: Array<'shift'> = ch !== ch.toLowerCase() ? ['shift'] : []
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: ch, modifiers })
    win.webContents.sendInputEvent({ type: 'char', keyCode: ch, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: ch, modifiers })
    await wait(40)
  }
}

async function pressKey(win: BrowserWindow, keyCode: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    if (keyCode === 'Return') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await wait(120)
  }
}

async function shot(win: BrowserWindow, dir: string, file: string): Promise<void> {
  await wait(600)
  writeFileSync(join(dir, file), (await win.webContents.capturePage()).toPNG())
  console.log(`[rtl-snapshot] saved ${join(dir, file)}`)
}

/**
 * Types an Arabic command, moves the cursor inside the Arabic word, deletes
 * one letter and inserts another, then runs it. The command writes what the
 * shell actually received to a file, so correctness is checked exactly — not
 * just by looking at pixels.
 */
async function runTypingTest(win: BrowserWindow, dir: string): Promise<void> {
  const resultFile = join(dir, 'typed.txt')
  rmSync(resultFile, { force: true })

  if (!(await clickButton(win, 'D: RTL Lines'))) throw new Error('approach D button not found')
  await wait(3000)
  await win.webContents.executeJavaScript(
    `document.querySelector('.xterm-helper-textarea')?.focus(); true`,
  )

  await typeText(win, 'clear')
  await pressKey(win, 'Return')
  await wait(800)

  // 1) Type a mixed command with Arabic inside quotes.
  await typeText(win, `echo "مرحبا بالعالم" | tee ${resultFile}`)
  await shot(win, dir, 'T1_typed.png')

  // 2) Move the cursor back into the Arabic word "بالعالم".
  //    From the end: 1 for each char of ` | tee <path>`, `"`, then م ل ا.
  const tail = ` | tee ${resultFile}"`.length
  await pressKey(win, 'Left', tail + 3) // cursor now sits before the 2nd ا
  await shot(win, dir, 'T2_cursor_inside.png')

  // 3) Delete the letter before the cursor (ع) and insert ف instead.
  await pressKey(win, 'Backspace')
  await typeText(win, 'ف')
  await shot(win, dir, 'T3_edited.png')

  // 4) Run it.
  await pressKey(win, 'Return')
  await wait(1200)
  await shot(win, dir, 'T4_result.png')

  const expected = 'مرحبا بالفالم'
  const actual = existsSync(resultFile) ? readFileSync(resultFile, 'utf8').trim() : '(no file)'
  const ok = actual === expected
  console.log(`[rtl-typing] ${ok ? 'PASS' : 'FAIL'} expected="${expected}" actual="${actual}"`)
}

export function runRtlSnapshot(win: BrowserWindow): void {
  const outDir = process.env['FLUTVIO_RTL_SNAPSHOT']
  if (!outDir) return
  const dir = resolve(outDir)
  mkdirSync(dir, { recursive: true })

  // Surface renderer errors in the terminal so failures are diagnosable.
  win.webContents.on('console-message', (e) => {
    console.log(`[renderer:${e.level}] ${e.message}`)
  })

  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(1500)
      // Phase 1: the RTL test pane lives in the "RTL Lab" tab.
      await win.webContents.executeJavaScript(`document.querySelector('[data-testid="tab-rtl-lab"]')?.click()`)
      await wait(1500)
      for (const a of APPROACHES) {
        if (!(await clickButton(win, a.label))) throw new Error(`approach button not found: ${a.label}`)
        await wait(3000) // new terminal + PTY + shell prompt

        // The send button is disabled until the PTY is ready; retry briefly.
        let sent = false
        for (let i = 0; i < 10 && !sent; i++) {
          sent = await clickButton(win, 'إرسال أوامر')
          if (!sent) await wait(500)
        }
        if (!sent) throw new Error(`send button never enabled for ${a.label}`)
        await wait(3000)

        const image = await win.webContents.capturePage()
        writeFileSync(join(dir, a.file), image.toPNG())
        console.log(`[rtl-snapshot] saved ${join(dir, a.file)}`)
      }
      await runTypingTest(win, dir)
      console.log('[rtl-snapshot] done')
    } catch (err) {
      console.error('[rtl-snapshot] failed:', err)
      process.exitCode = 1
      try {
        writeFileSync(join(dir, 'failure.png'), (await win.webContents.capturePage()).toPNG())
      } catch {
        /* window may be gone */
      }
    } finally {
      app.quit()
    }
  })
}
