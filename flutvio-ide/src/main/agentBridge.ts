/**
 * src/main/agentBridge.ts
 * Flutvio — the bridge behind the `flutvio` command that every Flutvio terminal has on PATH.
 *
 * Any coding agent (or person) in the terminal can see and drive the simulator and the running
 * Flutter app: `flutvio screenshot`, `flutvio tap 200 400`, `flutvio reload`, `flutvio logs` …
 *
 * A tiny HTTP server on 127.0.0.1 (random port) with a random per-launch token; both reach the
 * shells through the environment (FLUTVIO_PORT / FLUTVIO_TOKEN), so only Flutvio's own terminals
 * can call it. No Electron imports here — the services are injected (unit-testable).
 */

import { execFile } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { FlutterState, SimButton, SimElement } from '../shared/flutvio-api'

/** The parts of FlutterService the bridge uses. */
export interface BridgeFlutter {
  getState(): FlutterState
  run(): Promise<void>
  stop(): Promise<void>
  hotReload(): Promise<{ durationMs: number }>
  hotRestart(): Promise<{ durationMs: number }>
  screenshot(): Promise<{ path: string }>
  recentLogs(n: number): string[]
}

/** The parts of SimulatorBridge the bridge uses. */
export interface BridgeSimulator {
  readonly activeUdid: string | null
  tap(x: number, y: number): void
  swipe(x1: number, y1: number, x2: number, y2: number): void
  button(name: SimButton): void
  typeText(text: string): Promise<void>
  elements(): Promise<SimElement[]>
}

export interface AgentBridge {
  port: number
  token: string
  /** Environment for terminals. */
  env: Record<string, string>
  close(): void
}

export const HELP = `flutvio — see and drive the simulator and the running Flutter app from this terminal

  flutvio status                     project, device, app state, simulator
  flutvio screenshot [file.png]      save what the simulator shows; prints the file path
  flutvio elements                   on-screen elements with their tap points (x y in points)
  flutvio tap <x> <y>                tap at a point (points, as printed by "elements")
  flutvio swipe <x1> <y1> <x2> <y2>  swipe / scroll
  flutvio type <text>                type into the focused field
  flutvio button <home|lock|siri>    press a hardware button
  flutvio run | stop                 start / stop the Flutter app on the selected device
  flutvio reload | restart           hot reload / hot restart the running app
  flutvio logs [-n <lines>]          recent Flutter output (default 80 lines)

Typical loop: edit code → flutvio reload → flutvio screenshot → look at the image.`

const NO_SIM = 'No simulator is attached. Show the Simulator in Flutvio (View › Simulator) and pick a device first.'
const BUTTONS: Record<string, SimButton> = { home: 'HOME', lock: 'LOCK', siri: 'SIRI', side: 'SIDE_BUTTON' }

function num(v: string | undefined, name: string): number {
  const n = Number(v)
  if (v === undefined || v === '' || !Number.isFinite(n)) throw new Error(`${name} must be a number. See: flutvio help`)
  return n
}

const simctlShot = (udid: string, path: string): Promise<void> =>
  new Promise((ok, fail) =>
    execFile('xcrun', ['simctl', 'io', udid, 'screenshot', path], { timeout: 20_000 }, (err) =>
      err ? fail(new Error(`Screenshot failed: ${err.message.split('\n')[0]}`)) : ok(),
    ),
  )

