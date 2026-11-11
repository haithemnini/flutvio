/**
 * DiffFileCard.tsx — one file of a unified diff, GitHub style: header (path, +/−), then the lines
 * with old/new numbers, green additions and red deletions. Used by PR "Files changed" and the
 * live Changes panel.
 */

import React from 'react'
import type { DiffFile } from '../../lib/unifiedDiff'
import { ChevronRightIcon } from '../Icons'

interface Props {
  file: DiffFile
  collapsed: boolean
  onToggle: () => void
  /** Opens the file in the editor (shown as a button in the header). */
  onOpen?: () => void
  /** Briefly marks a file that just changed. */
  fresh?: boolean
}

const STATUS_LABEL: Partial<Record<DiffFile['status'], string>> = { added: 'new', deleted: 'deleted', renamed: 'renamed' }

export default function DiffFileCard({ file: f, collapsed, onToggle, onOpen, fresh }: Props): React.JSX.Element {
  return (
    <div
      className={`overflow-hidden rounded-lg border transition-colors duration-700 ${fresh ? 'border-accent-blue/70' : 'border-border-default'}`}
      data-testid="diff-file"
    >
      <div className="flex h-8 w-full items-center gap-2 bg-surface-4/40 px-3 text-2xs">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRightIcon size={10} className={`flex-shrink-0 text-text-tertiary transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          <span className="truncate font-mono text-text-primary" title={f.path}>
            {f.path}
          </span>
          {STATUS_LABEL[f.status] && <span className="flex-shrink-0 rounded bg-surface-4 px-1 text-[10px] text-text-tertiary">{STATUS_LABEL[f.status]}</span>}
        </button>
        <span className="flex-shrink-0 font-mono">
          <span className="text-accent-green">+{f.additions}</span> <span className="text-accent-red">−{f.deletions}</span>
        </span>
        {onOpen && f.status !== 'deleted' && (
          <button onClick={onOpen} className="flex-shrink-0 rounded px-1.5 text-text-tertiary hover:bg-surface-4 hover:text-text-primary">
            Open
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="overflow-x-auto font-mono text-[11.5px] leading-[18px]">
          {f.status === 'binary' && <div className="px-3 py-2 text-text-tertiary">Binary file</div>}
          {f.lines.map((l, i) =>
            l.kind === 'hunk' ? (
              <div key={i} className="bg-accent-blue/[0.06] px-3 text-text-tertiary">
                {l.text}
              </div>
            ) : (
              <div key={i} className={`flex whitespace-pre ${l.kind === 'add' ? 'bg-accent-green/[0.09]' : l.kind === 'del' ? 'bg-accent-red/[0.09]' : ''}`}>
                <span className="w-10 flex-shrink-0 select-none pr-2 text-right text-text-disabled">{l.oldNo ?? ''}</span>
                <span className="w-10 flex-shrink-0 select-none pr-2 text-right text-text-disabled">{l.newNo ?? ''}</span>
                <span className={`w-4 flex-shrink-0 select-none ${l.kind === 'add' ? 'text-accent-green' : l.kind === 'del' ? 'text-accent-red' : ''}`}>
                  {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}
                </span>
                <span dir="auto" className="select-text pr-4 text-text-primary">
                  {l.text}
                </span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
