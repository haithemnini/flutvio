/**
 * AgentMonitorPanel.tsx — the Agent tab of the side panel: what the agent in the current
 * terminal is doing. For Claude Code: how full the context is, model, plan, usage limit, and
 * the MCP servers / connectors it has. Everything comes from Claude Code's own local files and
 * `claude mcp list`; other agents show their state only.
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { AgentConnection, AgentMonitorData } from '../../../../shared/flutvio-api'
import { agentName, compactNumber, contextTone, processColor } from '../../lib/agents'
import { ChevronRightIcon, GaugeIcon, RefreshIcon, SpinnerIcon } from '../Icons'

interface Props {
  projectPath: string
  visible: boolean
  /** Live data of the terminal in view (null = no agent there). */
  data: AgentMonitorData | null
  /** Types a line into that terminal (e.g. `/usage`). */
  onSend: (text: string) => void
}

const LIMIT_LABEL: Record<string, string> = { five_hour: '5-hour limit', seven_day: 'Weekly limit', seven_day_opus: 'Weekly Opus limit', seven_day_sonnet: 'Weekly Sonnet limit' }

function until(ms: number): string {
  const min = Math.max(1, Math.round((ms - Date.now()) / 60_000))
  if (min < 60) return `in ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `in ${h} h ${min % 60} min` : `in ${Math.round(h / 24)} days`
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function modelName(id: string): string {
  // claude-opus-4-6 → Opus 4.6 ; claude-sonnet-5-5[1m] → Sonnet 5.5
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id)
  if (!m) return id || '—'
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] && m[3].length < 3 ? `.${m[3]}` : ''}`
}

export default function AgentMonitorPanel({ projectPath, visible, data, onSend }: Props): React.JSX.Element {
  const [conns, setConns] = useState<AgentConnection[] | null>(null)
  const [connError, setConnError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [, setTick] = useState(0)

  const load = useCallback(
    (refresh: boolean) => {
      setLoading(true)
      setConnError(null)
      window.flutvio.agent
        .connections(projectPath, refresh)
        .then(setConns)
        .catch((e: Error) => setConnError(e.message))
        .finally(() => setLoading(false))
    },
    [projectPath],
  )

  // Asked once per project, the first time the tab is shown (it checks every server, ~10 s).
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  useEffect(() => {
    if (!visible || loadedFor === projectPath) return
    setLoadedFor(projectPath)
    setConns(null)
    load(false)
  }, [visible, projectPath, loadedFor, load])

  // Keeps "resets in …" current.
  const limit = data?.session?.limit
  useEffect(() => {
    if (!visible || !limit) return
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [visible, limit])

  const s = data?.session
  const percent = s && s.contextWindow ? Math.min(100, Math.round((s.contextTokens / s.contextWindow) * 100)) : 0
  const tone = contextTone(percent)
  const used = new Set(s?.toolsUsed ?? [])
  const wasUsed = (c: AgentConnection): boolean =>
    c.source !== 'connector' && [...used].some((u) => u === c.name || u === `plugin_${c.name.replace(/:/g, '_')}` || u.endsWith(`_${c.name.split(':').pop()}`))

  const connectors = conns?.filter((c) => c.source === 'connector') ?? []
  const servers = conns?.filter((c) => c.source !== 'connector') ?? []

  return (
    <div className="h-full overflow-y-auto text-xs" data-testid="agent-panel">
      {!data ? (
        <div className="px-4 pb-2 pt-8 text-center">
          <GaugeIcon size={20} className="mx-auto text-text-disabled" />
          <p className="mt-2.5 text-text-secondary">No agent in this terminal</p>
          <p className="mx-auto mt-1 max-w-[240px] text-2xs leading-relaxed text-text-tertiary">
            Start one in the terminal — <code className="text-text-secondary">claude</code>, <code className="text-text-secondary">opencode</code>,{' '}
            <code className="text-text-secondary">codex</code>, <code className="text-text-secondary">gemini</code> — and its context and state show here.
          </p>
        </div>
      ) : (
        <>
          {/* Who, and what it is doing */}
          <div className="flex items-center gap-2 px-3 pb-1 pt-3">
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${data.activity === 'working' ? 'animate-pulseDot' : ''}`} style={{ background: processColor(data.agent) }} />
            <span className="font-medium text-text-primary">{agentName(data.agent)}</span>
            {data.plan && <span className="rounded bg-surface-4 px-1.5 py-px text-[10px] font-medium text-text-secondary">{data.plan}</span>}
            <span className={`ml-auto flex items-center gap-1.5 text-2xs ${data.activity === 'working' ? 'text-accent-orange' : 'text-text-tertiary'}`} data-testid="agent-activity" data-activity={data.activity}>
              {data.activity === 'working' ? (
                <>
                  <SpinnerIcon size={10} /> Working
                </>
              ) : (
                'Waiting for you'
              )}
            </span>
          </div>
          {s?.name && (
            <div dir="auto" className="truncate px-3 text-2xs text-text-tertiary" title={s.name}>
              {s.name}
            </div>
          )}

          {/* Usage limit in force */}
          {limit && (
            <div className="mx-3 mt-3 rounded-lg border border-accent-red/40 bg-accent-red/[0.07] px-3 py-2" data-testid="agent-limit">
              <div className="font-medium text-accent-red">{LIMIT_LABEL[limit.type] ?? 'Usage limit'} reached</div>
              <div className="mt-0.5 text-2xs text-text-secondary">
                Resets at {clock(limit.resetsAt)} ({until(limit.resetsAt)})
              </div>
            </div>
          )}

          {s ? (
            <>
              {/* Context */}
              <Section title="Context">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[22px] font-semibold leading-none tracking-tight ${s.contextTokens ? tone.text : 'text-text-tertiary'}`} data-testid="agent-context">
                    {s.contextTokens ? `${percent}%` : '—'}
                  </span>
                  <span className="text-2xs text-text-tertiary">
                    {s.contextTokens ? `${compactNumber(s.contextTokens)} of ${compactNumber(s.contextWindow)} tokens` : 'no request yet'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-4">
                  <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${Math.max(s.contextTokens ? 2 : 0, percent)}%` }} />
                </div>
                <p className="mt-1.5 text-2xs leading-relaxed text-text-tertiary">
                  {percent >= 85
                    ? 'Almost full — the conversation will be compacted soon. /compact or /clear frees it.'
                    : s.compactions
                      ? `Compacted ${s.compactions} time${s.compactions === 1 ? '' : 's'} in this session.`
                      : 'When it fills up, older messages are summarised (compacted).'}
                </p>
              </Section>

              <Section title="Session">
                <Row label="Model" value={modelName(s.model)} />
                <Row label="Prompts" value={String(s.turns)} />
                <Row label="Output" value={`${compactNumber(s.outputTokens)} tokens`} />
                {s.startedAt > 0 && <Row label="Started" value={clock(s.startedAt)} />}
              </Section>

              <Section title="Ask Claude Code">
                <p className="mb-2 text-2xs leading-relaxed text-text-tertiary">
                  How much of the 5-hour and weekly limits is used is only shown by Claude Code itself:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {['/usage', '/context', '/mcp'].map((cmd) => (
                    <button
                      key={cmd}
                      disabled={data.activity === 'working'}
                      onClick={() => onSend(cmd)}
                      data-tip={data.activity === 'working' ? 'Wait until it finishes' : `Type ${cmd} in the terminal`}
                      data-tip-pos="top"
                      className="rounded-md border border-border-default px-2 py-1 font-mono text-2xs text-text-secondary hover:bg-surface-4 hover:text-text-primary disabled:opacity-40"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <p className="px-3 pt-3 text-2xs leading-relaxed text-text-tertiary">
              {data.agent === 'claude'
                ? 'Reading the session…'
                : `Context and usage are read from Claude Code's session files; ${agentName(data.agent)} does not publish them, so only its state is shown.`}
            </p>
          )}
        </>
      )}

      {/* MCP servers and connectors (Claude Code) */}
      <div className="mt-4 border-t border-border-subtle">
        <div className="flex h-8 items-center pl-3 pr-1.5">
          <span className="panel-title">Claude Code connections</span>
          <button onClick={() => load(true)} disabled={loading} data-tip="Check again" className="icon-btn ml-auto h-5 w-5">
            <RefreshIcon size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {loading && !conns && (
          <div className="flex items-center gap-2 px-3 pb-3 text-2xs text-text-tertiary">
            <SpinnerIcon size={10} /> Checking each server…
          </div>
        )}
        {connError && <p className="px-3 pb-3 text-2xs leading-relaxed text-text-tertiary">{connError}</p>}
        {conns && conns.length === 0 && !connError && <p className="px-3 pb-3 text-2xs text-text-tertiary">No MCP servers or connectors are set up.</p>}
        {servers.length > 0 && <ConnGroup title="MCP servers" items={servers} wasUsed={wasUsed} />}
        {connectors.length > 0 && <ConnGroup title="Connectors" items={connectors} wasUsed={wasUsed} />}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-3 pt-4">
      <div className="panel-title mb-2">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex h-6 items-center">
      <span className="text-text-tertiary">{label}</span>
      <span className="ml-auto truncate pl-3 text-text-secondary">{value}</span>
    </div>
  )
}

