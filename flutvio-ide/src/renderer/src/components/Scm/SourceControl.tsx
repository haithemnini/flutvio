/**
 * SourceControl.tsx — the sidebar's Source Control view.
 *
 *  Changes : commit message + Commit (▾ Commit & Push, Amend), staged / unstaged files with
 *            stage / unstage / discard, branch with ahead/behind, fetch · pull · push
 *  Graph   : commit history with branch lanes; a commit expands to its files (click → diff)
 *  PRs     : GitHub pull requests (gh): list, open one, create one
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { GhStatus, PrSummary, ScmCommit, ScmFile, ScmStatus } from '../../../../shared/flutvio-api'
import { layoutGraph, LANE_COLORS, type GraphRow } from '../../lib/graph'
import { tabId, type DiffMode } from '../../lib/virtualTabs'
import Menu from '../Menu'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BranchIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTypeIcon,
  MinusIcon,
  PlusIcon,
  RefreshIcon,
  RestartIcon,
  SpinnerIcon,
} from '../Icons'

interface Props {
  projectPath: string
  /** Opens a file path or a virtual tab id (diff / PR) in the editor. */
  onOpen: (id: string) => void
  /** Number of changed files, for the sidebar badge. */
  onCount?: (n: number) => void
}

type View = 'changes' | 'graph' | 'prs'

