/**
 * scripts/test-flutter-daemon.ts
 * Integration test: FlutterDaemon against a fake `flutter` CLI (test-fixtures/bin/flutter).
 * Verifies device listing, JSON-RPC framing, hot reload/restart, screenshot and stop.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FlutterDaemon } from '../src/main/flutterDaemon'

const fixtureBin = path.resolve(__dirname, '../test-fixtures/bin')
process.env.PATH = `${fixtureBin}${path.delimiter}${process.env.PATH ?? ''}`
const logFile = path.join(os.tmpdir(), `flutvio-daemon-${process.pid}.log`)
process.env.FAKE_FLUTTER_LOG = logFile
const failFlag = path.join(os.tmpdir(), `flutvio-fail-${process.pid}`)
process.env.FAKE_FLUTTER_FAIL_FLAG = failFlag

const results: Array<{ name: string; ok: boolean; err?: string }> = []
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, err: (e as Error).message }) }
}

async function main(): Promise<void> {
  await test('listDevices parses flutter devices --machine', async () => {
    const devices = await FlutterDaemon.listDevices()
    assert.equal(devices.length, 2)
    assert.deepEqual(devices[0], {
      id: 'emu-1', name: 'iPhone 15 Simulator', platform: 'ios', emulator: true,
      sdk: '', supported: true, canHotReload: true, canScreenshot: true,
    })
  })

  const daemon = new FlutterDaemon({ projectPath: os.tmpdir(), deviceId: 'emu-1' })
  const events: string[] = []
  const logs: string[] = []
  daemon.on('app.started', (p) => events.push(`app.started:${p.appId}`))
  daemon.on('app.starting', () => events.push('app.starting'))
  daemon.on('daemon.exit', () => events.push('daemon.exit'))
  daemon.on('app.log', (p) => logs.push(String(p.log)))

  await test('hotReload before start is rejected clearly', async () => {
    await assert.rejects(() => daemon.hotReload(), /not running/)
  })

  await test('start spawns daemon and emits app.started with appId', async () => {
    await daemon.start()
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for app.started')), 5000)
      daemon.once('app.started', () => { clearTimeout(t); resolve() })
    })
    assert.equal(daemon.isRunning, true)
    assert.ok(events.includes('app.started:APP-42'))
  })

  await test('hotReload resolves via app.restart (fullRestart=false)', async () => {
    await daemon.hotReload()
  })

  await test('hotRestart resolves via app.restart (fullRestart=true)', async () => {
    await daemon.hotRestart()
  })

  await test('non-JSON stdout lines (banners) are forwarded as logs', async () => {
    assert.ok(logs.some((l) => l.includes('Launching lib/main.dart')), 'banner line missing from logs')
  })

  await test('compile error on reload (code != 0) rejects with the message', async () => {
    fs.writeFileSync(failFlag, '1')
    await assert.rejects(() => daemon.hotReload(), /Expected a declaration/)
    await daemon.hotReload() // next reload works again
  })

  await test('screenshot writes file via flutter screenshot', async () => {
    const out = path.join(os.tmpdir(), `flutvio-shot-${process.pid}.png`)
    const saved = await daemon.screenshot(out)
    assert.equal(saved, out)
    assert.ok(fs.existsSync(out), 'screenshot file missing')
  })

  await test('wire format: every request line is a single-element array [ {...} ]', async () => {
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n')
    assert.ok(lines.length >= 2, 'expected at least 2 requests on stdin')
    for (const line of lines) {
      assert.ok(line.startsWith('[{'), `bad framing (double-wrapped?): ${line}`)
      const parsed = JSON.parse(line)
      assert.equal(parsed.length, 1)
      assert.equal(typeof parsed[0].id, 'number')
      assert.equal(typeof parsed[0].method, 'string')
    }
    const restart = lines.map((l) => JSON.parse(l)[0]).filter((m) => m.method === 'app.restart')
    assert.equal(restart[0].params.fullRestart, false)
    assert.equal(restart[1].params.fullRestart, true)
    assert.equal(restart[0].params.appId, 'APP-42')
  })

  await test('stop terminates the process and emits daemon.exit', async () => {
    await daemon.stop()
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(daemon.isRunning, false)
    assert.ok(events.includes('daemon.exit'))
  })

  await test('hotReload rejects when daemon is not running', async () => {
    await assert.rejects(() => daemon.hotReload(), /not running/)
  })

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.err ? `\n      -> ${r.err}` : ''}`)
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  process.exit(failed ? 1 : 0)
}

main()
