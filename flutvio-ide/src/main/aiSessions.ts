/**
 * src/main/aiSessions.ts
 * Flutvio — coding-agent sessions for a project (IPC: ai:*).
 *
 * Each provider reads the agent's own local history (metadata only: title, time, count —
 * transcripts are never sent anywhere) and knows the shell command to resume / start one:
 *
 *   Claude Code  ~/.claude/projects/<path with / and . → ->/<id>.jsonl      claude --resume <id>
 *   OpenCode     `opencode session list --format json` (run in the project)  opencode --session <id>
 *   Gemini CLI   ~/.gemini/projects.json → ~/.gemini/tmp/<name>/chats/*.jsonl gemini --resume <id>
 *   Codex CLI    ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl (cwd = project) codex resume <id>
 */

import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentId, AgentInfo, AgentSession, AgentsResult } from '../shared/flutvio-api'

const MAX_SESSIONS = 40
const MAX_TITLE = 90

const AGENTS: Array<{ id: AgentId; name: string; bin: string; extraPaths: string[] }> = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', extraPaths: [join(homedir(), '.local/bin/claude'), join(homedir(), '.claude/local/claude')] },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode', extraPaths: [join(homedir(), '.opencode/bin/opencode')] },
  { id: 'codex', name: 'Codex', bin: 'codex', extraPaths: [] },
  { id: 'gemini', name: 'Gemini', bin: 'gemini', extraPaths: [] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c && typeof c === 'object') {
        const t = (c as { text?: unknown }).text
        if (typeof t === 'string' && t.trim()) return t
      }
    }
  }
  return ''
}

/** A human prompt (not a wrapper such as <command-name> or <session_context>). */
function isPrompt(text: string): boolean {
  const t = text.trim()
  return Boolean(t) && !t.startsWith('<')
}

function readLines(file: string): string[] {
  try {
    return readFileSync(file, 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function parse<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T
  } catch {
    return null
  }
}

let shellPath: Promise<string> | null = null
/** PATH of the user's login shell (apps opened from Finder don't inherit it). */
function loginPath(): Promise<string> {
  shellPath ??= new Promise((resolve) => {
    execFile(process.env.SHELL || '/bin/zsh', ['-lc', 'echo $PATH'], { timeout: 5000 }, (err, out) =>
      resolve(err ? process.env.PATH ?? '' : out.trim()),
    )
  })
  return shellPath
}

async function installed(bin: string, extra: string[]): Promise<boolean> {
  const dirs = (await loginPath()).split(':')
  return [...dirs.map((d) => join(d, bin)), ...extra].some((p) => existsSync(p))
}

function run(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) =>
    execFile(cmd, args, { cwd, timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => resolve(err ? '' : out)),
  )
}

// ─── Claude Code ──────────────────────────────────────────────────────────────

/** `/Users/me/app` → `-Users-me-app` (how Claude Code names project folders). */
export function claudeProjectDir(projectPath: string): string {
  return join(homedir(), '.claude', 'projects', projectPath.replace(/[/.]/g, '-'))
}

function claudeSessions(projectPath: string): AgentSession[] {
  const dir = claudeProjectDir(projectPath)
  if (!existsSync(dir)) return []
  const out: AgentSession[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue
    const id = name.slice(0, -'.jsonl'.length)
    const file = join(dir, name)
    let title = ''
    let messages = 0
    let updatedAt = statSync(file).mtimeMs
    for (const line of readLines(file)) {
      const rec = parse<{ type?: string; message?: { content?: unknown }; timestamp?: string; isMeta?: boolean }>(line)
      if (!rec) continue
      if (rec.type === 'user' || rec.type === 'assistant') messages++
      if (rec.type === 'user' && !title && !rec.isMeta) {
        const text = textOf(rec.message?.content)
        if (isPrompt(text)) title = clean(text)
      }
      const t = rec.timestamp ? Date.parse(rec.timestamp) : NaN
      if (!Number.isNaN(t)) updatedAt = Math.max(updatedAt, t)
    }
    const custom = join(dir, id, 'custom-title.json')
    if (existsSync(custom)) {
      const t = parse<{ customTitle?: string; title?: string }>(readFileSync(custom, 'utf8'))
      title = t?.customTitle || t?.title || title
    }
    if (!messages) continue
    out.push({ agent: 'claude', id, title: title || 'Untitled session', updatedAt, messages, resumeCommand: `claude --resume ${id}` })
  }
  return out
}

// ─── OpenCode ─────────────────────────────────────────────────────────────────

