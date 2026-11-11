/**
 * src/main/agentMonitor.ts
 * Flutvio — what the coding agent in each terminal is doing (IPC: agent:*).
 *
 *  - Activity (working / waiting for you) for every terminal that runs an agent. Claude Code
 *    publishes it in ~/.claude/sessions/<pid>.json; for other agents it is inferred from the
 *    terminal output (ActivityMeter).
 *  - For the terminal the Agent panel follows: context size, model, compactions, usage limit,
 *    read from Claude Code's own session transcript (metadata only — nothing leaves the Mac).
 *  - MCP servers and connectors, as `claude mcp list` reports them.
 *
 * No Electron imports in the parsing code, so it can be unit-tested.
 */

import { execFile } from 'node:child_process'
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentActivity, AgentConnection, AgentMonitorData } from '../shared/flutvio-api'

/** Programs treated as agents (their turns are tracked; other programs are just commands). */
export const AGENT_NAMES = new Set(['claude', 'opencode', 'codex', 'gemini', 'aider', 'cursor-agent', 'amp', 'goose', 'qwen', 'crush'])

// ─── Activity from terminal output (agents without a status file) ─────────────

/**
 * An agent "works" while it keeps printing without the user typing (streaming text, spinners)
 * and is "idle" once it has been quiet for a few seconds. Echo of the user's own typing is ignored.
 */
export class ActivityMeter {
  private lastInput = -Infinity
  private lastOutput = -Infinity
  private burstStart = -Infinity
  working = false

  static readonly ECHO_MS = 1000
  static readonly GAP_MS = 2500
  static readonly START_MS = 2500
  static readonly QUIET_MS = 4000

  input(now: number): void {
    this.lastInput = now
  }

  /** Returns 'working' when a turn is seen to start. */
  output(now: number): AgentActivity | null {
    if (now - this.lastInput < ActivityMeter.ECHO_MS) return null
    if (now - this.lastOutput > ActivityMeter.GAP_MS) this.burstStart = now
    this.lastOutput = now
    if (!this.working && now - this.burstStart >= ActivityMeter.START_MS) {
      this.working = true
      return 'working'
    }
    return null
  }

  /** Returns 'idle' when the turn is seen to end. */
  tick(now: number): AgentActivity | null {
    if (this.working && now - this.lastOutput >= ActivityMeter.QUIET_MS) {
      this.working = false
      return 'idle'
    }
    return null
  }
}

// ─── Claude Code: session transcript ──────────────────────────────────────────

export interface SessionUsage {
  model: string
  contextTokens: number
  /** Largest context seen (decides whether the model has the 1M window). */
  peakTokens: number
  compactions: number
  turns: number
  outputTokens: number
  toolsUsed: Set<string>
  limit: { type: string; resetsAt: number } | null
}

export function emptyUsage(): SessionUsage {
  return { model: '', contextTokens: 0, peakTokens: 0, compactions: 0, turns: 0, outputTokens: 0, toolsUsed: new Set(), limit: null }
}

