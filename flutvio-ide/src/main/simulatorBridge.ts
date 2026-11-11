/**
 * src/main/simulatorBridge.ts
 * Flutvio — mirrors an iOS Simulator that Xcode already runs (nothing is re-created).
 *
 * How it works:
 *   - `idb_companion` attaches to the booted simulator (UDID) and reads its framebuffer
 *   - ONE gRPC connection to the companion carries:
 *       · `video_stream` — H.264 (Annex-B) at up to 60 fps → renderer decodes with WebCodecs
 *       · `hid` — a long-lived input stream: touch down / move / up, buttons, keys
 *     so a tap costs ~1 ms to send instead of spawning a process.
 *   - `idb` CLI is only used for rare calls (describe, on-screen elements).
 *
 * Requirements (see flutvio-ide/README.md):
 *   - `idb_companion` (brew install facebook/fb/idb-companion)
 *   - `idb` client  (pip install fb-idb, or FLUTVIO_IDB=/path/to/idb) — for elements only
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { ChildProcess, execFile, spawn } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { connect, createServer } from 'node:net'
import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import type { SimButton, SimDevice, SimElement, SimEvent, SimSize, TouchPhase } from '../shared/flutvio-api'
import { deviceChrome } from './deviceChrome'

const SUPERSEDED = 'superseded'

function findTool(name: string, envVar: string, candidates: string[]): string {
  const fromEnv = process.env[envVar]
  for (const p of [fromEnv, ...candidates].filter(Boolean) as string[]) {
    try {
      accessSync(p, constants.X_OK)
      return p
    } catch {
      /* try next */
    }
  }
  return name
}

export const idbPath = (): string =>
  findTool('idb', 'FLUTVIO_IDB', [`${homedir()}/.flutvio-idb/bin/idb`, '/opt/homebrew/bin/idb', '/usr/local/bin/idb'])

export const companionPath = (): string =>
  findTool('idb_companion', 'FLUTVIO_IDB_COMPANION', ['/opt/homebrew/bin/idb_companion', '/usr/local/bin/idb_companion'])

function run(cmd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: 30_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().split('\n').slice(-3).join(' ')))
      else resolve(stdout)
    })
    if (input !== undefined) {
      child.stdin?.end(input)
    }
  })
}

// ─── Ports ────────────────────────────────────────────────────────────────────

/** Preferred companion port; another free port is used if it is taken (e.g. a second Flutvio window). */
const COMPANION_PORT = 10882

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.listen(port, () => srv.close(() => resolve(true)))
  })
}

async function pickPort(): Promise<number> {
  if (await portFree(COMPANION_PORT)) return COMPANION_PORT
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
  })
}

/** Resolves once something accepts TCP connections on the port, or rejects after `ms`. */
function waitForPort(port: number, ms: number, alive: () => boolean): Promise<void> {
  const deadline = Date.now() + ms
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const sock = connect({ port, host: '127.0.0.1' })
      sock.once('connect', () => {
        sock.destroy()
        resolve()
      })
      sock.once('error', () => {
        sock.destroy()
        if (!alive()) reject(new Error('idb_companion exited while starting.'))
        else if (Date.now() > deadline) reject(new Error(`idb_companion did not start listening on port ${port}.`))
        else setTimeout(attempt, 150)
      })
    }
    attempt()
  })
}

// ─── gRPC ─────────────────────────────────────────────────────────────────────

type Client = grpc.Client & {
  video_stream: () => grpc.ClientDuplexStream<unknown, { payload?: { data?: Buffer } }>
  hid: (cb: (err: grpc.ServiceError | null) => void) => grpc.ClientWritableStream<unknown>
  describe: (req: unknown, cb: (err: grpc.ServiceError | null, res: Describe) => void) => void
}
interface Describe {
  target_description?: { screen_dimensions?: { width_points?: number; height_points?: number; density?: number } }
}

let CompanionService: (new (addr: string, creds: grpc.ChannelCredentials) => Client) | null = null
function companionService(): new (addr: string, creds: grpc.ChannelCredentials) => Client {
  if (!CompanionService) {
    // Descriptor exported from fb-idb's idb.proto (MIT).
    const descPath = app.isPackaged ? join(process.resourcesPath, 'idb.desc') : join(app.getAppPath(), 'resources', 'idb.desc')
    const def = protoLoader.loadFileDescriptorSetFromBuffer(readFileSync(descPath), {
      keepCase: true,
      enums: String,
      longs: Number,
      defaults: true,
    })
    const pkg = grpc.loadPackageDefinition(def) as unknown as { idb: { CompanionService: typeof CompanionService } }
    CompanionService = pkg.idb.CompanionService
  }
  return CompanionService!
}