async function opencodeSessions(projectPath: string, bin: string): Promise<AgentSession[]> {
  const raw = await run(bin, ['session', 'list', '--format', 'json', '-n', String(MAX_SESSIONS)], projectPath)
  const list = parse<Array<Record<string, unknown>>>(raw.trim() || '[]') ?? []
  return list
    .filter((s) => typeof s.id === 'string')
    .filter((s) => !s.directory || s.directory === projectPath)
    .map((s) => {
      const time = s.time as { updated?: number; created?: number } | undefined
      const updated = Number(time?.updated ?? s.updated ?? s.updatedAt ?? time?.created ?? 0)
      return {
        agent: 'opencode' as const,
        id: s.id as string,
        title: clean(String(s.title ?? '')) || 'Untitled session',
        updatedAt: updated < 1e12 ? updated * 1000 : updated,
        messages: Number(s.messages ?? s.messageCount ?? 0),
        resumeCommand: `opencode --session ${s.id as string}`,
      }
    })
}

// ─── Gemini CLI ───────────────────────────────────────────────────────────────

function geminiSessions(projectPath: string): AgentSession[] {
  const projects = parse<{ projects?: Record<string, string> }>(
    existsSync(join(homedir(), '.gemini/projects.json')) ? readFileSync(join(homedir(), '.gemini/projects.json'), 'utf8') : '{}',
  )
  const name = projects?.projects?.[projectPath]
  if (!name) return []
  const dir = join(homedir(), '.gemini/tmp', name, 'chats')
  if (!existsSync(dir)) return []
  const out: AgentSession[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.jsonl') && !file.endsWith('.json')) continue
    const lines = readLines(join(dir, file))
    const head = parse<{ sessionId?: string; lastUpdated?: string; startTime?: string }>(lines[0] ?? '')
    if (!head?.sessionId) continue
    let title = ''
    let messages = 0
    for (const line of lines.slice(1)) {
      const rec = parse<{ $set?: { messages?: Array<{ type?: string; content?: unknown }> }; type?: string; content?: unknown }>(line)
      const msgs = rec?.$set?.messages ?? (rec?.type ? [rec] : [])
      for (const m of msgs) {
        if (m.type === 'user' || m.type === 'gemini' || m.type === 'model') messages++
        if (m.type === 'user' && !title) {
          const t = textOf(m.content)
          if (isPrompt(t)) title = clean(t)
        }
      }
    }
    if (!title) continue // only the setup context, nothing asked yet
    out.push({
      agent: 'gemini',
      id: head.sessionId,
      title,
      updatedAt: Date.parse(head.lastUpdated ?? head.startTime ?? '') || statSync(join(dir, file)).mtimeMs,
      messages,
      resumeCommand: `gemini --resume ${head.sessionId}`,
    })
  }
  return out
}

// ─── Codex CLI ────────────────────────────────────────────────────────────────

function codexSessions(projectPath: string): AgentSession[] {
  const root = join(homedir(), '.codex/sessions')
  if (!existsSync(root)) return []
  const files: string[] = []
  const walk = (d: string, depth: number): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (depth < 3 && statSync(p).isDirectory()) walk(p, depth + 1)
      else if (n.endsWith('.jsonl')) files.push(p)
    }
  }
  walk(root, 0)
  const out: AgentSession[] = []
  for (const file of files.sort().reverse().slice(0, 400)) {
    const lines = readLines(file)
    const meta = parse<{ type?: string; payload?: { id?: string; cwd?: string; timestamp?: string } }>(lines[0] ?? '')
    const p = meta?.payload
    if (!p?.id || p.cwd !== projectPath) continue
    let title = ''
    let messages = 0
    for (const line of lines) {
      const rec = parse<{ type?: string; payload?: { type?: string; role?: string; content?: unknown } }>(line)
      if (rec?.payload?.type !== 'message') continue
      messages++
      if (rec.payload.role === 'user' && !title) {
        const t = textOf(rec.payload.content)
        if (isPrompt(t)) title = clean(t)
      }
    }
    out.push({
      agent: 'codex',
      id: p.id,
      title: title || 'Untitled session',
      updatedAt: statSync(file).mtimeMs,
      messages,
      resumeCommand: `codex resume ${p.id}`,
    })
  }
  return out
}

// ─── All ──────────────────────────────────────────────────────────────────────

export async function listAgents(projectPath: string): Promise<AgentsResult> {
  const agents: AgentInfo[] = await Promise.all(
    AGENTS.map(async (a) => ({ id: a.id, name: a.name, installed: await installed(a.bin, a.extraPaths), newCommand: a.bin })),
  )
  const has = (id: AgentId): boolean => agents.find((a) => a.id === id)!.installed
  const opencodeBin = AGENTS[1].extraPaths.find(existsSync) ?? 'opencode'

  const results = await Promise.all([
    Promise.resolve(claudeSessions(projectPath)),
    has('opencode') ? opencodeSessions(projectPath, opencodeBin).catch(() => []) : Promise.resolve([]),
    Promise.resolve(geminiSessions(projectPath)),
    Promise.resolve(codexSessions(projectPath)),
  ])
  const sessions = results
    .flat()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS * 2)
  return { agents, sessions }
}

export function registerAiIPC(): void {
  ipcMain.removeHandler('ai:agents')
  ipcMain.handle('ai:agents', (_e, projectPath: string) => listAgents(projectPath))
}
