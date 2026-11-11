/**
 * scripts/test-agent-bridge.ts — the `flutvio` command: tab titles, command routing, the HTTP
 * bridge (token check) and the real shell script against it.
 * Run: npx tsx scripts/test-agent-bridge.ts
 */

import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runCommand, startAgentBridge, type BridgeFlutter, type BridgeSimulator } from '../src/main/agentBridge'
import { titleFromCommand } from '../src/main/ptyTitle'
import type { FlutterState } from '../src/shared/flutvio-api'

let passed = 0
let failed = 0
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed++
    console.log(`FAIL  ${name}\n      ${(err as Error).message}`)
  }
}
function eq(a: unknown, b: unknown, msg = ''): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

const calls: string[] = []
const state = { status: 'running', project: { name: 'demo', path: '/tmp/demo' }, deviceId: 'DEV', runningDeviceId: 'DEV' } as unknown as FlutterState
const flutter: BridgeFlutter = {
  getState: () => state,
  run: async () => void calls.push('run'),
  stop: async () => void calls.push('stop'),
  hotReload: async () => (calls.push('reload'), { durationMs: 42 }),
  hotRestart: async () => (calls.push('restart'), { durationMs: 300 }),
  screenshot: async () => ({ path: '/tmp/flutter-shot.png' }),
  recentLogs: (n) => ['one', 'two', 'three'].slice(-n),
}
const sim = (udid: string | null): BridgeSimulator => ({
  activeUdid: udid,
  tap: (x, y) => void calls.push(`tap ${x} ${y}`),
  swipe: (a, b, c, d) => void calls.push(`swipe ${a} ${b} ${c} ${d}`),
  button: (b) => void calls.push(`button ${b}`),
  typeText: async (t) => void calls.push(`type ${t}`),
  elements: async () => [{ label: 'Increment', role: 'button', x: 300, y: 700, width: 60, height: 60 }],
})
const shoot = async (udid: string, path: string): Promise<void> => writeFileSync(path, `png:${udid}`)

