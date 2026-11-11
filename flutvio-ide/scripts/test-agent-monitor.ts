/**
 * scripts/test-agent-monitor.ts — unit tests for the agent monitor's parsing
 * (src/main/agentMonitor.ts): transcript usage, context window, MCP list, activity meter.
 * Run: npx tsx scripts/test-agent-monitor.ts
 */

import assert from 'node:assert/strict'
import { ActivityMeter, contextWindow, emptyUsage, foldUsage, parseMcpList, planLabel } from '../src/main/agentMonitor'

let passed = 0
function test(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const j = (o: unknown): string => JSON.stringify(o)
const assistant = (usage: Record<string, number>, extra: Record<string, unknown> = {}): string =>
  j({ type: 'assistant', message: { model: 'claude-opus-5-5', role: 'assistant', content: [], usage }, ...extra })

console.log('agent monitor')

test('context is the input of the latest request (fresh + cached)', () => {
  const u = foldUsage(emptyUsage(), [
    assistant({ input_tokens: 10, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 500, output_tokens: 200 }),
    assistant({ input_tokens: 2, cache_read_input_tokens: 69_814, cache_creation_input_tokens: 352, output_tokens: 238 }),
  ])
  assert.equal(u.contextTokens, 2 + 69_814 + 352)
  assert.equal(u.outputTokens, 438)
  assert.equal(u.model, 'claude-opus-5-5')
})

test('prompts are counted; tool results and wrappers are not', () => {
  const u = foldUsage(emptyUsage(), [
    j({ type: 'user', message: { role: 'user', content: 'fix the login screen' } }),
    j({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
    j({ type: 'user', message: { role: 'user', content: '<command-name>/model</command-name>' } }),
    j({ type: 'user', isMeta: true, message: { role: 'user', content: 'meta' } }),
    j({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'and the sign-up one' }] } }),
  ])
  assert.equal(u.turns, 2)
})

test('sub-agent records and broken lines are ignored', () => {
  const u = foldUsage(emptyUsage(), ['not json', '', assistant({ input_tokens: 900_000, output_tokens: 1 }, { isSidechain: true }), assistant({ input_tokens: 100, output_tokens: 1 })])
  assert.equal(u.contextTokens, 100)
  assert.equal(u.peakTokens, 100)
})

test('compaction resets the context and remembers the peak', () => {
  const u = foldUsage(emptyUsage(), [
    assistant({ input_tokens: 2, cache_read_input_tokens: 150_000, output_tokens: 1 }),
    j({ type: 'system', subtype: 'compact_boundary', compactMetadata: { preTokens: 441_737, postTokens: 29_132 } }),
  ])
  assert.equal(u.compactions, 1)
  assert.equal(u.contextTokens, 29_132)
  assert.equal(u.peakTokens, 441_737)
  assert.equal(contextWindow(u.model, u.peakTokens), 1_000_000)
})

test('context window: 200K by default, 1M when the model or the session says so', () => {
  assert.equal(contextWindow('claude-sonnet-5-5', 80_000), 200_000)
  assert.equal(contextWindow('claude-sonnet-5-5[1m]', 0), 1_000_000)
  assert.equal(contextWindow('claude-opus-5-5', 200_227), 1_000_000)
})

test('a usage limit is recorded, and cleared by the next request that goes through', () => {
  const limit = j({
    type: 'assistant',
    isApiErrorMessage: true,
    message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: "You've hit your 5-hour limit" }], usage: { input_tokens: 0, output_tokens: 0 } },
    quotaLimits: { status: 'rejected', resetsAt: 1794350400, rateLimitType: 'five_hour' },
  })
  const u = foldUsage(emptyUsage(), [assistant({ input_tokens: 5000, output_tokens: 1 }), limit])
  assert.deepEqual(u.limit, { type: 'five_hour', resetsAt: 1794350400_000 })
  assert.equal(u.contextTokens, 5000, 'the synthetic message does not change the context')
  foldUsage(u, [assistant({ input_tokens: 6000, output_tokens: 1 })])
  assert.equal(u.limit, null)
})

test('MCP servers whose tools were called are collected', () => {
  const u = foldUsage(emptyUsage(), [
    j({ type: 'assistant', message: { model: 'm', content: [{ type: 'tool_use', name: 'mcp__plugin_dart-flutter_dart-mcp-server__hot_reload' }, { type: 'tool_use', name: 'Bash' }], usage: { input_tokens: 1 } } }),
    j({ type: 'tools-used', tools: ['mcp__figma__get_screenshot', 'Read'] }),
  ])
  assert.deepEqual([...u.toolsUsed].sort(), ['figma', 'plugin_dart-flutter_dart-mcp-server'])
})

test('`claude mcp list` output is parsed into servers and connectors', () => {
  const list = parseMcpList(
    [
      'Checking MCP server health…',
      '',
      'claude.ai Figma: https://mcp.figma.com/mcp - ✔ Connected',
      'claude.ai Canva: https://mcp.canva.com/mcp - ! Needs authentication',
      'plugin:firebase:firebase: npx -y firebase-tools@latest mcp - ✔ Connected',
      'plugin:data:snowflake:  (HTTP) - - Not configured',
      'plugin:data:definite: https://api.definite.app (HTTP) - ✘ Failed to connect — MCP endpoint not found at https://api.definite.app',
      'my-server: node /x/server.js - ✓ Connected',
    ].join('\n'),
  )
  assert.equal(list.length, 6)
  assert.deepEqual(list[0], { name: 'Figma', source: 'connector', status: 'connected', detail: 'Connected' })
  assert.deepEqual(list[1], { name: 'Canva', source: 'connector', status: 'needs-auth', detail: 'Needs authentication' })
  assert.deepEqual(list[2], { name: 'firebase:firebase', source: 'plugin', status: 'connected', detail: 'Connected' })
  assert.equal(list[3].status, 'off')
  assert.deepEqual(list[4], { name: 'data:definite', source: 'plugin', status: 'failed', detail: 'Failed to connect' })
  assert.deepEqual(list[5], { name: 'my-server', source: 'mcp', status: 'connected', detail: 'Connected' })
})

test('plan label', () => {
  assert.equal(planLabel('claude_pro'), 'Pro')
  assert.equal(planLabel('claude_max'), 'Max')
  assert.equal(planLabel(undefined), undefined)
})

test('activity: sustained output without typing is a turn; quiet ends it', () => {
  const m = new ActivityMeter()
  let t = 10_000
  m.input(t) // Enter
  assert.equal(m.output(t + 100), null, 'echo of the keys')
  // The agent streams for 5 s.
  let started = false
  for (t += 1200; t < 16_500; t += 200) if (m.output(t) === 'working') started = true
  assert.ok(started && m.working)
  assert.equal(m.tick(t + 1000), null, 'a short pause is not the end')
  assert.equal(m.tick(t + 4200), 'idle')
  assert.equal(m.working, false)
})

test('activity: typing a long prompt is not a turn', () => {
  const m = new ActivityMeter()
  for (let t = 0; t < 20_000; t += 150) {
    m.input(t)
    assert.equal(m.output(t + 5), null)
  }
  assert.equal(m.working, false)
})

test('activity: a single redraw (resize, one line) is not a turn', () => {
  const m = new ActivityMeter()
  assert.equal(m.output(50_000), null)
  assert.equal(m.output(50_300), null)
  assert.equal(m.tick(60_000), null)
  assert.equal(m.working, false)
})

console.log(`\n${passed} passed`)