const STATUS: Record<AgentConnection['status'], { dot: string; label: string }> = {
  connected: { dot: 'bg-accent-green', label: 'Connected' },
  'needs-auth': { dot: 'bg-accent-orange', label: 'Needs sign-in' },
  failed: { dot: 'bg-accent-red', label: 'Failed' },
  off: { dot: 'bg-text-disabled', label: 'Not set up' },
}

function ConnGroup({ title, items, wasUsed }: { title: string; items: AgentConnection[]; wasUsed: (c: AgentConnection) => boolean }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const ok = items.filter((c) => c.status === 'connected').length
  // Connected first, then the ones that need something, then the rest.
  const order: AgentConnection['status'][] = ['connected', 'needs-auth', 'failed', 'off']
  const sorted = [...items].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.name.localeCompare(b.name))
  return (
    <div className="pb-2" data-testid="agent-connections">
      <button onClick={() => setOpen(!open)} className="flex h-6 w-full items-center gap-1 pl-2 pr-3 text-left text-2xs text-text-secondary hover:text-text-primary">
        <ChevronRightIcon size={10} className={`text-text-tertiary transition-transform ${open ? 'rotate-90' : ''}`} />
        {title}
        <span className="ml-auto text-text-tertiary">
          {ok} of {items.length} connected
        </span>
      </button>
      {open &&
        sorted.map((c) => (
          <div key={`${c.source}:${c.name}`} className="flex h-6 items-center gap-2 pl-[22px] pr-3" title={c.detail}>
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS[c.status].dot}`} />
            <span className={`min-w-0 truncate ${c.status === 'connected' ? 'text-text-secondary' : 'text-text-tertiary'}`}>{c.name}</span>
            {wasUsed(c) && <span className="flex-shrink-0 rounded bg-accent-blue/15 px-1 text-[10px] text-accent-blue">used</span>}
            {c.status !== 'connected' && <span className="ml-auto flex-shrink-0 text-[10.5px] text-text-tertiary">{STATUS[c.status].label}</span>}
          </div>
        ))}
    </div>
  )
}