interface Rec {
  type?: string
  subtype?: string
  isSidechain?: boolean
  isMeta?: boolean
  message?: { model?: string; role?: string; content?: unknown; usage?: Record<string, unknown> }
  compactMetadata?: { preTokens?: number; postTokens?: number }
  quotaLimits?: { status?: string; resetsAt?: number; rateLimitType?: string }
  tools?: string[]
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** `mcp__plugin_dart-flutter_dart-mcp-server__hot_reload` → `plugin_dart-flutter_dart-mcp-server`. */
function serverOfTool(name: string): string | null {
  const m = /^mcp__(.+?)__/.exec(name)
  return m ? m[1] : null
}

/** Folds transcript lines (JSONL) into `u`. Lines that are not JSON are skipped. */
export function foldUsage(u: SessionUsage, lines: string[]): SessionUsage {
  for (const line of lines) {
    if (!line) continue
    let r: Rec
    try {
      r = JSON.parse(line) as Rec
    } catch {
      continue
    }
    if (r.isSidechain) continue // sub-agents have their own context
    if (r.type === 'assistant' && r.message) {
      if (r.quotaLimits?.status === 'rejected' && r.quotaLimits.resetsAt) {
        u.limit = { type: r.quotaLimits.rateLimitType ?? 'usage', resetsAt: r.quotaLimits.resetsAt * 1000 }
        continue
      }
      const usage = r.message.usage
      if (!usage || r.message.model === '<synthetic>') continue
      u.model = r.message.model ?? u.model
      const ctx = n(usage.input_tokens) + n(usage.cache_read_input_tokens) + n(usage.cache_creation_input_tokens)
      if (ctx > 0) {
        u.contextTokens = ctx
        u.peakTokens = Math.max(u.peakTokens, ctx)
        u.limit = null // a request went through, so the limit is over
      }
      u.outputTokens += n(usage.output_tokens)
      if (Array.isArray(r.message.content)) {
        for (const c of r.message.content as Array<{ type?: string; name?: string }>) {
          const s = c?.type === 'tool_use' && c.name ? serverOfTool(c.name) : null
          if (s) u.toolsUsed.add(s)
        }
      }
    } else if (r.type === 'user' && !r.isMeta && r.message) {
      const c = r.message.content
      const isPrompt = typeof c === 'string' ? !c.trimStart().startsWith('<') : Array.isArray(c) && c.some((x: { type?: string }) => x?.type === 'text')
      if (isPrompt) u.turns++
    } else if (r.type === 'system' && r.subtype === 'compact_boundary') {
      u.compactions++
      u.peakTokens = Math.max(u.peakTokens, n(r.compactMetadata?.preTokens))
      if (r.compactMetadata?.postTokens) u.contextTokens = n(r.compactMetadata.postTokens)
    } else if (r.type === 'tools-used' && Array.isArray(r.tools)) {
      for (const t of r.tools) {
        const s = serverOfTool(t)
        if (s) u.toolsUsed.add(s)
      }
    }
  }
  return u
}

/** 200K unless the model id says 1M or the session has already held more than 200K. */
export function contextWindow(model: string, peakTokens: number): number {
  return /\[1m\]|-1m\b/i.test(model) || peakTokens > 200_000 ? 1_000_000 : 200_000
}

/** `claude_pro` → `Pro`, `claude_max` → `Max`, … */
export function planLabel(organizationType: string | undefined): string | undefined {
  if (!organizationType) return undefined
  const t = organizationType.replace(/^claude_/, '')
  const known: Record<string, string> = { pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise', free: 'Free' }
  return known[t] ?? t.replace(/_/g, ' ')
}

// ─── Claude Code: MCP servers and connectors ──────────────────────────────────

/** Parses the text of `claude mcp list`. */
export function parseMcpList(text: string): AgentConnection[] {
  const out: AgentConnection[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const m = /^(.+?):\s(.*)\s-\s([✔✓!✘✗-])\s(.+)$/u.exec(line)
    if (!m) continue
    const [, fullName, , mark, detail] = m
    const source: AgentConnection['source'] = fullName.startsWith('claude.ai ') ? 'connector' : fullName.startsWith('plugin:') ? 'plugin' : 'mcp'
    const name = source === 'connector' ? fullName.slice('claude.ai '.length) : source === 'plugin' ? fullName.split(':').slice(1).join(':') : fullName
    const status: AgentConnection['status'] = mark === '✔' || mark === '✓' ? 'connected' : mark === '!' ? 'needs-auth' : mark === '-' ? 'off' : 'failed'
    out.push({ name, source, status, detail: detail.split(' — ')[0].trim() })
  }
  return out
}

// ─── Reading Claude Code's files ──────────────────────────────────────────────

interface ClaudeSessionFile {
  pid: number
  sessionId: string
  cwd: string
  name?: string
  status?: string
  startedAt?: number
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

/** pid → parent pid, for every process (one `ps` call). */
function processParents(): Promise<Map<number, number>> {
  return new Promise((ok) =>
    execFile('ps', ['-axo', 'pid=,ppid='], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      const map = new Map<number, number>()
      if (!err)
        for (const line of out.split('\n')) {
          const [pid, ppid] = line.trim().split(/\s+/).map(Number)
          if (pid) map.set(pid, ppid)
        }
      ok(map)
    }),
  )
}

function isDescendant(parents: Map<number, number>, pid: number, ancestor: number): boolean {
  for (let p = pid, i = 0; p > 1 && i < 40; p = parents.get(p) ?? 0, i++) if (p === ancestor) return true
  return false
}

function transcriptPath(home: string, s: ClaudeSessionFile): string | null {
  const direct = join(home, '.claude', 'projects', s.cwd.replace(/[/.]/g, '-'), `${s.sessionId}.jsonl`)
  if (existsSync(direct)) return direct
  try {
    for (const dir of readdirSync(join(home, '.claude', 'projects'))) {
      const f = join(home, '.claude', 'projects', dir, `${s.sessionId}.jsonl`)
      if (existsSync(f)) return f
    }
  } catch {
    /* no projects folder */
  }
  return null
}

/** Reads the transcript from where the last read stopped (whole lines only). */
function readNewLines(file: string, from: number): { lines: string[]; offset: number } {
  const size = statSync(file).size
  if (size <= from) return { lines: [], offset: size < from ? 0 : from }
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(size - from)
    readSync(fd, buf, 0, buf.length, from)
    const end = buf.lastIndexOf(0x0a)
    if (end < 0) return { lines: [], offset: from }
    return { lines: buf.subarray(0, end).toString('utf8').split('\n'), offset: from + end + 1 }
  } finally {
    closeSync(fd)
  }
}

// ─── The service ──────────────────────────────────────────────────────────────

/** The parts of PtyManager the monitor uses. */
export interface MonitorTerminals {
  /** Terminal id → foreground program and shell pid, for terminals that run something. */
  running(): Array<{ id: string; title: string; pid: number }>
}

interface Tracked {
  meter: ActivityMeter
  activity: AgentActivity
  /** Claude Code session of this terminal (once found). */
  claude?: { file: string; pid: number }
  transcript?: { sessionId: string; path: string; offset: number; usage: SessionUsage }
}

export class AgentMonitor {
  private tracked = new Map<string, Tracked>()
  private watched: string | null = null
  private timer: NodeJS.Timeout | null = null
  private lastSent = ''
  private mcpCache = new Map<string, { at: number; list: AgentConnection[] }>()
  private busy = false