async function main(): Promise<void> {
  await test('tab title: shells, agents, scripts under node', () => {
    eq(titleFromCommand('-zsh'), 'zsh')
    eq(titleFromCommand('claude --resume abc'), 'claude')
    eq(titleFromCommand('/Users/me/.opencode/bin/opencode'), 'opencode')
    eq(titleFromCommand('node /opt/homebrew/bin/gemini -m pro'), 'gemini')
    eq(titleFromCommand('node --no-warnings /x/node_modules/@openai/codex/bin/codex.js'), 'codex')
    eq(titleFromCommand('node /x/node_modules/@scope/tool/dist/index.js'), 'tool')
    eq(titleFromCommand('python3 -m aider'), 'aider')
    eq(titleFromCommand('node'), 'node')
    eq(titleFromCommand('vim lib/main.dart'), 'vim')
    eq(titleFromCommand('/Users/me/.local/share/claude/versions/2.1.321 --resume x'), 'claude')
    eq(titleFromCommand('claude'), 'claude')
  })

  await test('status, reload, restart, logs', async () => {
    const s = await runCommand(flutter, sim('UDID'), ['status'], '/tmp')
    if (!s.includes('demo') || !s.includes('running') || !s.includes('attached (UDID)')) throw new Error(s)
    eq(await runCommand(flutter, sim('UDID'), ['reload'], '/tmp'), 'reloaded in 42 ms')
    eq(await runCommand(flutter, sim('UDID'), ['restart'], '/tmp'), 'restarted in 300 ms')
    eq(await runCommand(flutter, sim('UDID'), ['logs', '-n', '2'], '/tmp'), 'two\nthree')
  })

  await test('tap / swipe / type / button / elements reach the simulator', async () => {
    calls.length = 0
    await runCommand(flutter, sim('UDID'), ['tap', '200', '400.5'], '/tmp')
    await runCommand(flutter, sim('UDID'), ['swipe', '1', '2', '3', '4'], '/tmp')
    await runCommand(flutter, sim('UDID'), ['type', 'مرحبا', 'world'], '/tmp')
    await runCommand(flutter, sim('UDID'), ['button', 'home'], '/tmp')
    eq(calls, ['tap 200 400.5', 'swipe 1 2 3 4', 'type مرحبا world', 'button HOME'])
    const els = await runCommand(flutter, sim('UDID'), ['elements'], '/tmp')
    if (!/330\s+730\s+button\s+Increment/.test(els)) throw new Error(els)
  })

  await test('clear errors: no simulator, bad numbers, unknown command', async () => {
    const fails = async (argv: string[], s: BridgeSimulator, part: string): Promise<void> => {
      try {
        await runCommand(flutter, s, argv, '/tmp')
      } catch (e) {
        if (!(e as Error).message.includes(part)) throw new Error(`"${(e as Error).message}" lacks "${part}"`)
        return
      }
      throw new Error(`${argv.join(' ')} did not fail`)
    }
    await fails(['tap', '1', '2'], sim(null), 'No simulator is attached')
    await fails(['tap', 'x', '2'], sim('U'), 'must be a number')
    await fails(['fly'], sim('U'), 'Unknown command')
  })

  await test('screenshot: relative path resolves against the caller folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flutvio-bridge-'))
    const out = await runCommand(flutter, sim('UDID'), ['screenshot', 'shots/a.png'], dir, shoot)
    eq(out, join(dir, 'shots/a.png'))
    if (!existsSync(out)) throw new Error('file not written')
    const auto = await runCommand(flutter, sim('UDID'), ['screenshot'], dir, shoot)
    if (!auto.endsWith('.png') || !existsSync(auto)) throw new Error(auto)
    eq(await runCommand(flutter, sim(null), ['screenshot'], dir, shoot), '/tmp/flutter-shot.png', 'falls back to Flutter:')
    rmSync(dir, { recursive: true, force: true })
  })

  const bridge = await startAgentBridge(flutter, sim('UDID'), resolve('resources/bin'))
  const post = (token: string, body: string): Promise<Response> =>
    fetch(`http://127.0.0.1:${bridge.port}/cmd`, { method: 'POST', headers: { 'x-flutvio-token': token }, body })

  await test('http: wrong or missing token is refused', async () => {
    eq((await post('nope', 'a=status')).status, 403)
    eq((await post('', 'a=status')).status, 403)
    eq((await post(bridge.token, 'a=reload')).status, 200)
    eq((await post(bridge.token, 'a=fly')).status, 400)
  })

  const cli = resolve('resources/bin/flutvio')
  const env = { ...process.env, ...bridge.env }
  // The server lives in this process, so the CLI must run asynchronously.
  const run = (args: string[]): Promise<{ status: number; out: string; err: string }> =>
    new Promise((ok) => execFile(cli, args, { env, encoding: 'utf8' }, (e, out, err) => ok({ status: e ? Number((e as { code?: number }).code ?? 1) : 0, out, err })))
  await test('cli: runs commands, keeps arguments with spaces, exit codes', async () => {
    calls.length = 0
    eq((await run(['reload'])).out.trim(), 'reloaded in 42 ms')
    await run(['type', 'hello  "big" world', '&x=1'])
    eq(calls, ['reload', 'type hello  "big" world &x=1'])
    const bad = await run(['fly'])
    eq(bad.status, 1)
    if (!bad.err.includes('Unknown command')) throw new Error(bad.err)
    if (!(await run([])).out.includes('flutvio screenshot')) throw new Error('no help')
  })

  await test('cli: outside a Flutvio terminal it explains itself', () => {
    const clean = { ...process.env }
    delete clean.FLUTVIO_PORT
    delete clean.FLUTVIO_TOKEN
    const r = spawnSync(cli, ['status'], { env: clean, encoding: 'utf8' })
    eq(r.status, 2)
    if (!r.stderr.includes('only works inside a Flutvio terminal')) throw new Error(r.stderr)
  })

  bridge.close()
  console.log(`${passed}/${passed + failed} passed`)
  process.exit(failed ? 1 : 0)
}
void main()