// ─── Keyboard (US layout HID usages, from idb's KEY_MAP) ──────────────────────

const SHIFT = 225
const COMMAND = 227
const PUNCT: Record<string, number> = {
  '\n': 40, ' ': 44, '-': 45, '=': 46, '[': 47, ']': 48, '\\': 49, ';': 51, "'": 52, '`': 53, ',': 54, '.': 55, '/': 56,
}
const SHIFTED: Record<string, string> = {
  '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  _: '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
}

/** HID key codes for one character, or null if it isn't on a US keyboard. */
function keysFor(ch: string): number[] | null {
  const plain = (c: string): number | null => {
    if (c >= 'a' && c <= 'z') return 4 + c.charCodeAt(0) - 97
    if (c >= '1' && c <= '9') return 30 + c.charCodeAt(0) - 49
    if (c === '0') return 39
    return PUNCT[c] ?? null
  }
  if (ch >= 'A' && ch <= 'Z') return [SHIFT, plain(ch.toLowerCase())!]
  if (SHIFTED[ch]) return [SHIFT, plain(SHIFTED[ch])!]
  const k = plain(ch)
  return k == null ? null : [k]
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

export class SimulatorBridge {
  private companion: ChildProcess | null = null
  private companionStarting: Promise<void> | null = null
  private client: Client | null = null
  private video: ReturnType<Client['video_stream']> | null = null
  private hidStream: grpc.ClientWritableStream<unknown> | null = null
  private udid: string | null = null
  private size: SimSize | null = null
  /** Bumped by every start/stop; a start that finds it changed has been superseded. */
  private generation = 0
  private fps = 60

  constructor(private readonly send: (event: SimEvent) => void) {}

  get activeUdid(): string | null {
    return this.udid
  }

  // ── Devices ──

  /** All iOS simulators known to Xcode (booted first). */
  async devices(): Promise<SimDevice[]> {
    const json = JSON.parse(await run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])) as {
      devices: Record<string, Array<{ udid: string; name: string; state: string; deviceTypeIdentifier?: string }>>
    }
    const out: SimDevice[] = []
    for (const [runtime, list] of Object.entries(json.devices)) {
      const m = /SimRuntime\.(iOS|watchOS|tvOS|xrOS|visionOS)-(\d+)-(\d+)/.exec(runtime)
      if (!m || m[1] !== 'iOS') continue
      for (const d of list) {
        out.push({
          udid: d.udid,
          name: d.name,
          runtime: `iOS ${m[2]}.${m[3]}`,
          booted: d.state === 'Booted',
          deviceType: d.deviceTypeIdentifier ?? '',
        })
      }
    }
    return out.sort((a, b) => Number(b.booted) - Number(a.booted) || a.name.localeCompare(b.name))
  }

  /** Boots a simulator and opens it in Simulator.app (as Xcode does). */
  async boot(udid: string): Promise<void> {
    await run('xcrun', ['simctl', 'boot', udid]).catch((e: Error) => {
      if (!/current state: Booted/i.test(e.message)) throw e
    })
    await run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]).catch(() => undefined)
    await run('xcrun', ['simctl', 'bootstatus', udid, '-b'])
  }

  /** Shuts a simulator down (its memory is freed). Mirroring of it stops first. */
  async shutdown(udid: string): Promise<void> {
    if (this.udid === udid) await this.stop()
    await run('xcrun', ['simctl', 'shutdown', udid]).catch((e: Error) => {
      if (!/current state: Shutdown/i.test(e.message)) throw e
    })
  }

  // ── Attach / detach ──

  /** Resolves null when a newer start/stop replaced this one (not an error). */
  async start(udid: string, fps = 60): Promise<SimSize | null> {
    this.fps = fps === 30 ? 30 : 60
    try {
      return await this.startInner(udid)
    } catch (err) {
      if ((err as Error).message === SUPERSEDED) return null
      throw err
    }
  }

  private async startInner(udid: string): Promise<SimSize> {
    if (this.udid === udid && this.video && this.size) {
      this.send({ type: 'video-restart' })
      this.startVideo()
      return this.size
    }
    const gen = ++this.generation
    await this.stopAll()
    const superseded = (): void => {
      if (gen !== this.generation) throw new Error(SUPERSEDED)
    }
    this.udid = udid

    this.send({ type: 'status', message: 'Connecting to simulator…' })
    await this.spawnCompanion(udid)
    superseded()

    // Screen size in points (touch coordinates use this space).
    const info = await new Promise<Describe>((resolve, reject) =>
      this.client!.describe({ fetch_diagnostics: false }, (err, res) => (err ? reject(new Error(err.details || err.message)) : resolve(res))),
    )
    superseded()
    const dims = info.target_description?.screen_dimensions
    if (!dims?.width_points || !dims.height_points) throw new Error('Could not read the simulator screen size. Is it booted?')
    this.size = { widthPts: dims.width_points, heightPts: dims.height_points }

    this.openHid()
    this.startVideo()
    return this.size
  }

  private startVideo(): void {
    const client = this.client
    if (!client) return
    this.video?.cancel()
    const udid = this.udid
    const stream = client.video_stream()
    this.video = stream
    stream.on('data', (msg) => {
      const data = msg.payload?.data
      if (data && data.length) this.send({ type: 'video', data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) })
    })
    stream.on('error', (err: grpc.ServiceError) => {
      if (err.code === grpc.status.CANCELLED || /Cancellation/i.test(err.details || err.message)) return
      if (this.video === stream) this.send({ type: 'error', message: err.details || err.message })
    })
    stream.on('end', () => {
      if (this.video === stream) {
        this.video = null
        if (this.udid === udid) this.send({ type: 'stopped', code: null })
      }
    })
    stream.write({
      start: {
        file_path: '',
        fps: this.fps,
        format: 'H264',
        compression_quality: 0.2,
        scale_factor: 1,
        avg_bitrate: 8_000_000,
        key_frame_rate: 1,
      },
    })
  }

  private openHid(): void {
    this.hidStream?.end()
    const stream = this.client!.hid((err) => {
      const current = this.hidStream === stream
      if (current) this.hidStream = null
      // Closing a stream (detach, re-attach) ends with a cancellation: not an error.
      const cancelled = !err || err.code === grpc.status.CANCELLED || /Cancellation/i.test(err.details || err.message)
      if (current && !cancelled) this.send({ type: 'error', message: err.details || err.message })
    })
    this.hidStream = stream
  }

  /** Writes HID events on the persistent stream (re-opened if it closed). */
  private hid(...events: unknown[]): void {
    if (!this.client) throw new Error('Simulator is not attached.')
    if (!this.hidStream) this.openHid()
    for (const e of events) this.hidStream!.write(e)
  }

  // ── Input ──

  touch(phase: TouchPhase, x: number, y: number): void {
    const point = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
    // A DOWN at a new point while already down moves the finger (idb swipes work the same way).
    this.hid({ press: { action: { touch: { point } }, direction: phase === 'up' ? 'UP' : 'DOWN' } })
  }

  tap(x: number, y: number): void {
    this.touch('down', x, y)
    this.touch('up', x, y)
  }

  swipe(x1: number, y1: number, x2: number, y2: number): void {
    this.hid({ swipe: { start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, delta: 10, duration: 0.2 } })
  }

  button(name: SimButton): void {
    const action = { button: { button: name } }
    this.hid({ press: { action, direction: 'DOWN' } }, { press: { action, direction: 'UP' } })
  }

  key(code: number, modifiers: number[] = []): void {
    const press = (k: number, direction: 'DOWN' | 'UP'): unknown => ({ press: { action: { key: { keycode: k } }, direction } })
    this.hid(
      ...modifiers.map((m) => press(m, 'DOWN')),
      press(code, 'DOWN'),
      press(code, 'UP'),
      ...modifiers.reverse().map((m) => press(m, 'UP')),
    )
  }

  rotate(orientation: 'PORTRAIT' | 'LANDSCAPE_LEFT' | 'LANDSCAPE_RIGHT' | 'PORTRAIT_UPSIDE_DOWN'): void {
    this.hid({ orientation: { orientation } })
  }

  /** US-keyboard text goes in as key presses; anything else (Arabic, emoji…) is pasted. */
  async typeText(text: string): Promise<void> {
    if (!text) return
    const codes = [...text].map(keysFor)
    if (codes.every(Boolean)) {
      for (const keys of codes as number[][]) {
        if (keys.length === 2) this.key(keys[1], [keys[0]])
        else this.key(keys[0])
      }
      return
    }
    if (!this.udid) throw new Error('Simulator is not attached.')
    await run('xcrun', ['simctl', 'pbcopy', this.udid], text)
    this.key(25, [COMMAND]) // ⌘V
  }

  /** Accessibility elements currently on screen (labels + frames in points). */
  async elements(): Promise<SimElement[]> {
    if (!this.udid) throw new Error('Simulator is not attached.')
    let json: string
    try {
      json = await run(idbPath(), ['ui', 'describe-all', '--json', '--udid', this.udid])
    } catch (err) {
      // iOS has no app in front (Home screen, lock screen): nothing to describe.
      if (/no frontmost application/i.test((err as Error).message)) throw new Error('Open an app on the simulator first — the Home screen has no elements to list.')
      throw err
    }
    const raw = JSON.parse(json) as Array<Record<string, unknown>>
    const out: SimElement[] = []
    for (const el of raw) {
      const f = el.frame as { x: number; y: number; width: number; height: number } | undefined
      const label = String(el.AXLabel ?? el.title ?? el.AXValue ?? el.AXUniqueId ?? '').trim()
      if (!f || f.width < 2 || f.height < 2 || !label) continue
      out.push({ label, role: String(el.role ?? ''), x: f.x, y: f.y, width: f.width, height: f.height })
    }
    return out
  }

  // ── Companion process ──

  private spawnCompanion(udid: string): Promise<void> {
    const p = this.spawnCompanionInner(udid).finally(() => {
      if (this.companionStarting === p) this.companionStarting = null
    })
    this.companionStarting = p
    return p
  }

  private async spawnCompanionInner(udid: string): Promise<void> {
    const port = await pickPort()
    const child = spawn(companionPath(), ['--udid', udid, '--grpc-port', String(port)], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr!.on('data', (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-2000)
    })
    child.on('exit', () => {
      // The companion went away: tell the panel so it can offer Reconnect.
      if (this.companion === child) {
        this.companion = null
        this.client?.close()
        this.client = null
        this.video = null
        this.hidStream = null
        if (this.udid === udid) this.send({ type: 'stopped', code: child.exitCode })
      }
    })
    this.companion = child
    try {
      await waitForPort(port, 15_000, () => child.exitCode === null && child.signalCode === null)
    } catch (err) {
      const last = stderr.trim().split('\n').pop()
      throw new Error(last ? `${(err as Error).message} ${last}` : (err as Error).message)
    }
    const Service = companionService()
    this.client = new Service(`127.0.0.1:${port}`, grpc.credentials.createInsecure())
    // Register with the idb CLI too (used for on-screen elements).
    void run(idbPath(), ['connect', 'localhost', String(port)]).catch(() => undefined)
  }

  async stop(): Promise<void> {
    this.generation++
    await this.stopAll()
  }

  /** Closes the streams and companion and waits until the companion has released its port. */
  private async stopAll(): Promise<void> {
    const companion = this.companion
    this.video?.cancel()
    this.hidStream?.end()
    this.client?.close()
    this.video = null
    this.hidStream = null
    this.client = null
    this.companion = null
    this.companionStarting = null
    this.udid = null
    this.size = null
    if (companion && companion.exitCode === null) {
      const exited = new Promise<void>((resolve) => companion.once('exit', () => resolve()))
      companion.kill('SIGTERM')
      await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))])
    }
  }
}