const STATUS_COLOR: Record<string, string> = {
  M: 'text-accent-orange',
  A: 'text-accent-green',
  '?': 'text-accent-green',
  D: 'text-accent-red',
  R: 'text-accent-blue',
  C: 'text-accent-blue',
  U: 'text-accent-red',
}

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function SourceControl({ projectPath, onOpen, onCount }: Props): React.JSX.Element {
  const [view, setView] = useState<View>('changes')
  const [st, setSt] = useState<ScmStatus | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scm = window.flutvio.scm

  const refresh = useCallback(() => {
    scm
      .status(projectPath)
      .then((s) => {
        setSt(s)
        onCount?.(s?.files.length ?? 0)
      })
      .catch(() => setSt(null))
  }, [projectPath, scm, onCount])

  // Keep the list fresh while visible (cheap: one `git status`).
  useEffect(() => {
    refresh()
    const t = window.setInterval(refresh, 3000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const run = async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(label)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(null)
      refresh()
    }
  }

  if (st === undefined)
    return (
      <div className="flex items-center gap-2 px-3 pt-2 text-2xs text-text-tertiary">
        <SpinnerIcon size={11} /> Reading repository…
      </div>
    )
  if (st === null)
    return <p className="px-3 pt-2 text-2xs leading-relaxed text-text-tertiary">This project is not in a git repository. Run <code className="kbd">git init</code> in the terminal to start one.</p>

  return (
    <div className="flex h-full flex-col" data-testid="scm">
      {/* Branch + sync */}
      <div className="flex h-7 flex-shrink-0 items-center gap-1 pl-3 pr-1.5">
        <BranchIcon size={11} className="text-text-tertiary" />
        <span className="truncate text-2xs text-text-secondary" data-testid="scm-branch">
          {st.branch || 'detached'}
        </span>
        {(st.ahead > 0 || st.behind > 0) && (
          <span className="font-mono text-[10px] text-text-tertiary">
            {st.behind > 0 && `↓${st.behind}`} {st.ahead > 0 && `↑${st.ahead}`}
          </span>
        )}
        <div className="ml-auto flex items-center">
          <button className="icon-btn h-5 w-5" data-tip="Fetch" disabled={!!busy} onClick={() => void run('fetch', () => scm.fetch(st.root))}>
            {busy === 'fetch' ? <SpinnerIcon size={10} /> : <RefreshIcon size={11} />}
          </button>
          <button className="icon-btn h-5 w-5" data-tip="Pull" disabled={!!busy} onClick={() => void run('pull', () => scm.pull(st.root))}>
            {busy === 'pull' ? <SpinnerIcon size={10} /> : <ArrowDownIcon size={11} />}
          </button>
          <button className="icon-btn h-5 w-5" data-tip="Push" disabled={!!busy} onClick={() => void run('push', () => scm.push(st.root))} data-testid="scm-push">
            {busy === 'push' ? <SpinnerIcon size={10} /> : <ArrowUpIcon size={11} />}
          </button>
        </div>
      </div>

      {/* Views */}
      <div className="flex flex-shrink-0 gap-3 px-3 pb-1.5 text-2xs">
        {(
          [
            ['changes', `Changes${st.files.length ? ` ${st.files.length}` : ''}`],
            ['graph', 'Graph'],
            ['prs', 'Pull requests'],
          ] as Array<[View, string]>
        ).map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} data-testid={`scm-${id}`} className={view === id ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mx-3 mb-1.5 break-words rounded bg-accent-red/10 px-2 py-1 text-2xs text-accent-red" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'changes' && <Changes st={st} busy={busy} run={run} onOpen={onOpen} />}
        {view === 'graph' && <Graph root={st.root} onOpen={onOpen} />}
        {view === 'prs' && <PullRequests root={st.root} branch={st.branch} onOpen={onOpen} />}
      </div>
    </div>
  )
}

// ─── Changes ──────────────────────────────────────────────────────────────────

function Changes({
  st,
  busy,
  run,
  onOpen,
}: {
  st: ScmStatus
  busy: string | null
  run: (label: string, fn: () => Promise<unknown>) => Promise<boolean>
  onOpen: (id: string) => void
}): React.JSX.Element {
  const [message, setMessage] = useState('')
  const scm = window.flutvio.scm
  const staged = st.files.filter((f) => f.index !== '.' && f.index !== '?' && !f.conflict)
  const unstaged = st.files.filter((f) => f.work !== '.' || f.conflict)

  const doCommit = async (opts: { push?: boolean; amend?: boolean } = {}): Promise<void> => {
    const all = staged.length === 0
    if (all && unstaged.length && !window.confirm('Nothing is staged. Stage all changes and commit them?')) return
    const ok = await run('commit', () => scm.commit(st.root, message, { all, amend: opts.amend }))
    if (!ok) return
    setMessage('')
    if (opts.push) await run('push', () => scm.push(st.root))
  }

  const diff = (f: ScmFile, mode: DiffMode): void => onOpen(tabId({ kind: 'diff', root: st.root, path: f.path, mode }))
  const discard = (paths: string[]): void => {
    const what = paths.length === 1 ? paths[0] : `${paths.length} files`
    if (window.confirm(`Discard changes in ${what}? This cannot be undone.`)) void run('discard', () => scm.discard(st.root, paths))
  }

  return (
    <div className="pb-3">
      {/* Commit box */}
      <div className="px-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void doCommit()
            }
          }}
          placeholder={`Message (⌘↵ to commit on "${st.branch || 'HEAD'}")`}
          rows={message.includes('\n') ? 4 : 2}
          dir="auto"
          data-testid="scm-message"
          className="block w-full resize-none rounded-md border border-border-default bg-transparent px-2 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-blue/60"
        />
        <div className="mt-1.5 flex">
          <button
            disabled={!!busy || !message.trim() || st.files.length === 0}
            onClick={() => void doCommit()}
            data-testid="scm-commit"
            className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-l-md bg-accent-blue text-2xs font-medium text-white hover:bg-accent-blue/90 disabled:opacity-40"
          >
            {busy === 'commit' ? <SpinnerIcon size={11} /> : <CheckIcon size={11} />} Commit{staged.length === 0 && st.files.length ? ' all' : ''}
          </button>
          <Menu
            align="right"
            width={170}
            trigger={() => (
              <button disabled={!!busy} className="flex h-7 w-6 items-center justify-center rounded-r-md border-l border-white/20 bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-40">
                <ChevronDownIcon size={11} />
              </button>
            )}
            items={[
              { key: 'cp', label: 'Commit & Push', disabled: !message.trim() || !st.files.length, onSelect: () => void doCommit({ push: true }) },
              { key: 'amend', label: 'Amend last commit', disabled: !st.files.length && !message.trim(), onSelect: () => void doCommit({ amend: true }) },
            ]}
          />
        </div>
      </div>

      {st.files.length === 0 && <p className="px-3 pt-3 text-2xs text-text-tertiary">No changes. Working tree clean.</p>}

      {staged.length > 0 && (
        <Group
          title="Staged"
          count={staged.length}
          actions={
            <button className="icon-btn h-5 w-5" data-tip="Unstage all" onClick={() => void run('unstage', () => scm.unstage(st.root, staged.map((f) => f.path)))}>
              <MinusIcon size={11} />
            </button>
          }
        >
          {staged.map((f) => (
            <FileRow key={`s:${f.path}`} file={f} letter={f.index} onClick={() => diff(f, 'staged')}>
              <button className="icon-btn h-5 w-5" data-tip="Unstage" onClick={() => void run('unstage', () => scm.unstage(st.root, [f.path]))}>
                <MinusIcon size={11} />
              </button>
            </FileRow>
          ))}
        </Group>
      )}

      {unstaged.length > 0 && (
        <Group
          title="Changes"
          count={unstaged.length}
          actions={
            <>
              <button className="icon-btn h-5 w-5" data-tip="Discard all" onClick={() => discard(unstaged.map((f) => f.path))}>
                <RestartIcon size={11} />
              </button>
              <button className="icon-btn h-5 w-5" data-tip="Stage all" onClick={() => void run('stage', () => scm.stage(st.root, unstaged.map((f) => f.path)))} data-testid="scm-stage-all">
                <PlusIcon size={11} />
              </button>
            </>
          }
        >
          {unstaged.map((f) => (
            <FileRow key={`w:${f.path}`} file={f} letter={f.conflict ? 'U' : f.work === '?' ? 'U' : f.work} untracked={f.work === '?'} onClick={() => diff(f, 'work')}>
              <button className="icon-btn h-5 w-5" data-tip="Open file" onClick={() => onOpen(`${st.root}/${f.path}`)}>
                <FileTypeIcon name={f.path} size={10} />
              </button>
              <button className="icon-btn h-5 w-5" data-tip="Discard" onClick={() => discard([f.path])}>
                <RestartIcon size={11} />
              </button>
              <button className="icon-btn h-5 w-5" data-tip="Stage" onClick={() => void run('stage', () => scm.stage(st.root, [f.path]))}>
                <PlusIcon size={11} />
              </button>
            </FileRow>
          ))}
        </Group>
      )}
    </div>
  )
}

