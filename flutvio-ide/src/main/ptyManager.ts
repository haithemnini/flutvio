/**
 * src/main/ptyManager.ts
 * Flutvio — terminal (PTY) sessions for the renderer, keyed by an id the renderer chooses.
 *
 * Creating a session with an id that already exists replaces it; events from a replaced
 * session are dropped so they can never be mistaken for the current one (React StrictMode
 * mounts twice). An optional `command` is typed into the new shell (e.g. `claude --resume …`).
 */

import { BrowserWindow, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter } from 'node:path'
import * as pty from 'node-pty'
import type { PtyCreateOptions } from '../shared/flutvio-api'
import { isWrapper, titleFromCommand } from './ptyTitle'

export const DEFAULT_PTY = 'main'

/**
 * The environment a user's shell should start from: ours, minus what the tooling that launched
 * Flutvio added (`npm run dev` sets EDITOR=vi, which silently puts zsh in vi mode, plus
 * hundreds of npm_* variables).
 */
export function shellEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {}
  const fromNpm = Boolean(env.npm_lifecycle_event || env.npm_execpath)
  // Started from inside a Claude Code session: its session markers would make an agent in our
  // terminal think it is a child of that session (no transcript, wrong entry point).
  const fromClaude = Boolean(env.CLAUDECODE)
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue
    if (/^(npm_|ELECTRON_|VITE_)/.test(k) || k === 'INIT_CWD' || k === 'NODE_ENV' || k === 'COLOR') continue
    if (fromClaude && (/^(CLAUDECODE$|CLAUDE_CODE_|CLAUDE_AGENT_SDK_|CLAUDE_PREVIEW_)/.test(k) || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT' || k === 'ANTHROPIC_BASE_URL')) continue
    if (fromNpm && k === 'EDITOR' && v === (env.npm_config_editor ?? 'vi')) continue
    out[k] = v
  }
  return out
}

export class PtyManager {
  private sessions = new Map<string, pty.IPty>()
  /** Last title sent per session, and the raw process name it came from. */
  private titles = new Map<string, { process: string; title: string }>()
  private watcher: NodeJS.Timeout | null = null
  /** Extra environment for every shell (the `flutvio` command: port, token, bin folder). */
  private extraEnv: Record<string, string> = {}
  /** Observers (the agent monitor): output arrived, keys were typed, the foreground program changed. */
  hooks: { output?: (id: string) => void; input?: (id: string) => void; title?: (id: string, title: string) => void; gone?: (id: string) => void } = {}

  constructor(private readonly win: BrowserWindow) {}

  setEnv(env: Record<string, string>): void {
    this.extraEnv = env
  }

  /** Once a second: name each tab after its foreground process (zsh → claude → zsh …). */
  private watch(): void {
    if (this.watcher) return
    this.watcher = setInterval(() => {
      if (!this.sessions.size) {
        clearInterval(this.watcher!)
        this.watcher = null
        return
      }
      for (const [id, proc] of this.sessions) {
        let name = ''
        try {
          name = proc.process
        } catch {
          continue
        }
        if (!name || this.titles.get(id)?.process === name) continue
        this.titles.set(id, { process: name, title: this.titles.get(id)?.title ?? '' })
        void this.resolveTitle(proc, name).then((title) => {
          const cur = this.titles.get(id)
          if (!title || this.sessions.get(id) !== proc || !cur || cur.process !== name || cur.title === title) return
          cur.title = title
          this.hooks.title?.(id, title)
          if (!this.win.isDestroyed()) this.win.webContents.send('pty:title', id, title)
        })
      }
    }, 1000)
  }