  constructor(
    private readonly terms: MonitorTerminals,
    private readonly emit: (channel: 'agent:activity' | 'agent:data', ...args: unknown[]) => void,
    private readonly home: string = homedir(),
  ) {}

  /** Terminal output / keyboard input, from PtyManager. */
  output(id: string): void {
    const t = this.tracked.get(id)
    if (!t || t.claude) return
    if (t.meter.output(Date.now())) this.setActivity(id, t, 'working')
  }

  input(id: string): void {
    this.tracked.get(id)?.meter.input(Date.now())
  }

  /** The foreground program of a terminal changed. */
  title(id: string, title: string): void {
    if (AGENT_NAMES.has(title)) {
      if (!this.tracked.has(id)) this.tracked.set(id, { meter: new ActivityMeter(), activity: 'idle' })
      this.start()
    } else this.forget(id)
  }

  forget(id: string): void {
    if (this.tracked.delete(id) && this.watched === id) this.push()
  }

  async watch(id: string | null): Promise<AgentMonitorData | null> {
    this.watched = id
    this.lastSent = ''
    if (!id) return null
    await this.poll()
    return this.snapshot(id)
  }

  private start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), 1500)
    void this.poll()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.tracked.clear()
  }

  private setActivity(id: string, t: Tracked, activity: AgentActivity): void {
    if (t.activity === activity) return
    t.activity = activity
    this.emit('agent:activity', id, activity)
    if (this.watched === id) this.push()
  }

  private async poll(): Promise<void> {
    if (this.busy) return
    if (!this.tracked.size) {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      return
    }
    this.busy = true
    try {
      const running = new Map(this.terms.running().map((r) => [r.id, r]))
      const now = Date.now()
      let parents: Map<number, number> | null = null
      for (const [id, t] of this.tracked) {
        const r = running.get(id)
        if (!r) continue
        if (r.title === 'claude') {
          // Find this terminal's session file once (the claude process is a descendant of its shell).
          if (!t.claude || !existsSync(t.claude.file)) {
            t.claude = undefined
            parents ??= await processParents()
            for (const f of this.sessionFiles()) {
              const s = readJson<ClaudeSessionFile>(f)
              if (s?.pid && parents.has(s.pid) && isDescendant(parents, s.pid, r.pid)) {
                t.claude = { file: f, pid: s.pid }
                break
              }
            }
          }
          const s = t.claude ? readJson<ClaudeSessionFile>(t.claude.file) : null
          if (s) {
            this.setActivity(id, t, s.status === 'busy' ? 'working' : 'idle')
            if (this.watched === id) this.readTranscript(t, s)
            continue
          }
        }
        if (t.meter.tick(now)) this.setActivity(id, t, 'idle')
      }
      if (this.watched) this.push()
    } finally {
      this.busy = false
    }
  }

  private sessionFiles(): string[] {
    const dir = join(this.home, '.claude', 'sessions')
    try {
      return readdirSync(dir)
        .filter((f) => /^\d+\.json$/.test(f))
        .map((f) => join(dir, f))
    } catch {
      return []
    }
  }

  private readTranscript(t: Tracked, s: ClaudeSessionFile): void {
    if (t.transcript?.sessionId !== s.sessionId) {
      const path = transcriptPath(this.home, s)
      if (!path) {
        t.transcript = undefined
        return
      }
      t.transcript = { sessionId: s.sessionId, path, offset: 0, usage: emptyUsage() }
    }
    try {
      const { lines, offset } = readNewLines(t.transcript.path, t.transcript.offset)
      if (offset < t.transcript.offset) t.transcript.usage = emptyUsage() // file was rewritten
      t.transcript.offset = offset
      foldUsage(t.transcript.usage, lines)
    } catch {
      /* transcript not readable right now; next tick */
    }
  }

  private snapshot(id: string): AgentMonitorData | null {
    const t = this.tracked.get(id)
    const r = this.terms.running().find((x) => x.id === id)
    if (!t || !r) return null
    const data: AgentMonitorData = { termId: id, agent: r.title, activity: t.activity }
    const s = t.claude ? readJson<ClaudeSessionFile>(t.claude.file) : null
    if (r.title === 'claude') {
      data.plan = planLabel(readJson<{ oauthAccount?: { organizationType?: string } }>(join(this.home, '.claude.json'))?.oauthAccount?.organizationType)
      if (s) {
        const u = t.transcript?.sessionId === s.sessionId ? t.transcript.usage : emptyUsage()
        data.session = {
          id: s.sessionId,
          name: s.name ?? '',
          model: u.model,
          startedAt: s.startedAt ?? 0,
          contextTokens: u.contextTokens,
          contextWindow: contextWindow(u.model, u.peakTokens),
          compactions: u.compactions,
          turns: u.turns,
          outputTokens: u.outputTokens,
          toolsUsed: [...u.toolsUsed],
          limit: u.limit && u.limit.resetsAt > Date.now() ? u.limit : null,
        }
      }
    }
    return data
  }

  private push(): void {
    if (!this.watched) return
    const data = this.snapshot(this.watched)
    const key = JSON.stringify(data)
    if (key === this.lastSent) return
    this.lastSent = key
    if (data) this.emit('agent:data', data)
  }

  /** `claude mcp list` in `cwd` (cached for a minute: it checks every server's health). */
  connections(cwd: string, refresh: boolean, claudeBin: string): Promise<AgentConnection[]> {
    const hit = this.mcpCache.get(cwd)
    if (hit && !refresh && Date.now() - hit.at < 60_000) return Promise.resolve(hit.list)
    return new Promise((ok, fail) =>
      execFile(claudeBin, ['mcp', 'list'], { cwd, timeout: 45_000, maxBuffer: 2 * 1024 * 1024 }, (err, out, stderr) => {
        if (err && !out) return fail(new Error(`Could not ask Claude Code for its servers: ${(stderr || err.message).split('\n')[0]}`))
        const list = parseMcpList(out)
        this.mcpCache.set(cwd, { at: Date.now(), list })
        ok(list)
      }),
    )
  }
}
