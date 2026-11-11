/**
 * FileTree.tsx — lazily loaded project tree. Folders load their children on expand.
 * Rows show file-type glyphs and indent guides; the open file is highlighted.
 */

import React, { useEffect, useState } from 'react'
import type { FileEntry } from '../../../../shared/flutvio-api'
import { ChevronRightIcon, FileTypeIcon, FolderIcon, FolderOpenIcon } from '../Icons'

interface Props {
  rootPath: string
  activePath: string | null
  onOpen: (path: string) => void
  /** Bumped to force a reload (e.g. after the project changes on disk). */
  refreshKey: number
}

const ROW = 'group relative flex h-[22px] w-full items-center gap-1.5 pr-2 text-left text-xs'
const INDENT = 12
const BASE = 10

/** Folders that usually matter in a Flutter project get an accent colour. */
const KEY_DIRS = new Set(['lib', 'test', 'assets', 'integration_test'])

export default function FileTree({ rootPath, activePath, onOpen, refreshKey }: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [rootEntries, setRootEntries] = useState<FileEntry[] | null>(null)

  useEffect(() => {
    setError(null)
    window.flutvio.files
      .list(rootPath)
      .then(setRootEntries)
      .catch((e: Error) => setError(e.message))
  }, [rootPath, refreshKey])

  if (error) return <p className="p-3 text-xs text-accent-red">{error}</p>
  if (!rootEntries) return <SkeletonRows />
  return (
    <div className="px-1 pb-3" data-testid="file-tree">
      {rootEntries.map((e) => (
        <Node key={e.path} entry={e} depth={0} activePath={activePath} onOpen={onOpen} refreshKey={refreshKey} />
      ))}
    </div>
  )
}

function SkeletonRows(): React.JSX.Element {
  return (
    <div className="space-y-2 px-4 pt-2">
      {[70, 50, 62, 40, 55].map((w, i) => (
        <div key={i} className="h-2.5 animate-pulse rounded bg-surface-4/60" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

function Guides({ depth }: { depth: number }): React.JSX.Element | null {
  if (!depth) return null
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border-subtle group-hover:bg-border-default"
          style={{ left: BASE + 5 + i * INDENT }}
        />
      ))}
    </>
  )
}

function Node({
  entry,
  depth,
  activePath,
  onOpen,
  refreshKey,
}: {
  entry: FileEntry
  depth: number
  activePath: string | null
  onOpen: (path: string) => void
  refreshKey: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)

  useEffect(() => {
    if (open && entry.isDir && children === null) {
      window.flutvio.files.list(entry.path).then(setChildren).catch(() => setChildren([]))
    }
  }, [open, entry, children])

  // Reload already-open folders when the tree is refreshed.
  useEffect(() => {
    if (open && entry.isDir) window.flutvio.files.list(entry.path).then(setChildren).catch(() => setChildren([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const active = entry.path === activePath
  const indent = { paddingLeft: BASE + depth * INDENT }

  if (!entry.isDir) {
    return (
      <button
        onClick={() => onOpen(entry.path)}
        style={{ paddingLeft: BASE + depth * INDENT + 14 }}
        data-testid="tree-file"
        title={entry.name}
        className={`${ROW} rounded ${
          active ? 'bg-surface-4 text-text-primary' : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
        }`}
      >
        <Guides depth={depth} />
        <FileTypeIcon name={entry.name} size={12} />
        <span className="truncate">{entry.name}</span>
      </button>
    )
  }

  const dot = entry.name.startsWith('.')
  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={indent}
        data-testid="tree-folder"
        title={entry.name}
        className={`${ROW} rounded hover:bg-surface-4 ${dot ? 'text-text-tertiary' : 'text-text-primary'}`}
      >
        <Guides depth={depth} />
        <ChevronRightIcon
          size={11}
          className={`flex-shrink-0 text-text-tertiary transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        {open ? (
          <FolderOpenIcon size={13} className={`flex-shrink-0 ${KEY_DIRS.has(entry.name) ? 'text-accent-blue/80' : 'text-text-tertiary'}`} />
        ) : (
          <FolderIcon size={13} className={`flex-shrink-0 ${KEY_DIRS.has(entry.name) ? 'text-accent-blue/80' : 'text-text-tertiary'}`} />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {open &&
        children?.map((c) => (
          <Node key={c.path} entry={c} depth={depth + 1} activePath={activePath} onOpen={onOpen} refreshKey={refreshKey} />
        ))}
    </>
  )
}