/** Runs one command; returns the text to print. Exported for tests. */
export async function runCommand(
  flutter: BridgeFlutter,
  sim: BridgeSimulator,
  argv: string[],
  cwd: string,
  shoot: (udid: string, path: string) => Promise<void> = simctlShot,
): Promise<string> {
  const [cmd = 'help', ...args] = argv
  const needSim = (): void => {
    if (!sim.activeUdid) throw new Error(NO_SIM)
  }
  switch (cmd) {
    case 'help':
    case '--help':
    case '-h':
      return HELP
    case 'status': {
      const s = flutter.getState()
      return [
        `project:   ${s.project ? `${s.project.name}  (${s.project.path})` : 'none'}`,
        `app:       ${s.status}`,
        `device:    ${s.runningDeviceId ?? s.deviceId ?? 'none selected'}`,
        `simulator: ${sim.activeUdid ? `attached (${sim.activeUdid})` : 'not attached'}`,
      ].join('\n')
    }
    case 'screenshot': {
      const udid = sim.activeUdid
      if (!udid) return (await flutter.screenshot()).path
      const target = args[0]
        ? isAbsolute(args[0])
          ? args[0]
          : resolve(cwd, args[0])
        : join(tmpdir(), 'flutvio', `shot-${Date.now()}.png`)
      mkdirSync(dirname(target), { recursive: true })
      await shoot(udid, target)
      return target
    }
    case 'elements': {
      needSim()
      const els = await sim.elements()
      if (!els.length) return 'No accessibility elements on screen.'
      return els
        .map((e) => `${String(Math.round(e.x + e.width / 2)).padStart(4)} ${String(Math.round(e.y + e.height / 2)).padStart(4)}  ${e.role}  ${e.label}`)
        .join('\n')
    }
    case 'tap':
      needSim()
      sim.tap(num(args[0], 'x'), num(args[1], 'y'))
      return 'tapped'
    case 'swipe':
      needSim()
      sim.swipe(num(args[0], 'x1'), num(args[1], 'y1'), num(args[2], 'x2'), num(args[3], 'y2'))
      return 'swiped'
    case 'type':
      needSim()
      if (!args.length) throw new Error('Nothing to type. Usage: flutvio type <text>')
      await sim.typeText(args.join(' '))
      return 'typed'
    case 'button': {
      needSim()
      const b = BUTTONS[(args[0] ?? '').toLowerCase()]
      if (!b) throw new Error('Unknown button. Use: home, lock or siri')
      sim.button(b)
      return 'pressed'
    }
    case 'run':
      await flutter.run()
      return 'launching — check progress with: flutvio status'
    case 'stop':
      await flutter.stop()
      return 'stopped'
    case 'reload':
      return `reloaded in ${(await flutter.hotReload()).durationMs} ms`
    case 'restart':
      return `restarted in ${(await flutter.hotRestart()).durationMs} ms`
    case 'logs': {
      const i = args.indexOf('-n')
      const n = i >= 0 ? Math.max(1, Math.min(500, Math.round(num(args[i + 1], 'lines')))) : 80
      return flutter.recentLogs(n).join('\n') || 'No Flutter output yet.'
    }
    default:
      throw new Error(`Unknown command "${cmd}". See: flutvio help`)
  }
}

export function startAgentBridge(flutter: BridgeFlutter, sim: BridgeSimulator, binDir: string): Promise<AgentBridge> {
  const token = randomBytes(24).toString('hex')
  const expected = Buffer.from(token)

  const server: Server = createServer((req, res) => {
    const reply = (code: number, body: string): void => {
      res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(body)
    }
    const given = Buffer.from(String(req.headers['x-flutvio-token'] ?? ''))
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return reply(403, 'forbidden')
    if (req.method !== 'POST' || req.url !== '/cmd') return reply(404, 'not found')

    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      const form = new URLSearchParams(body)
      runCommand(flutter, sim, form.getAll('a'), form.get('cwd') || process.cwd()).then(
        (text) => reply(200, text),
        (err: Error) => reply(400, err.message),
      )
    })
  })

  return new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      ok({
        port,
        token,
        env: { FLUTVIO_PORT: String(port), FLUTVIO_TOKEN: token, FLUTVIO_BIN: binDir },
        close: () => server.close(),
      })
    })
  })
}

/** Short section for a project's AGENTS.md so agents know the command exists. */
export const AGENTS_MD_SECTION = `## Flutvio (simulator + running app)

This project is open in Flutvio. In its terminal the \`flutvio\` command lets you see and drive the
iOS Simulator and the running Flutter app:

- \`flutvio status\` — app state and device
- \`flutvio reload\` / \`flutvio restart\` — hot reload / hot restart after editing Dart code
- \`flutvio screenshot [file.png]\` — saves what the simulator shows and prints the path; read the image to check the UI
- \`flutvio elements\` — on-screen elements with tap points; \`flutvio tap <x> <y>\`, \`flutvio swipe\`, \`flutvio type <text>\`
- \`flutvio logs\` — recent Flutter output (errors, prints)

After a UI change: \`flutvio reload\`, then \`flutvio screenshot\` and look at the result.
`
