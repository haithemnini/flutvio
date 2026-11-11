/**
 * DiffView.tsx — side-by-side (or inline) diff of one file in a Monaco diff editor.
 *
 *  work   : index  ↔ working tree   (what "Stage" would add)
 *  staged : HEAD   ↔ index          (what "Commit" would record)
 *  commit : sha^   ↔ sha            (what a commit changed)
 */

import React, { useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import { monaco, languageFor } from '../../lib/monaco'
import { getSettings, fontStack } from '../../lib/settings'
import type { DiffTab } from '../../lib/virtualTabs'
import { usePersisted } from '../../lib/usePersisted'
import { FileIcon, MinusIcon, PlusIcon, RefreshIcon, SplitIcon } from '../Icons'

let seq = 0

interface Props {
  tab: DiffTab
  visible: boolean
  onOpenFile: (absPath: string) => void
  /** Called after staging / unstaging so the source-control list refreshes. */
  onChanged: () => void
}

export default function DiffView({ tab, visible, onOpenFile, onChanged }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null)
  const [sideBySide, setSideBySide] = usePersisted('flutvio.diff.sideBySide', true)
  const [stats, setStats] = useState<{ add: number; del: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    const ed = editorRef.current
    if (!ed) return
    const scm = window.flutvio.scm
    const [left, right] =
      tab.mode === 'work'
        ? [':', 'WORKTREE']
        : tab.mode === 'staged'
          ? ['HEAD', ':']
          : [`${tab.sha}^`, tab.sha!]
    try {
      const [a, b] = await Promise.all([scm.fileAt(tab.root, left, tab.path), scm.fileAt(tab.root, right, tab.path)])
      // The editor may have been replaced while loading (tab closed / remounted).
      if (editorRef.current !== ed) return
      setError(null)
      const lang = languageFor(tab.path)
      const id = ++seq
      const original = monaco.editor.createModel(a, lang, monaco.Uri.parse(`inmemory://diff/${id}/a/${tab.path}`))
      const modified = monaco.editor.createModel(b, lang, monaco.Uri.parse(`inmemory://diff/${id}/b/${tab.path}`))
      const old = ed.getModel()
      ed.setModel({ original, modified })
      old?.original.dispose()
      old?.modified.dispose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const s = getSettings()
    const ed = monaco.editor.createDiffEditor(host, {
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: sideBySide,
      fontFamily: fontStack(s.editorFontFamily),
      fontSize: s.editorFontSize,
      lineHeight: s.editorLineHeight,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: true,
      hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 5, revealLineCount: 20 },
      padding: { top: 8 },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
    })
    editorRef.current = ed
    ed.onDidUpdateDiff(() => {
      const changes = ed.getLineChanges() ?? []
      let add = 0
      let del = 0
      for (const c of changes) {
        if (c.modifiedEndLineNumber >= c.modifiedStartLineNumber && c.modifiedEndLineNumber > 0) add += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
        if (c.originalEndLineNumber >= c.originalStartLineNumber && c.originalEndLineNumber > 0) del += c.originalEndLineNumber - c.originalStartLineNumber + 1
      }
      setStats({ add, del })
    })
    void load()
    return () => {
      const m = ed.getModel()
      ed.dispose()
      m?.original.dispose()
      m?.modified.dispose()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.root, tab.path, tab.mode, tab.sha])

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: sideBySide })
  }, [sideBySide])

  // Working-tree diffs follow edits: reload when the tab comes back into view.
  useEffect(() => {
    if (visible && tab.mode !== 'commit') void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const act = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged()
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const label = tab.mode === 'work' ? 'Working tree' : tab.mode === 'staged' ? 'Staged' : `Commit ${tab.sha?.slice(0, 7)}`

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ display: visible ? undefined : 'none' }} data-testid="diff-view">
      <div className="flex h-8 flex-shrink-0 items-center gap-2 px-3 text-2xs">
        <span className="truncate text-text-secondary">{tab.path}</span>
        <span className="text-text-tertiary">· {label}</span>
        {stats && (
          <span className="font-mono">
            <span className="text-accent-green">+{stats.add}</span> <span className="text-accent-red">−{stats.del}</span>
          </span>
        )}
        {error && <span className="truncate text-accent-red">{error}</span>}
        <div className="ml-auto flex items-center gap-px">
          {tab.mode === 'work' && (
            <button className="icon-btn h-6 w-auto gap-1 px-1.5 text-2xs" disabled={busy} onClick={() => void act(() => window.flutvio.scm.stage(tab.root, [tab.path]))}>
              <PlusIcon size={11} /> Stage
            </button>
          )}
          {tab.mode === 'staged' && (
            <button className="icon-btn h-6 w-auto gap-1 px-1.5 text-2xs" disabled={busy} onClick={() => void act(() => window.flutvio.scm.unstage(tab.root, [tab.path]))}>
              <MinusIcon size={11} /> Unstage
            </button>
          )}
          <button className="icon-btn" onClick={() => setSideBySide(!sideBySide)} data-tip={sideBySide ? 'Inline' : 'Side by side'} aria-pressed={sideBySide}>
            <SplitIcon size={12} />
          </button>
          <button className="icon-btn" onClick={() => void load()} data-tip="Reload">
            <RefreshIcon size={11} />
          </button>
          {tab.mode !== 'commit' && (
            <button className="icon-btn" onClick={() => onOpenFile(`${tab.root}/${tab.path}`)} data-tip="Open file">
              <FileIcon size={12} />
            </button>
          )}
        </div>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1" />
    </div>
  )
}
