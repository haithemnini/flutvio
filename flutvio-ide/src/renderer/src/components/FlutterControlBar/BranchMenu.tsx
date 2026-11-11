/**
 * BranchMenu.tsx — the current git branch in the title bar, with the repository's worktrees.
 *
 *  - pick a worktree → it becomes the open project (files, terminals, analyzer, agents, Run follow)
 *  - New worktree… → new branch from the current commit, in <repo>.worktrees/<branch>, then opened
 *  - Remove this worktree… → back to the main checkout, then the folder is removed (branch kept)
 *
 * Hidden when the project isn't in a git repository.
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { GitInfo } from '../../../../shared/flutvio-api'
import type { FlutterController } from '../../hooks/useFlutter'
import Menu from '../Menu'
import PromptDialog from '../PromptDialog'
import { BranchIcon, CheckIcon, ChevronDownIcon, PlusIcon, TrashIcon } from '../Icons'

const BRANCH_RE = /^[A-Za-z0-9._/-]+$/

export default function BranchMenu({ flutter }: { flutter: FlutterController }): React.JSX.Element | null {
  const { state, actions } = flutter
  const projectPath = state.project?.path ?? null
  const idle = state.status === 'idle'
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(() => {
    if (!projectPath) return setInfo(null)
    window.flutvio.git
      .info(projectPath)
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [projectPath])
  useEffect(refresh, [refresh])

  if (!info) return null

  const open = async (worktreePath: string): Promise<void> => {
    const target = info.subdir ? `${worktreePath}/${info.subdir}` : worktreePath
    await actions.openProject(target)
  }

  const removeCurrent = async (): Promise<void> => {
    const current = info.worktrees.find((w) => w.path === info.root)
    const main = info.worktrees.find((w) => w.main)
    if (!current || !main || current.main) return
    const msg = info.dirty
      ? `"${current.branch}" has uncommitted changes. Remove the worktree folder anyway? The changes will be lost (the branch itself is kept).`
      : `Remove the worktree folder for "${current.branch}"? The branch itself is kept.`
    if (!window.confirm(msg)) return
    await open(main.path)
    try {
      await window.flutvio.git.removeWorktree(current.path, info.dirty)
      actions.notify('ok', `Removed worktree ${current.branch}`)
    } catch (err) {
      actions.notify('error', (err as Error).message)
    }
  }

  const current = info.worktrees.find((w) => w.path === info.root)
  const others = info.worktrees.length > 1

  return (
    <>
      <span className="px-0.5 text-text-disabled">/</span>
      <Menu
        width={280}
        onOpen={refresh}
        trigger={(isOpen) => (
          <button
            data-testid="branch-button"
            title={info.root}
            className={`flex h-6 min-w-0 max-w-[180px] items-center gap-1 rounded px-1.5 text-xs text-text-secondary hover:bg-surface-4 ${isOpen ? 'bg-surface-4' : ''}`}
          >
            <BranchIcon size={12} className="flex-shrink-0 text-text-tertiary" />
            <span className="truncate">{info.branch || 'detached'}</span>
            {info.dirty && <span className="h-1 w-1 flex-shrink-0 rounded-full bg-text-secondary" title="Uncommitted changes" />}
            <ChevronDownIcon size={11} className="flex-shrink-0 text-text-tertiary" />
          </button>
        )}
        items={[
          { header: others ? 'Worktrees' : 'Worktree' },
          ...info.worktrees.map((w) => ({
            key: w.path,
            label: w.branch || w.head.slice(0, 7),
            hint: w.main ? 'main checkout' : w.path.split('/').pop(),
            icon: w.path === info.root ? <CheckIcon size={12} /> : undefined,
            disabled: !idle || w.path === info.root,
            onSelect: () => void open(w.path),
          })),
          'sep' as const,
          {
            key: 'new',
            label: 'New worktree…',
            icon: <PlusIcon size={12} />,
            disabled: !idle,
            hint: idle ? undefined : 'stop the app first',
            onSelect: () => setCreating(true),
          },
          ...(current && !current.main
            ? [
                {
                  key: 'remove',
                  label: 'Remove this worktree…',
                  icon: <TrashIcon size={12} />,
                  disabled: !idle,
                  onSelect: () => void removeCurrent(),
                },
              ]
            : []),
        ]}
      />
      {creating && (
        <PromptDialog
          title="New worktree"
          hint={
            <>
              A separate folder on a new branch from <span className="font-mono">{info.branch || 'HEAD'}</span>, so you (or an agent) can
              work there without touching this checkout. Packages are fetched before it opens.
            </>
          }
          placeholder="feature/login"
          confirmLabel="Create & open"
          validate={(v) => (BRANCH_RE.test(v) && !v.startsWith('-') && !v.includes('..') ? null : 'Use letters, numbers, "-", "_", "." and "/".')}
          onConfirm={async (branch) => {
            const wt = await window.flutvio.git.createWorktree(projectPath!, branch)
            await open(wt.path)
            actions.notify('ok', `Opened worktree ${wt.branch} — ${wt.path}`)
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  )
}
