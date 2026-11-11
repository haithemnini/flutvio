/**
 * src/main/dartLsp.ts
 * Flutvio — runs the Dart analysis server (`dart language-server --protocol=lsp`) for the open
 * project and relays LSP JSON-RPC between it and the editor (IPC: lsp:*).
 *
 *   renderer ── lsp:request / lsp:notify ──▶ main ── stdin (Content-Length framed) ──▶ server
 *   renderer ◀── lsp:event (notifications) ── main ◀── stdout ──────────────────────── server
 *
 * Requests the server sends to the client (configuration, capability registration, progress)
 * are answered here with simple defaults.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { ChildProcess, spawn } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveFlutterBin } from './flutterBin'

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

const REQUEST_TIMEOUT_MS = 30_000
const INITIALIZE_TIMEOUT_MS = 90_000
const SUPERSEDED = 'superseded'

async function dartBin(): Promise<string> {
  const flutter = await resolveFlutterBin()
  let dir = dirname(flutter)
  try {
    dir = dirname(realpathSync(flutter))
  } catch {
    /* keep */
  }
  for (const p of [join(dir, 'cache/dart-sdk/bin/dart'), join(dir, 'dart')]) if (existsSync(p)) return p
  return 'dart'
}

export class DartLsp {
  private proc: ChildProcess | null = null
  private root: string | null = null
  private seq = 1
  private pending = new Map<number, Pending>()
  private buf = Buffer.alloc(0)
  private ready: Promise<unknown> | null = null
  private stderr = ''
  /** Automatic restarts after a crash (reset when a project is opened). */
  private restarts = 0
  /** Bumped by every start/stop; a boot that sees it changed gives up (no second server on the same pipe). */
  private gen = 0

  constructor(private readonly emit: (method: string, params: unknown) => void) {}

  /** Starts (or restarts for another project) and resolves with the server capabilities. */
  start(root: string): Promise<unknown> {
    if (this.root === root && this.ready) return this.ready
    this.stop()
    this.root = root
    this.restarts = 0
    const gen = this.gen
    this.ready = this.boot(root, gen).catch((err: Error) => {
      if (gen !== this.gen) throw new Error(SUPERSEDED) // replaced by a newer start/stop: not an error
      this.emit('$/flutvio/status', { state: 'error', message: err.message })
      this.ready = null
      throw err
    })
    return this.ready
  }