  /** `node`/`bun`/… only host a script: read the foreground command line to name the script. */
  private resolveTitle(proc: pty.IPty, name: string): Promise<string> {
    if (!isWrapper(name)) return Promise.resolve(titleFromCommand(name))
    const ps = (args: string[]): Promise<string> =>
      new Promise((ok) => execFile('ps', args, { timeout: 3000 }, (err, out) => ok(err ? '' : out.trim())))
    return ps(['-o', 'tpgid=', '-p', String(proc.pid)])
      .then(async (pgid) => {
        if (!/^\d+$/.test(pgid)) return titleFromCommand(name)
        const title = titleFromCommand((await ps(['-o', 'command=', '-p', pgid])) || name)
        // Still only a version (argv[0] was rewritten): the executable's path names the program.
        return /^v?\d+(\.\d+)+$/.test(title) ? titleFromCommand((await ps(['-o', 'comm=', '-p', pgid])) || title) : title
      })
  }

  create({ id = DEFAULT_PTY, cols, rows, cwd, command }: PtyCreateOptions): { pid: number } {
    this.kill(id)

    const proc = pty.spawn(process.env.SHELL ?? 'zsh', ['-l'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd && existsSync(cwd) ? cwd : process.env.HOME,
      env: {
        ...shellEnv(),
        // UTF-8 locale for proper Unicode/Arabic support
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        TERM: 'xterm-256color',
        TERM_PROGRAM: 'Flutvio',
        ...this.extraEnv,
        // `flutvio` on PATH (kept by login shells: path_helper only re-orders known entries).
        ...(this.extraEnv.FLUTVIO_BIN ? { PATH: `${process.env.PATH ?? ''}${delimiter}${this.extraEnv.FLUTVIO_BIN}` } : {}),
      } as Record<string, string>,
    })
    this.sessions.set(id, proc)
    this.titles.delete(id)
    this.watch()

    proc.onData((data) => {
      if (this.sessions.get(id) !== proc) return
      this.hooks.output?.(id)
      if (!this.win.isDestroyed()) this.win.webContents.send('pty:data', id, data)
    })
    proc.onExit(({ exitCode }) => {
      if (this.sessions.get(id) !== proc) return
      this.sessions.delete(id)
      this.titles.delete(id)
      this.hooks.gone?.(id)
      if (!this.win.isDestroyed()) this.win.webContents.send('pty:exit', id, exitCode)
    })
    if (command) proc.write(command + '\r')
    return { pid: proc.pid }
  }

  write(id: string, data: string): void {
    if (process.env['FLUTVIO_PTY_DEBUG']) console.log(`[pty] ${id} ← ${Buffer.from(data).toString('hex')}`)
    this.hooks.input?.(id)
    this.sessions.get(id)?.write(data)
  }

  /** Terminals with a known foreground program: its name and the shell's pid. */
  running(): Array<{ id: string; title: string; pid: number }> {
    const out: Array<{ id: string; title: string; pid: number }> = []
    for (const [id, proc] of this.sessions) {
      const title = this.titles.get(id)?.title
      if (title) out.push({ id, title, pid: proc.pid })
    }
    return out
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.sessions.get(id)?.resize(cols, rows)
  }

  kill(id: string): void {
    const proc = this.sessions.get(id)
    this.sessions.delete(id) // detach first so its exit is not reported
    this.titles.delete(id)
    if (proc) this.hooks.gone?.(id)
    proc?.kill()
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}

export function registerPtyIPC(win: BrowserWindow): PtyManager {
  const manager = new PtyManager(win)
  // Re-registering is safe: macOS can re-create the window after all were closed.
  for (const ch of ['pty:create', 'pty:resize', 'pty:kill']) ipcMain.removeHandler(ch)
  ipcMain.removeAllListeners('pty:write')

  ipcMain.handle('pty:create', (_e, opts: PtyCreateOptions) => manager.create(opts))
  ipcMain.on('pty:write', (_e, id: string, data: string) => manager.write(id, data))
  ipcMain.handle('pty:resize', (_e, id: string, cols: number, rows: number) => manager.resize(id, cols, rows))
  ipcMain.handle('pty:kill', (_e, id: string) => manager.kill(id))
  win.on('closed', () => manager.killAll())
  return manager
}
