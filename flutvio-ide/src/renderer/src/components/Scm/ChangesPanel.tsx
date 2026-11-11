/**
 * ChangesPanel.tsx — live view of everything uncommitted in the project, GitHub "Files changed"
 * style. Refreshes every 2 s while visible, so edits made by an agent in the terminal show up
 * beside it as they happen; files that just changed get a short highlight and move to the top.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { parseUnifiedDiff, type DiffFile } from '../../lib/unifiedDiff'
import DiffFileCard from './DiffFileCard'
import { RefreshIcon } from '../Icons'

interface Props {
  projectPath: string | null
  visible: boolean
  /** Opens a file (absolute path) in the editor. */
  onOpen: (path: string) => void
  /** Number of changed files (for the tab badge). */
  onCount?: (n: number) => void
}

const POLL_MS = 2000
const FRESH_MS = 3000
/** Files with more lines than this start collapsed. */
const BIG = 400

const signature = (f: DiffFile): string => `${f.status}:${f.additions}:${f.deletions}:${f.lines.map((l) => l.kind[0] + l.text).join('\n')}`

export default function ChangesPanel({ projectPath, visible, onOpen, onCount }: Props): React.JSX.Element {
  const [root, setRoot] = useState<string | null | undefined>(undefined) // undefined = loading, null = not a repo
  const [files, setFiles] = useState<DiffFile[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [fresh, setFresh] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const sigs = useRef<Map<string, string> | null>(null)
  const busy = useRef(false)

  // Repository root of the project (diff paths are relative to it).
  useEffect(() => {
    setRoot(undefined)
    setFiles([])
    sigs.current = null
    if (!projectPath) return setRoot(null)
    let alive = true
    window.flutvio.scm
      .status(projectPath)
      .then((s) => alive && setRoot(s?.root ?? null))
      .catch(() => alive && setRoot(null))
    return () => {
      alive = false
    }
  }, [projectPath])

  const refresh = useCallback(async () => {
    if (!root || busy.current) return
    busy.current = true
    setLoading(true)
    try {
      const next = parseUnifiedDiff(await window.flutvio.scm.workingDiff(root))
      const prev = sigs.current
      const now = Date.now()
      const changed: Record<string, number> = {}
      const map = new Map<string, string>()
      for (const f of next) {
        const sig = signature(f)
        map.set(f.path, sig)
        if (prev && prev.get(f.path) !== sig) changed[f.path] = now
      }
      sigs.current = map
      if (Object.keys(changed).length) setFresh((fr) => ({ ...fr, ...changed }))
      setFiles(next)
      setError(null)
      onCount?.(next.length)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [root, onCount])

  useEffect(() => {
    if (!visible || !root) return
    void refresh()
    const t = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(t)
  }, [visible, root, refresh])

  // Fade highlights.
  useEffect(() => {
    const ids = Object.keys(fresh)
    if (!ids.length) return
    const t = window.setTimeout(() => {
      const now = Date.now()
      setFresh((fr) => Object.fromEntries(Object.entries(fr).filter(([, at]) => now - at < FRESH_MS)))
    }, 500)
    return () => window.clearTimeout(t)
  }, [fresh])

  // Most recently changed first, then by path.
  const ordered = [...files].sort((a, b) => (fresh[b.path] ?? 0) - (fresh[a.path] ?? 0) || a.path.localeCompare(b.path))
  const adds = files.reduce((n, f) => n + f.additions, 0)
  const dels = files.reduce((n, f) => n + f.deletions, 0)

  return (
    <div className="flex h-full flex-col" data-testid="changes-panel">
      <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border-subtle px-3 text-2xs">
        {root ? (
          <span className="text-text-secondary">
            {files.length} {files.length === 1 ? 'file' : 'files'} changed
            {files.length > 0 && (
              <span className="ml-2 font-mono">
                <span className="text-accent-green">+{adds}</span> <span className="text-accent-red">−{dels}</span>
              </span>
            )}
          </span>
        ) : (
          <span className="text-text-tertiary">Changes</span>
        )}
        <div className="ml-auto flex items-center gap-px">
          {files.length > 1 && (
            <button
              className="rounded px-1.5 text-text-tertiary hover:bg-surface-4 hover:text-text-primary"
              onClick={() => {
                const allClosed = files.every((f) => collapsed[f.path])
                setCollapsed(Object.fromEntries(files.map((f) => [f.path, !allClosed])))
              }}
            >
              {files.every((f) => collapsed[f.path]) ? 'Expand all' : 'Collapse all'}
            </button>
          )}
          <button onClick={() => void refresh()} data-tip="Refresh" className="icon-btn h-5 w-5" disabled={!root}>
            <RefreshIcon size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {root === null && (
          <p className="text-2xs leading-relaxed text-text-tertiary">
            This project isn’t a git repository, so changes can’t be tracked. Run <code className="text-text-secondary">git init</code> and make a first
            commit in the terminal — then every edit (yours or an agent’s) shows up here.
          </p>
        )}
        {error && <p className="text-2xs text-accent-red">{error}</p>}
        {root && files.length === 0 && !error && (
          <p className="text-2xs leading-relaxed text-text-tertiary">
            No uncommitted changes. When you or an agent in the terminal edits a file, the diff appears here live.
          </p>
        )}
        {ordered.map((f) => (
          <DiffFileCard
            key={f.path}
            file={f}
            fresh={Boolean(fresh[f.path])}
            collapsed={collapsed[f.path] ?? f.lines.length > BIG}
            onToggle={() => setCollapsed((c) => ({ ...c, [f.path]: !(c[f.path] ?? f.lines.length > BIG) }))}
            onOpen={root ? () => onOpen(`${root}/${f.path}`) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
