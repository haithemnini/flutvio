/**
 * src/main/flutterDaemon.ts
 * Flutvio — Flutter Daemon Service (Phase 1)
 *
 * Wraps a single `flutter run --machine` process and exposes:
 *   - Hot Reload / Hot Restart (JSON-RPC `app.restart`)
 *   - Screenshot (via the `flutter screenshot` CLI)
 *   - Device listing (`flutter devices --machine`)
 *   - Lifecycle events (EventEmitter)
 *
 * Machine protocol:
 *   - Each message is one line on stdout: a single-element JSON array `[{...}]`
 *   - Commands go to stdin in the same framing
 *   - Non-JSON lines (banners, build output) can appear and are forwarded as logs
 *
 * Reference:
 *   https://github.com/flutter/flutter/blob/master/packages/flutter_tools/doc/daemon.md
 */

import { ChildProcess, spawn, execFile } from 'node:child_process'
import { createInterface, Interface as ReadlineInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import type { FlutterDevice } from '../shared/flutvio-api'

export type { FlutterDevice }

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlutterRpcMessage {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
  event?: string
}

export interface DaemonOptions {
  /** Absolute path to the Flutter project root (where pubspec.yaml lives). */
  projectPath: string
  /** Target device id, as reported by `flutter devices --machine`. */
  deviceId?: string
  /** Extra flags forwarded to `flutter run`, e.g. ['--flavor', 'dev']. */
  extraArgs?: string[]
  /** Path to the flutter executable (default: 'flutter' on PATH). */
  flutterBin?: string
}

interface PendingRequest {
  method: string
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: NodeJS.Timeout
}

/** How long to wait for a JSON-RPC response before giving up. */
const REQUEST_TIMEOUT_MS: Record<string, number> = {
  'app.restart': 120_000, // a hot restart after big changes can be slow
  'app.stop': 10_000,
}
const DEFAULT_TIMEOUT_MS = 30_000

// ─── Class ────────────────────────────────────────────────────────────────────

/**
 * Emits:
 *  - 'daemon.connected'   () — process spawned, JSON-RPC pipe ready
 *  - 'app.starting'       ({ appId, deviceId })
 *  - 'app.started'        ({ appId, deviceId })
 *  - 'app.debugPort'      ({ wsUri, httpUri })
 *  - 'app.log'            ({ log, error })
 *  - 'app.progress'       ({ message, finished })
 *  - 'app.stop'           ({ appId, error? })
 *  - 'daemon.error'       (error: Error)
 *  - 'daemon.exit'        ({ code, signal })
 */
export class FlutterDaemon extends EventEmitter {
  private process: ChildProcess | null = null
  private stdoutReader: ReadlineInterface | null = null
  private requestId = 0
  private readonly pending = new Map<number, PendingRequest>()
  private readonly flutterBin: string

  /** Set once Flutter reports `app.start` for the running app. */
  private appId: string | null = null
  private started = false

  constructor(private readonly options: DaemonOptions) {
    super()
    this.flutterBin = options.flutterBin ?? 'flutter'
  }

  /** True while a `flutter run --machine` child process is alive. */
  get isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }

  /** True once the app has finished launching (`app.started`). */
  get isAppStarted(): boolean {
    return this.isRunning && this.started
  }

  // ─── Static: List Devices ──────────────────────────────────────────────────

  /**
   * Lists available devices via `flutter devices --machine`.
   * This spawns a short-lived, separate process — NOT the daemon process.
   */
  static async listDevices(flutterBin = 'flutter'): Promise<FlutterDevice[]> {
    return new Promise((resolve, reject) => {
      execFile(
        flutterBin,
        ['devices', '--machine'],
        { maxBuffer: 10 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            reject(new Error(`flutter devices failed: ${error.message}`))
            return
          }
          try {
            // Flutter may print warnings before the JSON array; parse from the first '['.
            const start = stdout.indexOf('[')
            const raw = JSON.parse(stdout.slice(start).trim()) as Array<Record<string, unknown>>
            resolve(raw.map(parseDevice))
          } catch (parseErr) {
            reject(new Error(`Failed to parse flutter devices output: ${parseErr}`))
          }
        },
      )
    })
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Spawns `flutter run --machine` for the configured project.
   * Resolves once the process is spawned (before the app finishes building).
   * Listen to 'app.started' for when the app is actually running.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('FlutterDaemon: already running. Call stop() first.')
    }

    const args = ['--suppress-analytics', 'run', '--machine']
    if (this.options.deviceId) args.push('-d', this.options.deviceId)
    if (this.options.extraArgs?.length) args.push(...this.options.extraArgs)

    const child = spawn(this.flutterBin, args, {
      cwd: this.options.projectPath,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.process = child
    this.started = false

    this.stdoutReader = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    this.stdoutReader.on('line', (line) => this._handleLine(line))

    // Flutter prints build errors and warnings on stderr.
    child.stderr?.on('data', (chunk: Buffer) => {
      this.emit('app.log', { log: chunk.toString('utf-8'), error: true })
    })

    child.on('exit', (code, signal) => {
      if (this.process !== child) return
      this._cleanup()
      this.emit('daemon.exit', { code, signal })
    })

    child.on('error', (err) => {
      if (this.process !== child) return
      this._cleanup()
      this.emit('daemon.error', err)
    })

    this.emit('daemon.connected')
  }

  /** Hot Reload: injects changed code, keeps app state. */
  async hotReload(): Promise<void> {
    this._assertAppStarted('hotReload')
    await this._restart(false)
  }

  /** Hot Restart: restarts the app and resets its state. */
  async hotRestart(): Promise<void> {
    this._assertAppStarted('hotRestart')
    await this._restart(true)
  }

  /**
   * Captures a screenshot of the device via `flutter screenshot`.
   * Returns the absolute path where the image was saved.
   */
  async screenshot(outputPath: string): Promise<string> {
    this._assertRunning('screenshot')
    if (!this.options.deviceId) {
      throw new Error('FlutterDaemon.screenshot(): deviceId is required.')
    }
    // The machine protocol exposes no screenshot method, so use the CLI.
    await new Promise<void>((resolve, reject) => {
      execFile(
        this.flutterBin,
        ['screenshot', '-d', this.options.deviceId!, '-o', outputPath, '--type', 'device'],
        { cwd: this.options.projectPath },
        (error) => (error ? reject(new Error(`flutter screenshot failed: ${error.message}`)) : resolve()),
      )
    })
    return outputPath
  }

  /**
   * Gracefully stops the app (`app.stop`), then terminates the process.
   * Resolves once the process has exited.
   */
  async stop(): Promise<void> {
    const child = this.process
    if (!child || !this.isRunning) return

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    try {
      if (this.appId) await this._sendRequest('app.stop', { appId: this.appId })
    } catch {
      // Ignore — process may have already exited or not started the app yet.
    }
    if (child.exitCode === null) child.kill('SIGTERM')
    // Force-kill if it does not go away.
    const force = setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(force)
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async _restart(fullRestart: boolean): Promise<void> {
    const result = (await this._sendRequest('app.restart', {
      appId: this.appId,
      fullRestart,
      pause: false,
      reason: 'manual',
    })) as { code?: number; message?: string } | null
    // Flutter answers compile errors with a non-zero code instead of an RPC error.
    if (result && typeof result.code === 'number' && result.code !== 0) {
      throw new Error(result.message || `${fullRestart ? 'Hot restart' : 'Hot reload'} failed (code ${result.code})`)
    }
  }

  /**
   * Processes a single line from flutter's stdout:
   *   [{"id":1,"result":{...}}]                   ← response
   *   [{"event":"app.started","params":{...}}]    ← event
   *   anything else                               ← plain log line
   */
  private _handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    let messages: FlutterRpcMessage[] | null = null
    if (trimmed.startsWith('[{') && trimmed.endsWith('}]')) {
      try {
        messages = JSON.parse(trimmed) as FlutterRpcMessage[]
      } catch {
        messages = null
      }
    }
    if (!messages) {
      this.emit('app.log', { log: line, error: false })
      return
    }

    for (const msg of messages) {
      if (msg.id !== undefined && msg.event === undefined) {
        this._handleResponse(msg)
      } else {
        this._handleEvent(msg.event ?? '', msg.params ?? {})
      }
    }
  }

  private _handleResponse(msg: FlutterRpcMessage): void {
    const pending = this.pending.get(msg.id!)
    if (!pending) return
    this.pending.delete(msg.id!)
    clearTimeout(pending.timer)
    if (msg.error) {
      const text = typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error)
      pending.reject(new Error(text))
    } else {
      pending.resolve(msg.result)
    }
  }

  private _handleEvent(event: string, params: Record<string, unknown>): void {
    switch (event) {
      case 'daemon.connected':
        break // our own 'daemon.connected' is emitted on spawn

      case 'app.start':
        this.appId = String(params.appId ?? '')
        this.emit('app.starting', { appId: this.appId, deviceId: params.deviceId })
        break

      case 'app.started':
        this.appId = String(params.appId ?? this.appId ?? '')
        this.started = true
        this.emit('app.started', { appId: this.appId, deviceId: params.deviceId ?? this.options.deviceId })
        break

      case 'app.debugPort':
        this.emit('app.debugPort', { wsUri: params.wsUri, httpUri: params.baseUri })
        break

      case 'app.log':
        this.emit('app.log', { log: String(params.log ?? ''), error: Boolean(params.error) })
        break

      case 'app.progress':
        if (params.message || params.finished) {
          this.emit('app.progress', { message: String(params.message ?? ''), finished: Boolean(params.finished) })
        }
        break

      case 'app.stop':
        this.started = false
        this.emit('app.stop', { appId: params.appId, error: params.error })
        break

      case 'daemon.logMessage':
      case 'daemon.log':
        this.emit('app.log', { log: String(params.message ?? params.log ?? ''), error: params.level === 'error' || Boolean(params.error) })
        break

      case 'app.devTools':
        if (params.uri) this.emit('app.log', { log: `DevTools: ${params.uri}`, error: false })
        break

      case 'app.dtd':
      case 'app.webLaunchUrl':
      case 'device.added':
      case 'device.removed':
        break // internal bookkeeping — not useful in the console

      case 'daemon.showMessage':
        this.emit('app.log', { log: `[Flutter] ${params.title ?? ''} ${params.message ?? ''}`.trim(), error: params.level === 'error' })
        break

      default:
        // Unknown event — forward for debugging.
        this.emit('app.log', { log: `[daemon event] ${event}: ${JSON.stringify(params)}`, error: false })
    }
  }

  /**
   * Sends a JSON-RPC request via stdin (`[{"id":N,"method":...,"params":...}]`)
   * and resolves with the response result. Rejects on timeout or process exit.
   */
  private _sendRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error(`FlutterDaemon: stdin not writable (method: ${method})`))
        return
      }
      const id = ++this.requestId
      const timeoutMs = REQUEST_TIMEOUT_MS[method] ?? DEFAULT_TIMEOUT_MS
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`FlutterDaemon: ${method} timed out after ${timeoutMs} ms`))
      }, timeoutMs)
      this.pending.set(id, { method, resolve, reject, timer })
      this.process.stdin.write(JSON.stringify([{ id, method, params }]) + '\n')
    })
  }

  private _assertRunning(method: string): void {
    if (!this.isRunning) throw new Error(`FlutterDaemon.${method}(): daemon is not running.`)
  }

  private _assertAppStarted(method: string): void {
    this._assertRunning(method)
    if (!this.started || !this.appId) {
      throw new Error(`FlutterDaemon.${method}(): the app has not finished launching yet.`)
    }
  }

  private _cleanup(): void {
    this.stdoutReader?.close()
    this.stdoutReader = null
    this.process = null
    this.appId = null
    this.started = false
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`FlutterDaemon: process exited before ${pending.method} responded`))
      this.pending.delete(id)
    }
  }
}

function parseDevice(d: Record<string, unknown>): FlutterDevice {
  const caps = (d.capabilities ?? {}) as Record<string, unknown>
  return {
    id: String(d.id ?? ''),
    name: String(d.name ?? 'Unknown'),
    platform: String(d.targetPlatform ?? d.platform ?? 'unknown'),
    emulator: Boolean(d.emulator ?? false),
    sdk: String(d.sdk ?? ''),
    supported: d.isSupported === undefined ? true : Boolean(d.isSupported),
    canHotReload: caps.hotReload === undefined ? true : Boolean(caps.hotReload),
    canScreenshot: caps.screenshot === undefined ? true : Boolean(caps.screenshot),
  }
}