function Group({ title, count, actions, children }: { title: string; count: number; actions?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-3">
      <div className="group flex h-6 items-center pl-2 pr-1.5">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 panel-title">
          <ChevronRightIcon size={10} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          {title}
          <span className="ml-1 rounded-full bg-surface-4 px-1.5 font-mono text-[9.5px] normal-case tracking-normal text-text-secondary">{count}</span>
        </button>
        <div className="ml-auto flex opacity-0 group-hover:opacity-100">{actions}</div>
      </div>
      {open && <div className="px-1">{children}</div>}
    </div>
  )
}

function FileRow({
  file,
  letter,
  untracked,
  onClick,
  children,
}: {
  file: ScmFile
  letter: string
  untracked?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const name = file.path.split('/').pop()
  const dir = file.path.slice(0, -(name?.length ?? 0)).replace(/\/$/, '')
  return (
    <div onClick={onClick} className="group flex h-[22px] cursor-default items-center gap-1.5 rounded px-1.5 hover:bg-surface-4" title={file.orig ? `${file.orig} → ${file.path}` : file.path} data-testid="scm-file">
      <FileTypeIcon name={name ?? ''} size={12} />
      <span className={`truncate text-xs ${letter === 'D' ? 'text-text-tertiary line-through' : 'text-text-secondary'}`}>{name}</span>
      <span className="truncate text-2xs text-text-disabled">{dir}</span>
      <div className="ml-auto hidden items-center group-hover:flex" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <span className={`w-3 flex-shrink-0 text-center font-mono text-[10.5px] ${STATUS_COLOR[untracked ? '?' : letter] ?? 'text-text-tertiary'}`}>{letter}</span>
    </div>
  )
}

// ─── Graph ────────────────────────────────────────────────────────────────────

const ROW = 26
const LANE = 11

function Graph({ root, onOpen }: { root: string; onOpen: (id: string) => void }): React.JSX.Element {
  const [commits, setCommits] = useState<ScmCommit[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<string, Array<{ path: string; status: string }>>>({})

  const load = useCallback(() => {
    window.flutvio.scm.log(root, 300).then(setCommits).catch(() => setCommits([]))
  }, [root])
  useEffect(load, [load])

  const rows = useMemo(() => (commits ? layoutGraph(commits) : []), [commits])
  const width = Math.max(1, ...rows.map((r) => Math.max(r.before.length, r.after.length, r.col + 1))) * LANE + 6

  const toggle = (sha: string): void => {
    setOpen(open === sha ? null : sha)
    if (!files[sha])
      window.flutvio.scm
        .commitFiles(root, sha)
        .then((f) => setFiles((m) => ({ ...m, [sha]: f })))
        .catch(() => undefined)
  }

  if (!commits)
    return (
      <div className="flex items-center gap-2 px-3 text-2xs text-text-tertiary">
        <SpinnerIcon size={11} /> Reading history…
      </div>
    )
  if (!commits.length) return <p className="px-3 text-2xs text-text-tertiary">No commits yet.</p>

  return (
    <div className="pb-3" data-testid="scm-graph-list">
      {rows.map((r, i) => {
        const c = commits[i]
        const expanded = open === c.sha
        return (
          <div key={c.sha}>
            <div onClick={() => toggle(c.sha)} className={`group flex cursor-default items-center pr-2 hover:bg-surface-4 ${expanded ? 'bg-surface-4' : ''}`} style={{ height: ROW }} title={`${c.sha.slice(0, 7)} · ${c.author} · ${new Date(c.date).toLocaleString()}`}>
              <GraphCell row={r} width={width} />
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {c.refs.map((ref) => (
                  <span
                    key={ref}
                    className={`flex-shrink-0 rounded px-1 font-mono text-[9.5px] ${
                      ref.startsWith('HEAD') ? 'bg-accent-blue/20 text-accent-blue' : ref.startsWith('tag:') ? 'bg-accent-orange/15 text-accent-orange' : 'bg-surface-4 text-text-secondary'
                    }`}
                  >
                    {ref.replace('HEAD -> ', '').replace('tag: ', '')}
                  </span>
                ))}
                <span dir="auto" className="truncate text-xs text-text-secondary group-hover:text-text-primary">
                  {c.subject}
                </span>
              </div>
              <span className="ml-2 flex-shrink-0 text-[10px] text-text-tertiary">{ago(c.date)}</span>
            </div>
            {expanded && (
              <div className="pb-1" style={{ paddingLeft: width + 4 }}>
                <div className="py-0.5 text-[10px] text-text-tertiary">
                  {c.author} · <span className="font-mono">{c.sha.slice(0, 7)}</span>
                </div>
                {!files[c.sha] && <SpinnerIcon size={10} className="text-text-tertiary" />}
                {files[c.sha]?.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => onOpen(tabId({ kind: 'diff', root, path: f.path, mode: 'commit', sha: c.sha }))}
                    className="flex h-[20px] cursor-default items-center gap-1.5 rounded pr-2 hover:bg-surface-4"
                  >
                    <FileTypeIcon name={f.path.split('/').pop() ?? ''} size={11} />
                    <span className="truncate text-2xs text-text-secondary">{f.path}</span>
                    <span className={`ml-auto font-mono text-[10px] ${STATUS_COLOR[f.status] ?? 'text-text-tertiary'}`}>{f.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** One row of the graph: lanes passing through, the commit dot, and links to parents. */
function GraphCell({ row, width }: { row: GraphRow; width: number }): React.JSX.Element {
  const x = (i: number): number => 6 + i * LANE
  const mid = ROW / 2
  const color = (i: number): string => LANE_COLORS[i % LANE_COLORS.length]
  const lines: React.ReactNode[] = []
  row.before.forEach((sha, i) => {
    if (!sha) return
    if (sha === row.sha) {
      lines.push(<path key={`in${i}`} d={`M${x(i)} 0 C${x(i)} ${mid / 2} ${x(row.col)} ${mid / 2} ${x(row.col)} ${mid}`} stroke={color(i)} />)
      return
    }
    const j = row.after.indexOf(sha)
    if (j >= 0) lines.push(<path key={`p${i}`} d={`M${x(i)} 0 C${x(i)} ${mid} ${x(j)} ${mid} ${x(j)} ${ROW}`} stroke={color(i)} />)
  })
  row.parents.forEach((p, k) => {
    const j = row.after.indexOf(p)
    if (j < 0) return
    lines.push(<path key={`o${k}`} d={`M${x(row.col)} ${mid} C${x(row.col)} ${ROW - mid / 2} ${x(j)} ${ROW - mid / 2} ${x(j)} ${ROW}`} stroke={color(k === 0 ? row.col : j)} />)
  })
  return (
    <svg width={width} height={ROW} className="flex-shrink-0" fill="none" strokeWidth={1.6}>
      {lines}
      <circle cx={x(row.col)} cy={mid} r={3.6} fill={color(row.col)} stroke="rgb(var(--surface-0))" strokeWidth={1.5} />
    </svg>
  )
}

// ─── Pull requests ────────────────────────────────────────────────────────────

function PullRequests({ root, branch, onOpen }: { root: string; branch: string; onOpen: (id: string) => void }): React.JSX.Element {
  const [gh, setGh] = useState<GhStatus | null>(null)
  const [state, setState] = useState<'open' | 'closed' | 'merged'>('open')
  const [prs, setPrs] = useState<PrSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    setError(null)
    window.flutvio.gh
      .status(root)
      .then((s) => {
        setGh(s)
        if (s.authed && s.repo) {
          setPrs(null)
          window.flutvio.gh
            .prList(root, state)
            .then(setPrs)
            .catch((e: Error) => setError(e.message))
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [root, state])
  useEffect(load, [load])

  if (!gh)
    return (
      <div className="flex items-center gap-2 px-3 text-2xs text-text-tertiary">
        <SpinnerIcon size={11} /> Connecting to GitHub…
      </div>
    )
  if (!gh.installed)
    return (
      <div className="px-3 text-2xs leading-relaxed text-text-tertiary">
        Pull requests use the GitHub CLI. Install it, then sign in:
        <code className="mt-1.5 block select-text rounded bg-surface-4/60 px-1.5 py-1 font-mono text-text-secondary">brew install gh && gh auth login</code>
      </div>
    )
  if (!gh.authed)
    return (
      <div className="px-3 text-2xs leading-relaxed text-text-tertiary">
        Sign in to GitHub once in the terminal:
        <code className="mt-1.5 block select-text rounded bg-surface-4/60 px-1.5 py-1 font-mono text-text-secondary">gh auth login</code>
        <button onClick={load} className="mt-2 text-accent-blue hover:underline">
          Check again
        </button>
      </div>
    )
  if (!gh.repo)
    return <p className="px-3 text-2xs leading-relaxed text-text-tertiary">Signed in as {gh.user}. This repository has no GitHub remote, so there are no pull requests.</p>

  return (
    <div className="pb-3" data-testid="scm-prs">
      <div className="flex items-center gap-2.5 px-3 pb-1.5 text-2xs">
        {(['open', 'merged', 'closed'] as const).map((s) => (
          <button key={s} onClick={() => setState(s)} className={state === s ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex items-center">
          <button className="icon-btn h-5 w-5" data-tip="New pull request" onClick={() => setCreating(true)}>
            <PlusIcon size={11} />
          </button>
          <button className="icon-btn h-5 w-5" data-tip="Refresh" onClick={load}>
            <RefreshIcon size={11} />
          </button>
        </div>
      </div>
      <div className="px-3 pb-1 text-[10px] text-text-tertiary">
        {gh.repo} · signed in as {gh.user}
      </div>
      {error && <p className="px-3 text-2xs text-accent-red">{error}</p>}
      {!prs && !error && <SpinnerIcon size={11} className="mx-3 text-text-tertiary" />}
      {prs?.length === 0 && <p className="px-3 text-2xs text-text-tertiary">No {state} pull requests.</p>}
      <div className="px-1">
        {prs?.map((p) => (
          <button
            key={p.number}
            onClick={() => onOpen(tabId({ kind: 'pr', root, number: p.number, title: p.title }))}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-surface-4"
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${p.draft ? 'bg-text-tertiary' : p.state === 'MERGED' ? 'bg-accent-purple' : p.state === 'CLOSED' ? 'bg-accent-red' : 'bg-accent-green'}`} />
              <span dir="auto" className="truncate text-xs text-text-primary">
                {p.title}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 pl-3 text-[10px] text-text-tertiary">
              <span>#{p.number}</span>
              <span>{p.author}</span>
              <span className="truncate font-mono">{p.head}</span>
              <span className="ml-auto flex-shrink-0">{ago(p.updatedAt)}</span>
            </div>
          </button>
        ))}
      </div>
      {creating && <CreatePr root={root} branch={branch} onClose={() => setCreating(false)} onCreated={load} />}
    </div>
  )
}

function CreatePr({ root, branch, onClose, onCreated }: { root: string; branch: string; onClose: () => void; onCreated: () => void }): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Suggest the last commit's subject as the title.
    window.flutvio.scm
      .log(root, 1)
      .then((c) => setTitle((t) => t || c[0]?.subject || ''))
      .catch(() => undefined)
  }, [root])

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.flutvio.scm.push(root)
      const url = await window.flutvio.gh.prCreate(root, { title, body, draft })
      onCreated()
      onClose()
      if (url) window.open(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 pt-[14vh]" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-[460px] rounded-xl border border-border-default bg-surface-3 p-4 shadow-pop">
        <p className="text-xs font-medium text-text-primary">New pull request</p>
        <p className="mt-0.5 text-2xs text-text-tertiary">
          From <span className="font-mono">{branch}</span> · pushes the branch first, then opens the PR on GitHub as you.
        </p>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          dir="auto"
          className="mt-3 h-8 w-full rounded-md border border-border-default bg-surface-1 px-2.5 text-xs text-text-primary outline-none focus:border-accent-blue/60"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Description (optional)"
          rows={5}
          dir="auto"
          className="mt-2 w-full resize-y rounded-md border border-border-default bg-surface-1 px-2.5 py-2 text-xs text-text-primary outline-none focus:border-accent-blue/60"
        />
        <label className="mt-2 flex items-center gap-2 text-2xs text-text-secondary">
          <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Create as draft
        </label>
        {error && <p className="mt-2 break-words text-2xs text-accent-red">{error}</p>}
        <div className="mt-3 flex justify-end gap-1.5">
          <button onClick={onClose} disabled={busy} className="h-7 rounded-md px-3 text-xs text-text-secondary hover:bg-surface-4">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || !title.trim()}
            className="flex h-7 items-center gap-1.5 rounded-md bg-accent-blue px-3 text-xs font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {busy && <SpinnerIcon size={11} />} Create pull request
          </button>
        </div>
      </div>
    </div>
  )
}
