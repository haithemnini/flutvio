/**
 * AgentSessions.tsx — past coding-agent sessions recorded for this project (whatever agents left
 * history on this machine: Claude Code, OpenCode, Codex, Gemini). Grouped by day, searchable;
 * a click resumes the session in a new terminal tab.
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { AgentId, AgentInfo, AgentSession } from '../../../../shared/flutvio-api'
import { ArrowRightIcon, RefreshIcon, SearchIcon } from '../Icons'

interface Props {
  projectPath: string
  visible: boolean
  /** Opens a terminal tab running `command`. */
  onLaunch: (label: string, command: string) => void
}

const AGENT_COLOR: Record<AgentId, string> = {
  claude: '#d97757',
  opencode: '#f5a742',
  codex: '#10a37f',
  gemini: '#4d8cf5',
}

export function AgentDot({ agent }: { agent: AgentId }): React.JSX.Element {
  return <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: AGENT_COLOR[agent] }} />
}

const DAY = 86_400_000

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function groupOf(ms: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const t = today.getTime()
  if (ms >= t) return 'Today'
  if (ms >= t - DAY) return 'Yesterday'
  if (ms >= t - 7 * DAY) return 'Previous 7 days'
  if (ms >= t - 30 * DAY) return 'Previous 30 days'
  return 'Older'
}

export default function AgentSessions({ projectPath, visible, onLaunch }: Props): React.JSX.Element {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [sessions, setSessions] = useState<AgentSession[] | null>(null)
  const [filter, setFilter] = useState<AgentId | 'all'>('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = (): void => {
    setLoading(true)
    setError(null)
    window.flutvio.ai
      .agents(projectPath)
      .then((r) => {
        setAgents(r.agents)
        setSessions(r.sessions)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  // Fresh list every time the tab is shown (sessions are created in the terminal meanwhile).
  useEffect(() => {
    if (visible) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, visible])

  const nameOf = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.name])) as Record<AgentId, string>, [agents])
  const present = useMemo(() => [...new Set(sessions?.map((s) => s.agent))], [sessions])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out: Array<{ name: string; items: AgentSession[] }> = []
    for (const s of sessions ?? []) {
      if (filter !== 'all' && s.agent !== filter) continue
      if (q && !s.title.toLowerCase().includes(q)) continue
      const name = groupOf(s.updatedAt)
      const last = out[out.length - 1]
      if (last?.name === name) last.items.push(s)
      else out.push({ name, items: [s] })
    }
    return out
  }, [sessions, filter, query])

  const total = sessions?.length ?? 0

  return (
    <div className="flex h-full flex-col">
      {/* Search + refresh */}
      <div className="flex flex-shrink-0 items-center gap-1 px-2 pb-1.5 pt-2">
        <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border-default px-2 text-text-tertiary focus-within:border-accent-blue/60">
          <SearchIcon size={11} className="flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions"
            dir="auto"
            className="min-w-0 flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </label>
        <button onClick={load} data-tip="Refresh" className="icon-btn h-7 w-7">
          <RefreshIcon size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter chips: only agents that have sessions here */}
      {present.length > 1 && (
        <div className="flex flex-shrink-0 flex-wrap gap-1 px-2 pb-2">
          {(['all', ...present] as Array<AgentId | 'all'>).map((id) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`flex h-5 items-center gap-1.5 rounded-full border px-2 text-2xs transition-colors ${
                filter === id ? 'border-transparent bg-surface-4 text-text-primary' : 'border-border-default text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {id !== 'all' && <AgentDot agent={id} />}
              {id === 'all' ? `All ${total}` : nameOf[id]}
            </button>
          ))}
        </div>
      )}

      {error && <p className="px-3 text-2xs text-accent-red">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3" data-testid="ai-sessions">
        {sessions && total === 0 && (
          <div className="px-2 pt-6 text-center text-2xs leading-relaxed text-text-tertiary">
            <div className="text-xs text-text-secondary">No sessions yet</div>
            <div className="mt-1">Start any agent in the terminal. Its sessions for this project show up here, ready to resume.</div>
          </div>
        )}
        {sessions && total > 0 && groups.length === 0 && <div className="px-2 pt-4 text-center text-2xs text-text-tertiary">No sessions match.</div>}

        {groups.map((g) => (
          <section key={g.name}>
            <div className="panel-title sticky top-0 z-[1] bg-surface-2 px-2 pb-1 pt-2.5">{g.name}</div>
            {g.items.map((s) => (
              <button
                key={`${s.agent}:${s.id}`}
                onClick={() => onLaunch(s.title, s.resumeCommand)}
                title="Resume in a new terminal"
                data-testid="session-row"
                className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-4"
              >
                <span className="mt-[5px]">
                  <AgentDot agent={s.agent} />
                </span>
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate text-xs text-text-primary">
                    {s.title}
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-text-tertiary">
                    {nameOf[s.agent] ?? s.agent} · {s.messages} {s.messages === 1 ? 'message' : 'messages'} · {ago(s.updatedAt)}
                  </span>
                </span>
                <span className="mt-0.5 flex h-5 flex-shrink-0 items-center gap-1 rounded px-1 text-2xs text-text-secondary opacity-0 group-hover:opacity-100">
                  Resume <ArrowRightIcon size={10} />
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
