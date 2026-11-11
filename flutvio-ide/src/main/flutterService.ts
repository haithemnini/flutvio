/**
 * src/main/flutterService.ts
 * Flutvio — app-level Flutter controller (Phase 1).
 *
 * Owns the current project, selected device and the single FlutterDaemon,
 * keeps a small state machine, and exposes it all over IPC to the renderer.
 */

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import type {
  ActionResult,
  FlutterDevice,
  FlutterEvent,
  FlutterProject,
  FlutterState,
  FlutterStatus,
  ScreenshotResult,
} from '../shared/flutvio-api'
import { FlutterDaemon } from './flutterDaemon'
import { resolveFlutterBin } from './flutterBin'
import { addRecentProject, loadSettings, saveSettings } from './settingsStore'
import { setFilesRoot } from './projectFiles'

export function readProject(path: string): FlutterProject {
  const pubspec = join(path, 'pubspec.yaml')
  if (!existsSync(pubspec)) {
    throw new Error(`Not a Flutter project: no pubspec.yaml in ${path}`)
  }
  const name = readFileSync(pubspec, 'utf8').match(/^name:\s*["']?([\w-]+)/m)?.[1] ?? basename(path)
  return { path, name }
}

/** Desktop by default; FLUTVIO_SCREENSHOT_DIR overrides it (used by tests). */
function screenshotDir(): string {
  return process.env.FLUTVIO_SCREENSHOT_DIR || app.getPath('desktop')
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

const safe = (s: string): string => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')

export class FlutterService {
  /** Called after the open project changes (the app menu rebuilds its recent list). */
  onProjectChanged: (() => void) | null = null
  private daemon: FlutterDaemon | null = null
  private devices: FlutterDevice[] = []
  private state: FlutterState = { status: 'idle', project: null, deviceId: null, runningDeviceId: null }

  /** Last lines of Flutter output (for `flutvio logs`). */
  private logBuffer: string[] = []
  private readonly emit = (event: FlutterEvent): void => {
    if (event.type === 'log') {
      this.logBuffer.push(...event.text.split('\n'))
      if (this.logBuffer.length > 500) this.logBuffer.splice(0, this.logBuffer.length - 500)
    }
    this.emitRaw(event)
  }

  recentLogs(n: number): string[] {
    return this.logBuffer.slice(-n)
  }

  constructor(private readonly emitRaw: (event: FlutterEvent) => void) {
    const settings = loadSettings()
    if (settings.lastProjectPath) {
      try {
        this.state.project = readProject(settings.lastProjectPath)
        setFilesRoot(this.state.project.path)
      } catch {
        /* project moved or deleted — start without one */
      }
    }
    this.state.deviceId = settings.lastDeviceId ?? null
  }

  getState(): FlutterState {
    return { ...this.state }
  }

  async listDevices(): Promise<FlutterDevice[]> {
    this.devices = await FlutterDaemon.listDevices(await resolveFlutterBin())
    return this.devices
  }

  async pickProject(win: BrowserWindow): Promise<FlutterProject | null> {
    const res = await dialog.showOpenDialog(win, {
      title: 'Open Flutter Project',
      properties: ['openDirectory'],
      defaultPath: this.state.project?.path,
    })
    if (res.canceled || !res.filePaths[0]) return null
    return this.setProject(res.filePaths[0])
  }

  setProject(path: string): FlutterProject {
    if (this.daemon) throw new Error('Stop the running app before switching projects.')
    const project = readProject(path)
    this.state.project = project
    setFilesRoot(project.path)
    saveSettings({ lastProjectPath: path })
    addRecentProject(project.path)
    this.onProjectChanged?.()
    this.publishState()
    return project
  }

  selectDevice(deviceId: string): void {
    this.state.deviceId = deviceId
    saveSettings({ lastDeviceId: deviceId })
    this.publishState()
  }

  async run(): Promise<void> {
    const { project, deviceId } = this.state
    if (!project) throw new Error('Open a Flutter project first.')
    if (!deviceId) throw new Error('Select a device first.')
    if (this.daemon) throw new Error('The app is already running. Stop it first.')

    const daemon = new FlutterDaemon({
      projectPath: project.path,
      deviceId,
      flutterBin: await resolveFlutterBin(),
    })
    this.daemon = daemon

    daemon.on('app.log', ({ log, error }) => this.emit({ type: 'log', text: String(log), error }))
    daemon.on('app.progress', ({ message, finished }) => this.emit({ type: 'progress', message, finished }))
    daemon.on('app.started', () => this.setStatus('running'))
    daemon.on('daemon.error', (err: Error) => {
      this.emit({ type: 'log', text: `Could not start flutter: ${err.message}`, error: true })
    })
    const finish = (code: number | null): void => {
      if (this.daemon !== daemon) return
      this.daemon = null
      this.state.runningDeviceId = null
      this.setStatus('idle')
      this.emit({ type: 'exit', code })
    }
    daemon.on('daemon.exit', ({ code }) => finish(code))
    daemon.on('daemon.error', () => finish(null))

    this.state.runningDeviceId = deviceId
    this.setStatus('launching')
    this.emit({ type: 'log', text: `$ flutter run -d ${deviceId}  (${project.path})`, error: false })
    await daemon.start()
  }

  hotReload(): Promise<ActionResult> {
    return this.restart(false)
  }

  hotRestart(): Promise<ActionResult> {
    return this.restart(true)
  }

  async screenshot(): Promise<ScreenshotResult> {
    const deviceId = this.state.runningDeviceId ?? this.state.deviceId
    if (!deviceId) throw new Error('Select a device first.')
    if (!this.devices.length) await this.listDevices().catch(() => [])
    const device = this.devices.find((d) => d.id === deviceId)

    const dir = screenshotDir()
    mkdirSync(dir, { recursive: true })
    const name = `Flutvio ${safe(this.state.project?.name ?? 'app')} ${safe(device?.name ?? deviceId)} ${timestamp()}.png`
    const path = join(dir, name)
    const t0 = performance.now()

    if (device?.platform.startsWith('ios') && device.emulator) {
      // iOS Simulator: simctl is much faster than `flutter screenshot`.
      await new Promise<void>((resolve, reject) =>
        execFile('xcrun', ['simctl', 'io', deviceId, 'screenshot', path], (err) =>
          err ? reject(new Error(`Simulator screenshot failed: ${err.message}`)) : resolve(),
        ),
      )
    } else if (device && !device.canScreenshot) {
      throw new Error(`${device.name} does not support screenshots.`)
    } else if (this.daemon?.isRunning) {
      await this.daemon.screenshot(path)
    } else {
      throw new Error('Run the app first to take a screenshot of this device.')
    }
    return { path, durationMs: Math.round(performance.now() - t0) }
  }

  async stop(): Promise<void> {
    if (!this.daemon) return
    this.setStatus('stopping')
    await this.daemon.stop()
  }

  dispose(): void {
    void this.daemon?.stop()
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async restart(full: boolean): Promise<ActionResult> {
    const daemon = this.daemon
    if (!daemon || this.state.status !== 'running') {
      const why: Partial<Record<FlutterStatus, string>> = {
        launching: 'The app is still launching…',
        reloading: 'A hot reload is already in progress.',
        restarting: 'A hot restart is already in progress.',
        stopping: 'The app is stopping.',
      }
      throw new Error(why[this.state.status] ?? 'Run the app first.')
    }
    this.setStatus(full ? 'restarting' : 'reloading')
    const t0 = performance.now()
    try {
      await (full ? daemon.hotRestart() : daemon.hotReload())
      return { durationMs: Math.round(performance.now() - t0) }
    } finally {
      if (this.daemon === daemon) this.setStatus('running')
    }
  }

  private setStatus(status: FlutterStatus): void {
    this.state.status = status
    this.publishState()
  }

  private publishState(): void {
    this.emit({ type: 'state', state: this.getState() })
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

/** Registers `flutter:*` IPC handlers for one window. Returns the service. */
export function registerFlutterIPC(win: BrowserWindow): FlutterService {
  const service = new FlutterService((event) => {
    if (!win.isDestroyed()) win.webContents.send('flutter:event', event)
  })

  const handlers: Record<string, (...args: never[]) => unknown> = {
    'flutter:getState': () => service.getState(),
    'flutter:listDevices': () => service.listDevices(),
    'flutter:pickProject': () => service.pickProject(win),
    'flutter:setProject': (path: string) => service.setProject(path),
    'flutter:selectDevice': (id: string) => service.selectDevice(id),
    'flutter:run': () => service.run(),
    'flutter:hotReload': () => service.hotReload(),
    'flutter:hotRestart': () => service.hotRestart(),
    'flutter:screenshot': () => service.screenshot(),
    'flutter:stop': () => service.stop(),
    'flutter:revealFile': (path: string) => {
      // Only reveal real image files (screenshots), nothing arbitrary.
      if (typeof path === 'string' && path.endsWith('.png') && existsSync(path)) shell.showItemInFolder(path)
    },
  }
  for (const [channel, fn] of Object.entries(handlers)) {
    // Re-registering is safe: macOS can re-create the window after all were closed.
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_e, ...args) => fn(...(args as never[])))
  }

  const dispose = (): void => service.dispose()
  win.on('closed', dispose)
  app.once('before-quit', dispose)
  return service
}