  private async boot(root: string, gen: number): Promise<unknown> {
    this.stderr = ''
    this.emit('$/flutvio/status', { state: 'starting' })
    const bin = await dartBin()
    if (gen !== this.gen) throw new Error('superseded')
    this.buf = Buffer.alloc(0)
    const proc = spawn(bin, ['language-server', '--protocol=lsp', '--client-id=flutvio', '--client-version=0.1'], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc = proc
    proc.stdout!.on('data', (chunk: Buffer) => {
      if (this.proc === proc) this.onData(chunk)
    })
    proc.stderr!.on('data', (c: Buffer) => {
      this.stderr = (this.stderr + c.toString()).slice(-4000)
    })
    proc.on('exit', (code) => {
      if (this.proc !== proc) return
      this.proc = null
      this.ready = null
      for (const p of this.pending.values()) {
        clearTimeout(p.timer)
        p.reject(new Error('Dart analysis server stopped.'))
      }
      this.pending.clear()
      const last = this.stderr.trim().split('\n').slice(-3).join(' | ')
      console.warn(`[dart-lsp] exited with code ${code}${last ? `: ${last}` : ''}`)
      // Crashed while a project is open: start it again (a few times) and let the editor re-open its files.
      if (this.root === root && this.restarts < 3) {
        this.restarts++
        this.emit('$/flutvio/status', { state: 'starting' })
        const g = this.gen
        this.ready = this.boot(root, g)
          .then((caps) => {
            this.emit('$/flutvio/reopen', {})
            return caps
          })
          .catch((err: Error) => {
            if (g === this.gen) {
              this.emit('$/flutvio/status', { state: 'error', message: err.message })
              this.ready = null
            }
            throw err
          })
        this.ready.catch(() => undefined)
        return
      }
      this.emit('$/flutvio/status', { state: 'error', message: `Dart analysis server exited (${code}). ${last}` })
    })

    const rootUri = pathToFileURL(root).href
    const result = (await this.request('initialize', {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: root.split('/').pop() }],
      initializationOptions: { closingLabels: false, outline: false, flutterOutline: false, suggestFromUnimportedLibraries: true },
      capabilities: {
        workspace: { configuration: true, applyEdit: true, workspaceFolders: true },
        textDocument: {
          synchronization: { didSave: true, dynamicRegistration: false },
          completion: {
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
              insertReplaceSupport: false,
            },
            contextSupport: true,
          },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'], parameterInformation: { labelOffsetSupport: true } } },
          definition: { linkSupport: false },
          formatting: {},
          publishDiagnostics: { relatedInformation: false, tagSupport: { valueSet: [1, 2] } },
        },
        window: { workDoneProgress: true },
      },
      // The first start can be slow (cold Dart VM, a build running): give it longer than normal requests.
    }, INITIALIZE_TIMEOUT_MS)) as { capabilities?: unknown }
    this.notify('initialized', {})
    this.emit('$/flutvio/status', { state: 'ready' })
    return result.capabilities ?? {}
  }

  request(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    if (!this.proc) return Promise.reject(new Error('Dart analysis server is not running.'))
    const id = this.seq++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown): void {
    if (this.proc) this.write({ jsonrpc: '2.0', method, params })
  }

  private write(msg: unknown): void {
    const body = Buffer.from(JSON.stringify(msg), 'utf8')
    this.proc?.stdin?.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.proc?.stdin?.write(body)
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk])
    for (;;) {
      const headerEnd = this.buf.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = this.buf.subarray(0, headerEnd).toString('ascii')
      const len = Number(/Content-Length: (\d+)/i.exec(header)?.[1] ?? NaN)
      if (Number.isNaN(len)) {
        this.buf = this.buf.subarray(headerEnd + 4)
        continue
      }
      if (this.buf.length < headerEnd + 4 + len) return
      const body = this.buf.subarray(headerEnd + 4, headerEnd + 4 + len).toString('utf8')
      this.buf = this.buf.subarray(headerEnd + 4 + len)
      try {
        this.handle(JSON.parse(body))
      } catch {
        /* ignore malformed */
      }
    }
  }

  private handle(msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } }): void {
    // Response to one of our requests
    if (msg.id !== undefined && !msg.method) {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result ?? null)
      return
    }
    // Request from the server
    if (msg.id !== undefined && msg.method) {
      let result: unknown = null
      if (msg.method === 'workspace/configuration') {
        const items = (msg.params as { items?: unknown[] })?.items ?? []
        result = items.map(() => ({}))
      }
      this.write({ jsonrpc: '2.0', id: msg.id, result })
      return
    }
    // Notification
    if (msg.method) this.emit(msg.method, msg.params)
  }

  stop(): void {
    this.gen++
    const proc = this.proc
    this.proc = null
    this.ready = null
    this.root = null
    // Requests of the server being replaced will never be answered: settle them now, so a start
    // that was superseded doesn't fail later with "initialize timed out".
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(SUPERSEDED))
    }
    this.pending.clear()
    if (proc) {
      try {
        this.write({ jsonrpc: '2.0', id: this.seq++, method: 'shutdown' })
      } catch {
        /* ignore */
      }
      proc.kill()
    }
  }
}

export function registerLspIPC(win: BrowserWindow): DartLsp {
  const lsp = new DartLsp((method, params) => {
    if (!win.isDestroyed()) win.webContents.send('lsp:event', method, params)
  })
  for (const ch of ['lsp:start', 'lsp:request', 'lsp:stop']) ipcMain.removeHandler(ch)
  ipcMain.removeAllListeners('lsp:notify')
  // A start replaced by a newer one (another project, a remount) is not an error: resolve with null.
  ipcMain.handle('lsp:start', (_e, root: string) =>
    lsp.start(root).catch((err: Error) => {
      if (err.message === SUPERSEDED) return null
      throw err
    }),
  )
  ipcMain.handle('lsp:request', (_e, method: string, params: unknown) => lsp.request(method, params))
  ipcMain.handle('lsp:stop', () => lsp.stop())
  ipcMain.on('lsp:notify', (_e, method: string, params: unknown) => lsp.notify(method, params))
  win.on('closed', () => lsp.stop())
  return lsp
}