export function registerSimulatorIPC(win: BrowserWindow): SimulatorBridge {
  const bridge = new SimulatorBridge((event) => {
    if (!win.isDestroyed()) win.webContents.send('sim:event', event)
  })
  const handle = (ch: string, fn: (...args: never[]) => unknown): void => {
    ipcMain.removeHandler(ch)
    ipcMain.handle(ch, (_e, ...args) => fn(...(args as never[])))
  }
  handle('sim:devices', () => bridge.devices())
  handle('sim:boot', (udid: string) => bridge.boot(udid))
  handle('sim:shutdown', (udid: string) => bridge.shutdown(udid))
  handle('sim:chrome', async (udid: string) => {
    const d = (await bridge.devices()).find((x) => x.udid === udid)
    return d ? deviceChrome(d.deviceType, d.name) : null
  })
  handle('sim:start', (udid: string, fps?: number) => bridge.start(udid, fps))
  handle('sim:stop', () => bridge.stop())
  handle('sim:tap', (x: number, y: number) => bridge.tap(x, y))
  handle('sim:button', (name: SimButton) => bridge.button(name))
  handle('sim:swipe', (a: number, b: number, c: number, d: number) => bridge.swipe(a, b, c, d))
  handle('sim:text', (text: string) => bridge.typeText(text))
  handle('sim:key', (code: number, mods?: number[]) => bridge.key(code, mods))
  handle('sim:rotate', (o: Parameters<SimulatorBridge['rotate']>[0]) => bridge.rotate(o))
  handle('sim:elements', () => bridge.elements())
  // Touches are fire-and-forget (no reply round trip while dragging).
  ipcMain.removeAllListeners('sim:touch')
  ipcMain.on('sim:touch', (_e, phase: TouchPhase, x: number, y: number) => {
    try {
      bridge.touch(phase, x, y)
    } catch {
      /* not attached */
    }
  })
  win.on('closed', () => void bridge.stop())
  return bridge
}
