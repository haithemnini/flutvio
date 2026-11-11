/**
 * e2eHarness.ts — Phase 1 end-to-end test, driven through the real UI (dev only).
 *
 * Enabled only when FLUTVIO_E2E=<output dir> is set, together with:
 *   FLUTVIO_E2E_PROJECT  absolute path of a Flutter project
 *   FLUTVIO_E2E_DEVICE   device id (e.g. a booted iOS Simulator)
 * Optional:
 *   FLUTVIO_E2E_EDIT     a file + text replacement to prove hot reload, as
 *                        "<relative file>::<old text>::<new text>"
 *
 * Steps: open project → pick device → Run → wait for Running → Hot Reload ×3
 * (timed) → optional code edit + reload → Screenshot → Hot Restart → terminal
 * `pwd` → Stop. Writes report.json + window captures to the output dir and quits.
 *
 * Run: FLUTVIO_E2E=./e2e-results FLUTVIO_E2E_PROJECT=... FLUTVIO_E2E_DEVICE=... npm run dev
 */

import { app, BrowserWindow, clipboard } from 'electron'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Step {
  name: string
  ok: boolean
  detail?: string
  ms?: number
}

export function runE2E(win: BrowserWindow): void {
  const outDir = process.env['FLUTVIO_E2E']
  if (!outDir) return
  const dir = resolve(outDir)
  mkdirSync(dir, { recursive: true })
  // Keep test screenshots out of the user's Desktop.
  process.env.FLUTVIO_SCREENSHOT_DIR ??= dir

  const project = process.env['FLUTVIO_E2E_PROJECT'] ?? ''
  const deviceId = process.env['FLUTVIO_E2E_DEVICE'] ?? ''
  const steps: Step[] = []
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>

  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.log(`[renderer:error] ${e.message}`)
  })

  const capture = async (file: string): Promise<void> => {
    await wait(500)
    writeFileSync(join(dir, file), (await win.webContents.capturePage()).toPNG())
  }

  const click = (testId: string): Promise<boolean> =>
    js(`(() => { const b = document.querySelector('[data-testid="${testId}"]'); if (!b || b.disabled) return false; b.click(); return true })()`)

  const status = (): Promise<string> =>
    js(`document.querySelector('[data-testid="status-pill"]')?.dataset.status ?? ''`)

  async function waitFor(what: string, check: () => Promise<boolean>, timeoutMs: number): Promise<number> {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      if (await check()) return Date.now() - t0
      await wait(250)
    }
    throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
  }

  // FLUTVIO_E2E_ONLY="open project,onboarding,terminal keys" runs only the steps whose name
  // contains one of the parts (quick loop while working on one area).
  const only = (process.env['FLUTVIO_E2E_ONLY'] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  async function step(name: string, fn: () => Promise<string | void>): Promise<void> {
    if (only.length && !only.some((part) => name.includes(part))) return
    const t0 = Date.now()
    try {
      const detail = (await fn()) ?? undefined
      steps.push({ name, ok: true, detail, ms: Date.now() - t0 })
      console.log(`[e2e] PASS ${name}${detail ? ` — ${detail}` : ''}`)
    } catch (err) {
      steps.push({ name, ok: false, detail: (err as Error).message, ms: Date.now() - t0 })
      console.log(`[e2e] FAIL ${name} — ${(err as Error).message}`)
      throw err
    }
  }

  /** Clicks a timed action and returns the duration the UI shows. */
  async function timedAction(testId: string, kind: string): Promise<number> {
    // Never mutate React-owned DOM here; watch the action sequence number instead.
    const seq = (): Promise<string> =>
      js<string>(`document.querySelector('[data-testid="last-action"]')?.dataset.seq ?? ''`)
    const before = await seq()
    if (!(await click(testId))) throw new Error(`${testId} is disabled`)
    await waitFor(`${kind} result`, async () => {
      const toast = await js<string>(`(() => { const t = document.querySelector('[data-testid="toast"]'); return t?.dataset.kind === 'error' ? t.textContent : '' })()`)
      if (toast) throw new Error(`UI reported an error: ${toast}`)
      const now = await seq()
      return Boolean(now) && now !== before
    }, 120_000)
    return Number(await js<string>(`document.querySelector('[data-testid="last-action"]')?.dataset.ms ?? 'NaN'`))
  }

  win.webContents.once('did-finish-load', async () => {
    const cleanups: Array<() => void> = []
    try {
      await wait(2000)

      await step('open project', async () => {
        const p = await js<{ name: string }>(`window.flutvio.flutter.setProject(${JSON.stringify(project)})`)
        await waitFor('project name in UI', async () =>
          (await js<string>(`document.querySelector('[data-testid="project-button"]')?.textContent ?? ''`)).includes(p.name), 5000)
        return p.name
      })

      await step('select device', async () => {
        await waitFor('device in list', () =>
          js<boolean>(`!!document.querySelector('[data-testid="device-select"] option[value="${deviceId}"]:not([disabled])')`), 60_000)
        // Change the <select> the way a user does (React listens to the native event).
        await js(`(() => {
          const sel = document.querySelector('[data-testid="device-select"]')
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, ${JSON.stringify(deviceId)})
          sel.dispatchEvent(new Event('change', { bubbles: true }))
        })()`)
        await waitFor('device selected', async () =>
          (await js<string>(`document.querySelector('[data-testid="device-select"]').value`)) === deviceId, 5000)
        return deviceId
      })

      await step('welcome screen shows', async () => {
        await waitFor('welcome', () => js<boolean>(`!!document.querySelector('[data-testid="welcome"]')`), 5000).catch(() => undefined)
        return 'ok'
      })

      await step('onboarding walks through and closes', async () => {
        const shown = await js<boolean>(`!!document.querySelector('[data-testid="onboarding"]')`)
        if (!shown) return 'already done earlier (not shown)'
        await capture('O1_welcome.png')
        for (const name of ['O2_theme.png', 'O3_tools.png', 'O4_start.png']) {
          await js(`document.querySelector('[data-testid="onboarding-next"]')?.click()`)
          await wait(name === 'O3_tools.png' ? 4000 : 600)
          await capture(name)
        }
        // New project: the name is checked as you type, and the location shows where it will go.
        await click('start-new')
        await waitFor('name field', () => js<boolean>(`document.activeElement?.dataset.testid === 'start-input'`), 3000)
        for (const ch of 'My App') {
          win.webContents.sendInputEvent({ type: 'char', keyCode: ch })
          await wait(20)
        }
        await waitFor('name hint', () => js<boolean>(`(document.querySelector('[data-testid="start-hint"]')?.textContent ?? '').includes('Lowercase')`), 3000)
        if (!(await js<boolean>(`document.querySelector('[data-testid="start-submit"]').disabled`))) throw new Error('Create is enabled for an invalid name')
        await capture('O5_new_project.png')
        await js(`[...document.querySelectorAll('[data-testid="onboarding"] button')].find((b) => b.textContent.trim() === 'Skip for now')?.click()`)
        await waitFor('onboarding closed', async () => !(await js<boolean>(`!!document.querySelector('[data-testid="onboarding"]')`)), 5000)
        await capture('W0_welcome.png')
        return '4 steps (welcome, theme, tools, start)'
      })

      await step('settings: theme switch applies to the UI', async () => {
        win.webContents.send('ui:menu', { id: 'settings' })
        await waitFor('settings dialog', () => js<boolean>(`!!document.querySelector('[data-testid="settings"]')`), 5000)
        const surface = (): Promise<string> => js<string>(`getComputedStyle(document.documentElement).getPropertyValue('--surface-0').trim()`)
        await js(`document.querySelector('[data-testid="theme-light"]').click()`)
        await waitFor('light colours', async () => (await surface()) === '251 251 252', 3000)
        await capture('P1_settings_light.png')
        await js(`document.querySelector('[data-testid="theme-midnight"]').click()`)
        await waitFor('midnight colours', async () => (await surface()) === '15 20 32', 3000)
        await capture('P2_settings_midnight.png')
        await js(`document.querySelector('[data-testid="theme-black"]').click()`)
        await waitFor('black colours', async () => (await surface()) === '0 0 0', 3000)
        await capture('P3_settings_black.png')
        await js(`document.querySelector('[data-testid="theme-dark"]').click()`)
        await waitFor('dark colours', async () => (await surface()) === '20 20 22', 3000)
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        await waitFor('settings closed', async () => !(await js<boolean>(`!!document.querySelector('[data-testid="settings"]')`)), 3000)
        return 'light → midnight → black → dark'
      })

      await step('simulator is off until asked for', async () => {
        const column = await js<boolean>(`!!document.querySelector('[data-testid="right-column"]')`)
        const pressed = await js<string>(`document.querySelector('[data-testid="toggle-simulator"]').getAttribute('aria-pressed')`)
        if (column || pressed !== 'false') throw new Error(`right column ${column ? 'shown' : 'hidden'}, button pressed=${pressed}`)
        const width = await js<number>(`Math.round(document.querySelector('[data-testid="terminal-area"]').getBoundingClientRect().width)`)
        const view = await js<number>(`innerWidth`)
        if (width < view - 4) throw new Error(`terminal is ${width}px of ${view}px`)
        await capture('L0_project_open_terminal_only.png')
        return `terminal fills the window (${width}px)`
      })

      await step('browser panel loads a page', async () => {
        const server = createServer((_req, res) => {
          res.writeHead(200, { 'content-type': 'text/html' })
          res.end('<title>Flutvio test page</title><h1 style="font-family:sans-serif">Hello from localhost</h1>')
        })
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
        cleanups.push(() => server.close())
        const port = (server.address() as { port: number }).port
        win.webContents.send('ui:menu', { id: 'toggle-browser' })
        await waitFor('browser ready', () => js<boolean>(`document.querySelector('[data-testid="browser"]')?.dataset.ready === '1'`), 10_000)
        await js(`(() => { const i = document.querySelector('[data-testid="browser-address"]'); i.focus(); return true })()`)
        for (const ch of `localhost:${port}`) {
          win.webContents.sendInputEvent({ type: 'char', keyCode: ch })
          await wait(15)
        }
        const typed = await js<string>(`document.querySelector('[data-testid="browser-address"]').value`)
        if (typed !== `localhost:${port}`) throw new Error(`address bar has "${typed}"`)
        win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
        await waitFor('page title', () => js<boolean>(`document.querySelector('[data-testid="browser"] webview')?.getTitle?.() === 'Flutvio test page'`), 10_000)
        await capture('B1_browser.png')
        await js(`document.querySelector('[data-testid="right-simulator"]').click()`)
        return `loaded http://localhost:${port}`
      })

      await step('embedded simulator shows frames and accepts taps', async () => {
        await waitFor('sim frame', () => js<boolean>(`!!document.querySelector('[data-testid="sim-screen"]')`), 60_000)
        await capture('E0_embedded_simulator.png')
        // Tap the middle of the screen with real pointer events; errors show as a line.
        await js(`(() => {
          const img = document.querySelector('[data-testid="sim-screen"]')
          const r = img.getBoundingClientRect()
          const opts = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, pointerId: 1 }
          img.dispatchEvent(new PointerEvent('pointerdown', opts))
          img.dispatchEvent(new PointerEvent('pointerup', opts))
        })()`)
        await wait(1500)
        const err = await js<string>(`document.querySelector('[data-testid="sim-error"]')?.textContent ?? ''`)
        if (err) throw new Error(`tap failed: ${err}`)
        // Hardware HOME button through the control bar.
        await js(`[...document.querySelectorAll('[data-testid="sim-controls"] button')].find((b) => b.textContent === 'Home')?.click()`)
        await wait(1200)
        const err2 = await js<string>(`document.querySelector('[data-testid="sim-error"]')?.textContent ?? ''`)
        if (err2) throw new Error(`HOME failed: ${err2}`)
        return 'frames + tap + HOME OK'
      })

      await step('project file tree lists files and opens one in the editor', async () => {
        // A project opens on the terminal + simulator only; the side panel is closed.
        const hidden = await js<boolean>(`getComputedStyle(document.querySelector('[data-testid="side-panel"]').parentElement).display === 'none'`)
        if (!hidden) throw new Error('side panel should be closed when a project opens')
        await capture('L1_project_open_terminal_and_simulator.png')
        await js(`document.querySelector('[data-testid="sidebar-files"]').click()`)
        await waitFor('tree entries', () => js<boolean>(`document.querySelectorAll('[data-testid="tree-file"],[data-testid="tree-folder"]').length > 0`), 10_000)
        const names = await js<number>(`document.querySelectorAll('[data-testid="tree-folder"]').length`)
        await js(`[...document.querySelectorAll('[data-testid="tree-file"]')].find((b) => b.textContent.includes('pubspec.yaml'))?.click()`)
        await waitFor('editor with pubspec content', () =>
          js<boolean>(`(document.querySelector('[data-testid="editor"] .view-lines')?.textContent ?? '').includes('name:')`), 10_000)
        await capture('F1_files_and_editor.png')
        return `${names} folders in root, pubspec.yaml opened`
      })

      await step('Claude sessions are listed for the project', async () => {
        await js(`document.querySelector('[data-testid="sidebar-claude"]')?.click()`)
        await waitFor('session list', () => js<boolean>(`document.querySelectorAll('[data-testid="ai-sessions"] button').length >= 0`), 10_000)
        await wait(1500)
        const count = await js<number>(`document.querySelectorAll('[data-testid="ai-sessions"] button').length`)
        await capture('F2_claude_sessions.png')
        await js(`document.querySelector('[data-testid="sidebar-files"]')?.click()`)
        return `${count} session(s) listed`
      })

      await step('run → Running', async () => {
        if (!(await click('run-button'))) throw new Error('Run button disabled')
        await waitFor('launching', async () => (await status()) === 'launching', 5000)
        await capture('E1_launching.png')
        const ms = await waitFor('running', async () => {
          const s = await status()
          if (s === 'idle') {
            await js(`document.querySelector('[data-testid="console-toggle"]')?.click()`)
            await wait(300)
            const text = await js<string>(`document.querySelector('[data-testid="console"]')?.innerText ?? ''`)
            throw new Error(`app exited during launch:\n${text.split('\n').slice(-25).join('\n')}`)
          }
          return s === 'running'
        }, 15 * 60_000)
        await capture('E2_running.png')
        return `launched in ${(ms / 1000).toFixed(1)} s`
      })

      const reloads: number[] = []
      await step('hot reload ×3 (< 500 ms target)', async () => {
        for (let i = 0; i < 3; i++) {
          reloads.push(await timedAction('reload-button', 'hot reload'))
          await waitFor('running again', async () => (await status()) === 'running', 30_000)
        }
        await wait(1500) // let the stream deliver frames of the reloaded app
        await capture('E2b_running_in_panel.png')
        const avg = Math.round(reloads.reduce((a, b) => a + b, 0) / reloads.length)
        const detail = `reload times: ${reloads.join(', ')} ms (avg ${avg} ms)`
        if (avg >= 500) throw new Error(detail)
        return detail
      })

      const edit = process.env['FLUTVIO_E2E_EDIT']
      if (edit) {
        await step('edit code + hot reload shows the change', async () => {
          const [rel, oldText, newText] = edit.split('::')
          const file = join(project, rel)
          const original = readFileSync(file, 'utf8')
          if (!original.includes(oldText)) throw new Error(`"${oldText}" not found in ${rel}`)
          cleanups.push(() => writeFileSync(file, original))
          writeFileSync(file, original.replace(oldText, newText))
          const ms = await timedAction('reload-button', 'hot reload after edit')
          await waitFor('running again', async () => (await status()) === 'running', 30_000)
          return `reloaded edit in ${ms} ms`
        })
      }

      await step('screenshot saved', async () => {
        const ms = await timedAction('screenshot-button', 'screenshot')
        const path = await waitFor('toast with path', () =>
          js<boolean>(`document.querySelector('[data-testid="toast"]')?.dataset.kind === 'ok'`), 10_000)
          .then(() => js<string>(`document.querySelector('[data-testid="toast"]')?.textContent ?? ''`))
        const file = path.match(/Screenshot saved\s*:?\s*(.+?\.png)/)?.[1]
        const full = file ? join(process.env.FLUTVIO_SCREENSHOT_DIR!, file) : ''
        if (!full || !existsSync(full)) throw new Error(`screenshot file not found (${path})`)
        return `${ms} ms → ${full}`
      })

      await step('hot restart', async () => {
        const ms = await timedAction('restart-button', 'hot restart')
        await waitFor('running again', async () => (await status()) === 'running', 60_000)
        return `${ms} ms`
      })

      await step('simulator: tap → screen update latency', async () => {
        // Tap the counter's + button and time until the counter area of the mirrored screen changes.
        const probe = `(() => new Promise((res) => {
          const c = document.querySelector('[data-testid="sim-screen"]')
          if (!c) return res(-2)
          const ctx = c.getContext('2d')
          const hash = () => { const d = ctx.getImageData(0, Math.floor(c.height * 0.4), c.width, Math.floor(c.height * 0.15)).data; let h = 0; for (let i = 0; i < d.length; i += 16) h = (h * 31 + d[i]) | 0; return h }
          const h0 = hash()
          const r = c.getBoundingClientRect()
          const opts = { clientX: r.left + r.width * 0.89, clientY: r.top + r.height * 0.905, bubbles: true, pointerId: 1, button: 0 }
          const t0 = performance.now()
          c.dispatchEvent(new PointerEvent('pointerdown', opts))
          c.dispatchEvent(new PointerEvent('pointerup', opts))
          const tick = () => {
            if (hash() !== h0) res(Math.round(performance.now() - t0))
            else if (performance.now() - t0 > 3000) res(-1)
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }))()`
        const times: number[] = []
        for (let i = 0; i < 4; i++) {
          times.push(await js<number>(probe))
          await wait(700)
        }
        const fps = await js<number>(`window.__simFps ?? 0`)
        await capture('S1_simulator_after_taps.png')
        if (times.some((t) => t < 0)) throw new Error(`screen did not change after a tap: ${times.join(', ')} ms`)
        return `tap → visible change: ${times.join(', ')} ms; stream ${fps} fps`
      })

      await step('editor: Dart autocomplete + error markers', async () => {
        const hasMain = `!![...document.querySelectorAll('[data-testid="tree-file"]')].find((b) => b.textContent.includes('main.dart'))`
        if (!(await js<boolean>(hasMain)))
          await js(`[...document.querySelectorAll('[data-testid="tree-folder"]')].find((b) => b.textContent.trim() === 'lib')?.click()`)
        await waitFor('main.dart in tree', () =>
          js<boolean>(`!![...document.querySelectorAll('[data-testid="tree-file"]')].find((b) => b.textContent.includes('main.dart'))`), 5000)
        await js(`[...document.querySelectorAll('[data-testid="tree-file"]')].find((b) => b.textContent.includes('main.dart'))?.click()`)
        await waitFor('main.dart in editor', () => js<boolean>(`!!window.__flutvioEditor?.getModel()?.uri.path.endsWith('/lib/main.dart')`), 10_000)
        const original = await js<string>(`window.__flutvioEditor.getModel().getValue()`)
        cleanups.push(() => void js(`window.__flutvioEditor?.getModel()?.setValue(${JSON.stringify(original)})`).catch(() => undefined))
        // Append a probe function and ask for suggestions after "Tex".
        await js(`(() => {
          const ed = window.__flutvioEditor, m = ed.getModel(), last = m.getLineCount()
          m.pushEditOperations([], [{ range: new window.__flutvioMonaco.Range(last, m.getLineMaxColumn(last), last, m.getLineMaxColumn(last)), text: '\\nWidget probe() => Tex' }], () => null)
          const l = m.getLineCount()
          ed.setPosition({ lineNumber: l, column: m.getLineMaxColumn(l) })
          ed.revealLine(l)
          ed.focus()
        })()`)
        const t0 = Date.now()
        let shown = false
        while (!shown && Date.now() - t0 < 60_000) {
          await js(`window.__flutvioEditor.trigger('e2e', 'editor.action.triggerSuggest', {})`)
          await wait(1500)
          shown = await js<boolean>(`[...document.querySelectorAll('.suggest-widget .monaco-list-row')].some((r) => /\\bText\\b/.test(r.textContent))`)
        }
        await capture('F3_editor_completion.png')
        if (!shown) throw new Error('no "Text" suggestion from the Dart analysis server')
        const completionMs = Date.now() - t0
        // "Tex" alone is an error → a red marker should appear.
        await js(`window.__flutvioEditor.trigger('e2e', 'hideSuggestWidget', {})`)
        await waitFor('error marker', () =>
          js<boolean>(`window.__flutvioMonaco.editor.getModelMarkers({ resource: window.__flutvioEditor.getModel().uri }).some((m) => m.severity === 8)`), 20_000)
        const markers = await js<number>(`window.__flutvioMonaco.editor.getModelMarkers({ resource: window.__flutvioEditor.getModel().uri }).length`)
        await capture('F4_editor_error_marker.png')
        await js(`window.__flutvioEditor.getModel().setValue(${JSON.stringify(original)})`)
        return `completion after ${(completionMs / 1000).toFixed(1)} s (first analysis included); ${markers} marker(s)`
      })

      await step('hot reload on save (⌘S in the editor)', async () => {
        const seq = (): Promise<string> => js<string>(`document.querySelector('[data-testid="last-action"]')?.dataset.seq ?? ''`)
        const kind = (): Promise<string> => js<string>(`document.querySelector('[data-testid="last-action"]')?.textContent ?? ''`)
        const original = await js<string>(`window.__flutvioEditor.getModel().getValue()`)
        await js(`(() => { const m = window.__flutvioEditor.getModel(); m.pushEditOperations([], [{ range: m.getFullModelRange(), text: m.getValue().replace('Flutter Demo Home Page', 'Saved Home Page') }], () => null); window.__flutvioEditor.focus() })()`)
        const before = await seq()
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 's', modifiers: ['meta'] })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 's', modifiers: ['meta'] })
        await waitFor('reload after save', async () => (await seq()) !== before && (await kind()).startsWith('Reload'), 30_000)
        const ms = Number(await js<string>(`document.querySelector('[data-testid="last-action"]')?.dataset.ms ?? 'NaN'`))
        const onDisk = readFileSync(join(project, 'lib/main.dart'), 'utf8')
        cleanups.push(() => writeFileSync(join(project, 'lib/main.dart'), original))
        if (!onDisk.includes('Saved Home Page')) throw new Error('file was not saved')
        await wait(1200)
        await capture('F5_reload_on_save.png')
        // Put the original text back (saved + reloaded again).
        await js(`(() => { const m = window.__flutvioEditor.getModel(); m.setValue(${JSON.stringify(original)}); window.__flutvioEditor.focus() })()`)
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 's', modifiers: ['meta'] })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 's', modifiers: ['meta'] })
        await wait(1500)
        return `saved + hot reloaded in ${ms} ms`
      })

      await step('split terminal shows two shells side by side', async () => {
        await js(`document.querySelector('[data-testid="term-tab"]').click()`)
        await wait(200)
        await js(`document.querySelector('[data-testid="split-terminal"]')?.click()`)
        await waitFor('two terminals', () => js<boolean>(`document.querySelectorAll('[data-testid="terminal"] .xterm-rows').length >= 2`), 10_000)
        const widths = await js<number[]>(`[...document.querySelectorAll('[data-testid="terminal"]')].filter((t) => getComputedStyle(t.parentElement).visibility === 'visible').map((t) => Math.round(t.getBoundingClientRect().width))`)
        await capture('T1_split_terminals.png')
        if (widths.length < 2) throw new Error(`only ${widths.length} terminal(s) visible`)
        // Back to the main shell alone for the next step.
        await js(`[...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'zsh')?.click()`)
        return `${widths.length} visible, widths ${widths.join(' / ')} px`
      })

      await step('source control: change → diff → stage → commit → graph', async () => {
        const gitInfo = await js<{ root: string } | null>(`window.flutvio.git.info(${JSON.stringify(project)})`)
        if (!gitInfo) return 'skipped (not a git repository)'
        const file = join(project, 'README.md')
        const original = readFileSync(file, 'utf8')
        writeFileSync(file, original + '\nEdited by the e2e test.\n')
        cleanups.push(() => {
          writeFileSync(file, original)
          try {
            execFileSync('git', ['reset', '--hard', 'HEAD~1'], { cwd: gitInfo.root })
          } catch {
            /* nothing committed */
          }
        })
        await js(`document.querySelector('[data-testid="sidebar-scm"]').click()`)
        await waitFor('changed file listed', () => js<boolean>(`[...document.querySelectorAll('[data-testid="scm-file"]')].some((r) => r.textContent.includes('README.md'))`), 10_000)
        await js(`[...document.querySelectorAll('[data-testid="scm-file"]')].find((r) => r.textContent.includes('README.md')).click()`)
        await waitFor('diff view', () => js<boolean>(`!!document.querySelector('[data-testid="diff-view"] .monaco-diff-editor')`), 10_000)
        await wait(800)
        await capture('G1_scm_diff.png')
        await js(`document.querySelector('[data-testid="scm-stage-all"]').click()`)
        await wait(800)
        await js(`(() => { const t = document.querySelector('[data-testid="scm-message"]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'docs: e2e edit'); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
        await wait(200)
        await js(`document.querySelector('[data-testid="scm-commit"]').click()`)
        await waitFor('clean tree', () => js<boolean>(`document.querySelectorAll('[data-testid="scm-file"]').length === 0`), 10_000)
        const head = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: gitInfo.root, encoding: 'utf8' }).trim()
        if (head !== 'docs: e2e edit') throw new Error(`last commit is "${head}"`)
        await js(`document.querySelector('button[data-testid="scm-graph"]').click()`)
        await waitFor('graph rows', () => js<boolean>(`[...document.querySelectorAll('[data-testid="scm-graph-list"] span')].some((s) => s.textContent === 'docs: e2e edit')`), 10_000)
        await capture('G2_scm_graph.png')
        await js(`document.querySelector('[data-testid="sidebar-files"]').click()`)
        return 'committed "docs: e2e edit" and saw it in the graph'
      })

      await step('terminal is the main pane; agent edits show live in Changes', async () => {
        await js(`document.querySelector('[data-testid="term-tab"]').click()`)
        // Close the side panel: the terminal then takes everything but the simulator.
        await js(`(() => { const p = document.querySelector('[data-testid="side-panel"]').parentElement; if (getComputedStyle(p).display !== 'none') document.querySelector('[data-testid="toggle-panel"]').click() })()`)
        await wait(400)
        const area = await js<{ w: number; h: number }>(`(() => { const r = document.querySelector('[data-testid="terminal-area"]').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })()`)
        const view = await js<{ w: number; h: number }>(`({ w: innerWidth, h: innerHeight })`)
        if (area.h < view.h * 0.85) throw new Error(`terminal area only ${area.h}px of ${view.h}px high`)
        if (area.w < view.w * 0.55) throw new Error(`terminal area only ${area.w}px of ${view.w}px wide`)
        if (await js<boolean>(`!!document.querySelector('[data-testid="agent-buttons"]')`)) throw new Error('agent buttons should be gone')
        await js(`document.querySelector('[data-testid="review-changes"]').click()`)
        const gitInfo = await js<{ root: string } | null>(`window.flutvio.git.info(${JSON.stringify(project)})`)
        if (!gitInfo) return `terminal ${area.w}×${area.h}; changes skipped (no git)`
        // Simulate an agent writing a file outside the app.
        const file = join(project, 'lib', 'e2e_agent_edit.dart')
        writeFileSync(file, '// written by an agent\nconst agentWasHere = true;\n')
        cleanups.push(() => {
          try {
            execFileSync('rm', ['-f', file])
          } catch {
            /* gone */
          }
        })
        await waitFor('new file in Changes', () =>
          js<boolean>(`[...document.querySelectorAll('[data-testid="changes-panel"] [data-testid="diff-file"]')].some((f) => f.textContent.includes('e2e_agent_edit.dart') && f.textContent.includes('agentWasHere'))`), 10_000)
        await capture('R1_terminal_main_changes_live.png')
        execFileSync('rm', ['-f', file])
        return `terminal ${area.w}×${area.h} of ${view.w}×${view.h}; new file shown live`
      })

      // Types a line into the focused terminal like a user.
      const typeLine = async (line: string): Promise<void> => {
        for (const ch of line) {
          win.webContents.sendInputEvent({ type: 'char', keyCode: ch })
          await wait(15)
        }
        win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
      }
      const focusTerminal = async (): Promise<void> => {
        await js(`document.querySelector('[data-testid="term-tab"]').click()`)
        await waitFor('terminal focus', async () => {
          await js(`document.querySelector('.xterm-helper-textarea')?.focus()`)
          await wait(150)
          return js<boolean>(`document.activeElement?.classList.contains('xterm-helper-textarea') ?? false`)
        }, 5000)
      }
      const termText = (): Promise<string> => js<string>(`document.querySelector('[data-testid="terminal"] .xterm-rows')?.textContent ?? ''`)

      await step('tab is named after what runs in the terminal', async () => {
        await focusTerminal()
        await typeLine('sleep 4')
        await waitFor('tab shows sleep', () => js<boolean>(`document.querySelector('[data-testid="term-tab"]').dataset.process === 'sleep'`), 6000)
        await capture('T2_tab_named_after_process.png')
        await waitFor('tab back to the shell', () => js<boolean>(`['zsh','bash','fish'].includes(document.querySelector('[data-testid="term-tab"]').dataset.process)`), 10_000)
        return 'zsh → sleep → zsh'
      })

      await step('toasts stack with an icon and an action, and can be dismissed', async () => {
        await js(`(() => { const d = window.__flutvioDev; d.pushToast({ kind: 'ok', title: 'Screenshot saved', text: 'shot-1.png' }); d.pushToast({ kind: 'info', title: 'Packages changed', text: 'Restart the app to load them.', action: { label: 'Hot restart', run: () => { window.__toastAction = true } } }); d.pushToast({ kind: 'error', text: 'No device selected.' }) })()`)
        const count = (): Promise<number> => js<number>(`document.querySelectorAll('[data-testid="toast"]').length`)
        await waitFor('three toasts', async () => (await count()) === 3, 3000)
        await capture('N1_toasts.png')
        await js(`[...document.querySelectorAll('[data-testid="toast"] button')].find((b) => b.textContent.trim() === 'Hot restart').click()`)
        if (!(await js<boolean>(`window.__toastAction === true`))) throw new Error('toast action did not run')
        await waitFor('action toast leaves', async () => (await count()) === 2, 3000)
        await js(`document.querySelectorAll('[data-testid="toast"] button[aria-label="Dismiss"]').forEach((b) => b.click())`)
        await waitFor('toasts dismissed', async () => (await count()) === 0, 3000)
        return 'stacked 3 → action ran → dismissed'
      })

      await step('agent finishes in another tab → tab dot, bell, notification list', async () => {
        // A stand-in agent: prints for ~5 s (a turn), then waits for input like agents do.
        const bin = join(dir, 'fake-agent')
        mkdirSync(bin, { recursive: true })
        writeFileSync(join(bin, 'aider'), '#!/bin/sh\nsleep 1.5\ni=0\nwhile [ $i -lt 25 ]; do printf "\\rthinking %s " $i; i=$((i+1)); sleep 0.2; done\nprintf "\\ndone\\n"\nsleep 60\n', { mode: 0o755 })
        const before = await js<number>(`document.querySelectorAll('[data-testid="term-tab"]').length`)
        await click('new-terminal')
        await waitFor('new tab', async () => (await js<number>(`document.querySelectorAll('[data-testid="term-tab"]').length`)) === before + 1, 5000)
        const tab = `document.querySelectorAll('[data-testid="term-tab"]')[${before}]`
        await wait(1200)
        const id = await js<string>(`${tab}.getAttribute('aria-selected') === 'true' ? 'ok' : ''`)
        if (!id) throw new Error('the new tab is not selected')
        await typeLine(`${join(bin, 'aider')}`)
        await waitFor('tab shows the agent', () => js<boolean>(`${tab}.dataset.process === 'aider'`), 8000)
        await waitFor('agent is working', () => js<boolean>(`${tab}.dataset.activity === 'working'`), 10_000)
        await capture('N2_agent_working.png')
        // Look at the first tab while it works.
        await js(`document.querySelector('[data-testid="term-tab"]').click()`)
        const unread = (): Promise<number> => js<number>(`Number(document.querySelector('[data-testid="notifications-button"]').dataset.unread)`)
        await waitFor('bell shows a notification', async () => (await unread()) >= 1, 15_000)
        await capture('N3_agent_finished.png')
        await click('notifications-button')
        await waitFor('notification list', () => js<boolean>(`(document.querySelector('[data-testid="notification"]')?.textContent ?? '').includes('Aider finished')`), 3000)
        await capture('N4_notification_list.png')
        await js(`document.querySelector('[data-testid="notification"]').click()`)
        await waitFor('back on the agent tab, read', async () => (await js<boolean>(`${tab}.getAttribute('aria-selected') === 'true'`)) && (await unread()) === 0, 3000)
        // Stop the stand-in and close its tab.
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'c', modifiers: ['control'] })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'c', modifiers: ['control'] })
        await wait(600)
        await js(`${tab}.querySelector('button[aria-label="Close terminal"]').click()`)
        await waitFor('tab closed', async () => (await js<number>(`document.querySelectorAll('[data-testid="term-tab"]').length`)) === before, 5000)
        await js(`document.querySelectorAll('[data-testid="toast"] button[aria-label="Dismiss"]').forEach((b) => b.click())`)
        return 'working → finished → bell 1 → opened from the list'
      })

      await step('Flutter tab: pub get runs in its own terminal', async () => {
        await click('flutter-tab')
        await waitFor('Flutter terminal', () => js<boolean>(`!!document.querySelector('[data-testid="flutter-terminal"] .xterm-rows')`), 8000)
        const text = (): Promise<string> => js<string>(`document.querySelector('[data-testid="flutter-terminal"] .xterm-rows')?.textContent ?? ''`)
        await waitFor('shell prompt', async () => (await text()).trim().length > 0, 10_000)
        await wait(500)
        if (!(await click('flutter-cmd-pub-get'))) throw new Error('Pub get is disabled')
        const ms = await waitFor('pub get output', async () => /Got dependencies|Resolving dependencies|No dependencies changed/.test(await text()), 120_000)
        await capture('F1_flutter_terminal.png')
        await click('flutter-view-output')
        await waitFor('run output view', () => js<boolean>(`!!document.querySelector('[data-testid="flutter-terminal"] [data-testid="console"]')`), 3000)
        await click('flutter-view-terminal')
        await waitFor('command finished', async () => !(await js<boolean>(`document.querySelector('[data-testid="flutter-cmd-pub-get"]').disabled`)), 120_000)
        await js(`document.querySelector('[data-testid="term-tab"]').click()`)
        return `pub get printed after ${ms} ms`
      })

      await step('Agent panel: explains itself and lists Claude Code connections', async () => {
        if (!(await js<boolean>(`!!document.querySelector('[data-testid="side-panel"]')?.offsetParent`))) await click('toggle-panel')
        await click('sidebar-agent')
        await waitFor('agent panel', () => js<boolean>(`(document.querySelector('[data-testid="agent-panel"]')?.textContent ?? '').includes('No agent in this terminal')`), 5000)
        const listed = await waitFor('connections or a reason', () => js<boolean>(`(() => { const p = document.querySelector('[data-testid="agent-panel"]'); return !!p.querySelector('[data-testid="agent-connections"]') || /Could not ask|No MCP servers/.test(p.textContent) })()`), 60_000)
        await capture('A1_agent_panel.png')
        const n = await js<number>(`document.querySelectorAll('[data-testid="agent-connections"] [title]').length`)
        await click('toggle-panel')
        return `${n} connections after ${listed} ms`
      })

      // Real Claude Code in the terminal (uses the signed-in account, so only when asked for).
      if (process.env['FLUTVIO_E2E_CLAUDE']) {
        await step('real Claude Code: runs in the terminal, context meter and Agent panel follow it', async () => {
          const tab = `document.querySelector('[data-testid="term-tab"]')`
          await focusTerminal()
          await typeLine('claude')
          await waitFor('tab shows claude', () => js<boolean>(`${tab}.dataset.process === 'claude'`), 30_000)
          await wait(4000)
          // First run in a folder asks whether to trust it: Enter accepts the default (yes).
          if (/trust/i.test(await termText())) {
            win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
            await wait(3000)
          }
          await capture('C1_claude_started.png')
          if (!(await js<boolean>(`!!document.querySelector('[data-testid="side-panel"]')?.offsetParent`))) await click('toggle-panel')
          await click('sidebar-agent')
          await waitFor('Agent panel sees Claude Code', () => js<boolean>(`(document.querySelector('[data-testid="agent-panel"]')?.textContent ?? '').includes('Claude Code')`), 15_000)
          await js(`document.querySelector('.xterm-helper-textarea')?.focus()`)
          await typeLine('Reply with the single word: ok')
          const activity = (): Promise<string> => js<string>(`${tab}.dataset.activity ?? ''`)
          await waitFor('working', async () => (await activity()) === 'working', 30_000)
          await capture('C2_claude_working.png')
          const ms = await waitFor('finished', async () => (await activity()) === 'idle', 120_000)
          await waitFor('context shown', () => js<boolean>(`/\\d+%/.test(document.querySelector('[data-testid="agent-context"]')?.textContent ?? '')`), 15_000)
          const percent = await js<string>(`document.querySelector('[data-testid="context-meter"]')?.dataset.percent ?? ''`)
          if (!percent) throw new Error('no context meter in the tab strip')
          await capture('C3_claude_agent_panel.png')
          const panel = await js<string>(`document.querySelector('[data-testid="agent-panel"]').innerText.split('CLAUDE CODE CONNECTIONS')[0].replace(/\\n+/g, ' | ')`)
          await typeLine('/exit')
          await waitFor('back to the shell', () => js<boolean>(`['zsh','bash','fish'].includes(${tab}.dataset.process)`), 20_000)
          await click('toggle-panel')
          return `turn took ${ms} ms; context ${percent}%; panel: ${panel.slice(0, 260)}`
        })
      }

      await step('terminal keys: hold delete, word / line delete, copy, tabs, shortcuts list', async () => {
        await focusTerminal()
        const press = async (keyCode: string, modifiers: Array<'alt' | 'meta' | 'shift'> = [], repeat = 1): Promise<void> => {
          for (let n = 0; n < repeat; n++) {
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: n > 0 ? [...modifiers, 'isautorepeat'] : modifiers })
            await wait(20)
          }
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
          await wait(60)
        }
        const typeText = async (text: string): Promise<void> => {
          for (const ch of text) {
            win.webContents.sendInputEvent({ type: 'char', keyCode: ch })
            await wait(15)
          }
        }
        // Modifier combos are dispatched as DOM key events on the terminal's input (what xterm listens to).
        const combo = (key: string, keyCode: number, mods: { altKey?: boolean; metaKey?: boolean }): Promise<unknown> =>
          js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, keyCode, bubbles: true, cancelable: true, ...mods })}))`)
        // Record what a synthetic ⌥⌫ from Electron looks like to the page (diagnostic only).
        await js(`window.addEventListener('keydown', (e) => { if (e.keyCode === 8 || e.key === 'Backspace') window.__lastDel = { key: e.key, keyCode: e.keyCode, alt: e.altKey, meta: e.metaKey } }, true)`)
        await typeLine('clear')
        await wait(300)
        // Held Backspace repeats: "echo K1-abcdefgh" minus 3 characters.
        await typeText('echo K1-abcdefgh')
        await press('Backspace', [], 3)
        await press('Return')
        await waitFor('held delete', async () => /K1-abcde(?!f)/.test((await termText()).replace(/echo K1-abcde/g, '')), 5000)
        // ⌥⌫ removes the last word.
        await typeText('echo K2-one two three')
        await combo('Backspace', 8, { altKey: true })
        await wait(150)
        await press('Return')
        await waitFor('word delete', async () => /K2-one two(?! three)/.test((await termText()).replace(/echo K2-one two/g, '')), 5000).catch(async (e: Error) => {
          const seen = JSON.stringify(await js<unknown>(`({ active: document.activeElement?.className, terms: document.querySelectorAll('.xterm-helper-textarea').length })`))
          throw new Error(`${e.message}; handler saw ${seen}; terminal shows: ${(await termText()).replace(/\s+/g, ' ').slice(-120)}`)
        })
        // ⌘⌫ removes the whole line.
        await typeText('this-is-not-a-command')
        await combo('Backspace', 8, { metaKey: true })
        await wait(150)
        await typeText('echo K3-line-ok')
        await press('Return')
        await waitFor('line delete', async () => (await termText()).includes('K3-line-ok') && !(await termText()).includes('not found'), 5000)
        // How Electron's own synthetic ⌥⌫ reaches the page (for the report).
        await press('Backspace', ['alt'])
        const synthetic = JSON.stringify(await js<unknown>(`window.__lastDel ?? null`))
        // Select all + Edit › Copy puts the terminal text on the clipboard (restored afterwards).
        // Only when the clipboard holds plain text (or nothing), so nothing of the user's is lost.
        const items = await clipboard.read().catch(() => [])
        const textOnly = items.every((it) => it.types.every((t) => t.startsWith('text/')))
        let copied = 'select all OK, copy skipped (clipboard holds non-text data)'
        if (!textOnly) {
          win.webContents.send('ui:menu', { id: 'select-all' })
          await waitFor('terminal text selected', () => js<boolean>(`(window.__flutvioTerm?.getSelection() ?? '').includes('K3-line-ok')`), 4000)
        } else {
          const saved = await clipboard.readText()
          await clipboard.writeText('')
          win.webContents.send('ui:menu', { id: 'select-all' })
          await wait(300)
          win.webContents.copy()
          try {
            await waitFor('copied text', async () => (await clipboard.readText()).includes('K3-line-ok'), 4000)
            copied = 'select all + copy'
          } finally {
            await clipboard.writeText(saved)
          }
        }
        await js(`window.__flutvioTerm?.clearSelection()`)
        // ⌘T / ⌘W (menu commands).
        const tabs = (): Promise<number> => js<number>(`document.querySelectorAll('[data-testid="term-tab"]').length`)
        const before = await tabs()
        win.webContents.send('ui:menu', { id: 'new-terminal' })
        await waitFor('new tab', async () => (await tabs()) === before + 1, 4000)
        win.webContents.send('ui:menu', { id: 'close-tab' })
        await waitFor('tab closed', async () => (await tabs()) === before, 4000)
        // Settings › Shortcuts.
        win.webContents.send('ui:menu', { id: 'shortcuts' })
        await waitFor('shortcuts page', () => js<boolean>(`!!document.querySelector('[data-testid="shortcuts-page"]')`), 4000)
        const rows = await js<number>(`document.querySelectorAll('[data-testid="shortcuts-page"] .kbd').length`)
        await capture('K1_shortcuts_page.png')
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        await waitFor('settings closed', async () => !(await js<boolean>(`!!document.querySelector('[data-testid="settings"]')`)), 3000)
        return `hold ⌫, ⌥⌫, ⌘⌫, ${copied}, ⌘T/⌘W OK; ${rows} key caps listed; synthetic ⌥⌫ seen as ${synthetic}`
      })

      await step('flutvio command: status, screenshot, tap, reload from the terminal', async () => {
        await focusTerminal()
        await typeLine('clear; flutvio status')
        await waitFor('status output', async () => /app:\s+running/.test(await termText()), 8000)
        const shot = join(dir, 'flutvio-cli-shot.png')
        await typeLine(`flutvio screenshot ${JSON.stringify(shot)}`)
        await waitFor('screenshot file', async () => existsSync(shot) && readFileSync(shot).length > 10_000, 15_000)
        const seq = (): Promise<string> => js<string>(`document.querySelector('[data-testid="last-action"]')?.dataset.seq ?? ''`)
        await typeLine('clear; flutvio reload')
        await waitFor('reload output', async () => /reloaded in \d+ ms/.test(await termText()), 30_000)
        await typeLine('clear; flutvio elements')
        await waitFor('elements output', async () => /\d+\s+\d+\s+\S+/.test(await termText()), 15_000)
        const elements = (await termText()).slice(0, 400)
        await typeLine('clear; flutvio tap 5 5; flutvio logs -n 3')
        await waitFor('tap output', async () => (await termText()).includes('tapped'), 8000)
        void seq
        await capture('C1_flutvio_cli.png')
        return `status ok, screenshot ${Math.round(readFileSync(shot).length / 1024)} KB, reload ok, elements: ${elements.replace(/\s+/g, ' ').slice(0, 80)}`
      })

      await step('Flutter logs drawer under the simulator', async () => {
        const open = (): Promise<boolean> => js<boolean>(`document.querySelector('[data-testid="console-toggle"]').getAttribute('aria-expanded') === 'true'`)
        if (!(await open())) await js(`document.querySelector('[data-testid="console-toggle"]').click()`)
        await waitFor('console lines', () => js<boolean>(`(document.querySelector('[data-testid="console"]')?.innerText ?? '').includes('flutter run')`), 5000)
        await capture('C2_logs_drawer.png')
        await js(`document.querySelector('[data-testid="console-toggle"]').click()`)
        await js(`document.querySelector('[data-testid="sidebar-claude"]').click()`)
        await wait(1200)
        await capture('C3_sessions_tab.png')
        await js(`document.querySelector('[data-testid="toggle-panel"]').click()`)
        return 'opened, shows flutter output, closed'
      })

      await step('terminal opens in the project folder', async () => {
        await focusTerminal()
        await typeLine('clear; pwd')
        await wait(1200)
        const text = await termText()
        await capture('E3_terminal_and_console.png')
        if (!text.includes(project)) throw new Error('pwd output does not show the project path')
        return project
      })

      await step('stop → Idle', async () => {
        if (!(await click('stop-button'))) throw new Error('Stop button disabled')
        const ms = await waitFor('idle', async () => (await status()) === 'idle', 30_000)
        await capture('E4_stopped.png')
        return `stopped in ${ms} ms`
      })

      const gitInfo = await js<{ root: string; worktrees: unknown[] } | null>(`window.flutvio.git.info(${JSON.stringify(project)})`)
      if (gitInfo) {
        await step('git worktree: create, open, remove', async () => {
          await waitFor('branch menu', () => js<boolean>(`!!document.querySelector('[data-testid="branch-button"]')`), 10_000)
          await js(`document.querySelector('[data-testid="branch-button"]').click()`)
          await wait(300)
          await js(`[...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.includes('New worktree'))?.click()`)
          await wait(200)
          // Type the branch name into the dialog and confirm.
          const input = 'input[placeholder="feature/login"]'
          await js(`document.querySelector('${input}').focus()`)
          for (const ch of 'e2e-try') {
            win.webContents.sendInputEvent({ type: 'char', keyCode: ch })
            await wait(20)
          }
          await capture('W1_new_worktree_dialog.png')
          await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Create & open'))?.click()`)
          await waitFor('branch shows e2e-try', () => js<boolean>(`(document.querySelector('[data-testid="branch-button"]')?.textContent ?? '').includes('e2e-try')`), 20_000)
          const opened = await js<string>(`document.querySelector('[data-testid="project-button"]')?.title ?? ''`)
          if (!opened.includes('.worktrees/e2e-try')) throw new Error(`project is not the worktree: ${opened}`)
          await waitFor('tree of the worktree', () => js<boolean>(`document.querySelectorAll('[data-testid="tree-file"]').length > 0`), 10_000)
          await capture('W2_worktree_open.png')
          // Remove it again (confirm dialog accepted automatically).
          await js(`window.confirm = () => true; true`)
          await js(`document.querySelector('[data-testid="branch-button"]').click()`)
          await wait(300)
          await js(`[...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.includes('Remove this worktree'))?.click()`)
          await waitFor('back on main', () => js<boolean>(`(document.querySelector('[data-testid="branch-button"]')?.textContent ?? '').includes('main')`), 20_000)
          await wait(1000)
          if (existsSync(opened.split(' — ')[0])) throw new Error('worktree folder still exists')
          return `opened ${opened.split(' — ')[0]} and removed it`
        })
      }

      console.log('[e2e] done')
    } catch {
      await capture('E_failure.png').catch(() => undefined)
      process.exitCode = 1
    } finally {
      cleanups.forEach((fn) => fn())
      writeFileSync(join(dir, 'report.json'), JSON.stringify({ project, deviceId, steps }, null, 2))
      await win.webContents.executeJavaScript('window.flutvio.flutter.stop()').catch(() => undefined)
      app.quit()
    }
  })
}
