/**
 * PrView.tsx — one GitHub pull request in an editor tab (via the gh CLI and the user's login):
 * conversation, files changed (unified diff), checks; comment, review, check out, merge.
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { PrDetail } from '../../../../shared/flutvio-api'
import type { PrTab } from '../../lib/virtualTabs'
import { parseUnifiedDiff, type DiffFile } from '../../lib/unifiedDiff'
import Menu from '../Menu'
import DiffFileCard from './DiffFileCard'
import { BranchIcon, CheckIcon, ChevronDownIcon, ExternalIcon, RefreshIcon, SpinnerIcon, XIcon } from '../Icons'

type Pane = 'conversation' | 'files' | 'checks'

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(ms).toLocaleDateString()
}

function StateBadge({ pr }: { pr: PrDetail }): React.JSX.Element {
  const st = pr.draft ? 'Draft' : pr.state === 'OPEN' ? 'Open' : pr.state === 'MERGED' ? 'Merged' : 'Closed'
  const cls =
    st === 'Open' ? 'bg-accent-green/15 text-accent-green' : st === 'Merged' ? 'bg-accent-purple/15 text-accent-purple' : st === 'Draft' ? 'bg-surface-4 text-text-secondary' : 'bg-accent-red/15 text-accent-red'
  return <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${cls}`}>{st}</span>
}

export default function PrView({ tab, visible, onChanged }: { tab: PrTab; visible: boolean; onChanged: () => void }): React.JSX.Element {
  const [pr, setPr] = useState<PrDetail | null>(null)
  const [diff, setDiff] = useState<DiffFile[] | null>(null)
  const [pane, setPane] = useState<Pane>('conversation')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const gh = window.flutvio.gh

  const load = (): void => {
    setError(null)
    gh.prView(tab.root, tab.number).then(setPr).catch((e: Error) => setError(e.message))
    gh.prDiff(tab.root, tab.number)
      .then((d) => setDiff(parseUnifiedDiff(d)))
      .catch(() => setDiff([]))
  }
  useEffect(load, [tab.root, tab.number])

  const act = async (label: string, fn: () => Promise<void>, after?: () => void): Promise<void> => {
    setBusy(label)
    setError(null)
    try {
      await fn()
      after?.()
      load()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const totals = useMemo(() => diff?.reduce((t, f) => ({ add: t.add + f.additions, del: t.del + f.deletions }), { add: 0, del: 0 }), [diff])

  if (!pr)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-2xs text-text-tertiary" style={{ display: visible ? undefined : 'none' }}>
        {error ? <span className="text-accent-red">{error}</span> : <><SpinnerIcon size={12} /> Loading pull request #{tab.number}…</>}
      </div>
    )

  const open = pr.state === 'OPEN'

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ display: visible ? undefined : 'none' }} data-testid="pr-view">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pb-2 pt-4">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 text-base font-semibold leading-snug text-text-primary" dir="auto">
            {pr.title} <span className="font-normal text-text-tertiary">#{pr.number}</span>
          </h1>
          <button className="icon-btn" onClick={load} data-tip="Refresh">
            <RefreshIcon size={12} />
          </button>
          <button className="icon-btn" onClick={() => window.open(pr.url)} data-tip="Open on GitHub">
            <ExternalIcon size={12} />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-text-tertiary">
          <StateBadge pr={pr} />
          <span>{pr.author}</span>
          <span className="flex items-center gap-1 font-mono">
            <BranchIcon size={10} /> {pr.head} → {pr.base}
          </span>
          {totals && (
            <span className="font-mono">
              <span className="text-accent-green">+{totals.add}</span> <span className="text-accent-red">−{totals.del}</span>
            </span>
          )}
          {pr.reviewDecision && <span>{pr.reviewDecision.replace(/_/g, ' ').toLowerCase()}</span>}
        </div>
        <div className="mt-3 flex items-center gap-1">
          {(['conversation', 'files', 'checks'] as Pane[]).map((p) => (
            <button
              key={p}
              onClick={() => setPane(p)}
              className={`h-6 rounded px-2.5 text-2xs ${pane === p ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              {p === 'conversation' ? `Conversation ${pr.timeline.length || ''}` : p === 'files' ? `Files ${pr.files.length}` : `Checks ${pr.checks.length || ''}`}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <button
              disabled={!!busy}
              onClick={() => void act('checkout', () => gh.prCheckout(tab.root, pr.number))}
              className="h-6 rounded-md border border-border-default px-2.5 text-2xs text-text-secondary hover:bg-surface-4 disabled:opacity-50"
            >
              {busy === 'checkout' ? 'Checking out…' : 'Check out'}
            </button>
            {open && (
              <Menu
                align="right"
                width={190}
                trigger={() => (
                  <button disabled={!!busy} className="flex h-6 items-center gap-1 rounded-md bg-accent-green/90 px-2.5 text-2xs font-medium text-white hover:bg-accent-green disabled:opacity-50">
                    {busy === 'merge' ? 'Merging…' : 'Merge'} <ChevronDownIcon size={10} />
                  </button>
                )}
                items={(['squash', 'merge', 'rebase'] as const).map((m) => ({
                  key: m,
                  label: m === 'squash' ? 'Squash and merge' : m === 'merge' ? 'Create a merge commit' : 'Rebase and merge',
                  onSelect: () => {
                    if (window.confirm(`${m === 'squash' ? 'Squash and merge' : m === 'merge' ? 'Merge' : 'Rebase and merge'} #${pr.number} into ${pr.base} on GitHub?`))
                      void act('merge', () => gh.prMerge(tab.root, pr.number, m))
                  },
                }))}
              />
            )}
          </div>
        </div>
        {error && <p className="mt-2 break-words text-2xs text-accent-red">{error}</p>}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {pane === 'conversation' && (
          <div className="max-w-3xl">
            <Entry author={pr.author} at={pr.createdAt} body={pr.body || '_No description._'} />
            {pr.timeline.map((t, i) => (
              <Entry key={i} author={t.author} at={t.at} body={t.body} state={t.kind === 'review' ? t.state : undefined} />
            ))}

            {/* Comment / review */}
            <div className="mt-4 rounded-lg border border-border-default">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                dir="auto"
                placeholder="Leave a comment"
                rows={4}
                data-testid="pr-comment"
                className="block w-full resize-y rounded-t-lg bg-transparent px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-tertiary"
              />
              <div className="flex items-center gap-1.5 border-t border-border-subtle px-2 py-1.5">
                <span className="text-2xs text-text-tertiary">Posts to GitHub as you</span>
                <div className="ml-auto flex gap-1.5">
                  {open && (
                    <>
                      <button
                        disabled={!!busy || !text.trim()}
                        onClick={() => void act('changes', () => gh.prReview(tab.root, pr.number, 'request-changes', text), () => setText(''))}
                        className="h-6 rounded-md border border-border-default px-2.5 text-2xs text-text-secondary hover:bg-surface-4 disabled:opacity-40"
                      >
                        Request changes
                      </button>
                      <button
                        disabled={!!busy}
                        onClick={() => void act('approve', () => gh.prReview(tab.root, pr.number, 'approve', text), () => setText(''))}
                        className="h-6 rounded-md border border-border-default px-2.5 text-2xs text-text-secondary hover:bg-surface-4 disabled:opacity-40"
                      >
                        Approve
                      </button>
                    </>
                  )}
                  <button
                    disabled={!!busy || !text.trim()}
                    onClick={() => void act('comment', () => gh.prComment(tab.root, pr.number, text), () => setText(''))}
                    className="h-6 rounded-md bg-accent-blue px-2.5 text-2xs font-medium text-white hover:bg-accent-blue/90 disabled:opacity-40"
                  >
                    {busy === 'comment' ? 'Posting…' : 'Comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {pane === 'files' && (
          <div className="space-y-3">
            {!diff && (
              <div className="flex items-center gap-2 text-2xs text-text-tertiary">
                <SpinnerIcon size={11} /> Loading diff…
              </div>
            )}
            {diff?.map((f) => (
              <DiffFileCard key={f.path} file={f} collapsed={!!collapsed[f.path]} onToggle={() => setCollapsed((c) => ({ ...c, [f.path]: !c[f.path] }))} />
            ))}
          </div>
        )}

        {pane === 'checks' && (
          <div className="max-w-2xl divide-y divide-border-subtle">
            {pr.checks.length === 0 && <p className="text-2xs text-text-tertiary">No checks on this pull request.</p>}
            {pr.checks.map((c, i) => {
              const ok = c.status === 'success' || c.status === 'neutral' || c.status === 'skipped'
              const bad = c.status === 'failure' || c.status === 'error' || c.status === 'cancelled' || c.status === 'timed_out'
              return (
                <div key={i} className="flex items-center gap-2 py-2 text-xs">
                  <span className={ok ? 'text-accent-green' : bad ? 'text-accent-red' : 'text-accent-orange'}>
                    {ok ? <CheckIcon size={12} /> : bad ? <XIcon size={11} /> : <SpinnerIcon size={11} />}
                  </span>
                  <span className="text-text-primary">{c.name}</span>
                  <span className="ml-auto text-2xs text-text-tertiary">{c.status || 'pending'}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Entry({ author, at, body, state }: { author: string; at: number; body: string; state?: string }): React.JSX.Element {
  const badge =
    state === 'APPROVED' ? 'approved' : state === 'CHANGES_REQUESTED' ? 'requested changes' : state === 'COMMENTED' ? 'reviewed' : state ? state.toLowerCase() : null
  return (
    <div className="mt-3 rounded-lg border border-border-subtle">
      <div className="flex items-center gap-2 px-3 py-1.5 text-2xs text-text-tertiary">
        <span className="font-medium text-text-secondary">{author}</span>
        {badge && <span className={state === 'APPROVED' ? 'text-accent-green' : state === 'CHANGES_REQUESTED' ? 'text-accent-red' : ''}>{badge}</span>}
        <span>{ago(at)}</span>
      </div>
      {body.trim() && (
        <div dir="auto" className="select-text whitespace-pre-wrap break-words px-3 pb-2.5 text-xs leading-relaxed text-text-primary">
          {body}
        </div>
      )}
    </div>
  )
}
