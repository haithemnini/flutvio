/**
 * SidePanel.tsx — the secondary column (hidden until asked for): Files · Changes · Git · Sessions · Agent.
 * Every tab stays mounted so switching is instant and nothing reloads.
 */

import React from 'react'
import type { AgentMonitorData } from '../../../shared/flutvio-api'
import AgentMonitorPanel from './AgentMonitor/AgentMonitorPanel'
import FileTree from './Sidebar/FileTree'
import AgentSessions from './Sidebar/AgentSessions'
import SourceControl from './Scm/SourceControl'
import ChangesPanel from './Scm/ChangesPanel'
import { BranchIcon, DiffIcon, FolderIcon, GaugeIcon, HistoryIcon, RefreshIcon, XIcon } from './Icons'

export type PanelTab = 'files' | 'changes' | 'git' | 'sessions' | 'agent'

interface Props {
  projectPath: string
  projectName: string
  visible: boolean
  tab: PanelTab
  onTab: (tab: PanelTab) => void
  onClose: () => void
  activeFile: string | null
  /** Opens a file path or a virtual tab id (diff / PR) in the editor. */
  onOpen: (id: string) => void
  treeKey: number
  onRefreshTree: () => void
  /** Number of changed files (badge). */
  changes: number
  onChanges: (n: number) => void
  /** Opens a terminal tab running `command` (resuming a session). */
  onLaunch: (label: string, command: string) => void
  /** Live data of the agent in the terminal in view. */
  agent: AgentMonitorData | null
  onAgentSend: (text: string) => void
}

const TABS: Array<{ id: PanelTab; label: string; tip: string; testId: string; icon: React.ReactNode }> = [
  { id: 'files', label: 'Files', tip: 'Files', testId: 'sidebar-files', icon: <FolderIcon size={14} /> },
  { id: 'changes', label: 'Changes', tip: 'Changes — what was edited (⌘J)', testId: 'review-changes', icon: <DiffIcon size={14} /> },
  { id: 'git', label: 'Git', tip: 'Git — commit, push, pull requests', testId: 'sidebar-scm', icon: <BranchIcon size={14} /> },
  { id: 'sessions', label: 'Sessions', tip: 'Sessions — resume an agent session', testId: 'sidebar-claude', icon: <HistoryIcon size={14} /> },
  { id: 'agent', label: 'Agent', tip: 'Agent — context, limits, MCP servers (⇧⌘A)', testId: 'sidebar-agent', icon: <GaugeIcon size={14} /> },
]

export default function SidePanel(props: Props): React.JSX.Element {
  const { projectPath, projectName, visible, tab, onTab, onClose, activeFile, onOpen, treeKey, onRefreshTree, changes, onChanges, onLaunch, agent, onAgentSend } = props
  const pane = (id: PanelTab): React.CSSProperties => ({ display: tab === id ? undefined : 'none' })

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="side-panel">
      <div className="flex h-8 flex-shrink-0 items-center gap-0.5 border-b border-border-subtle pl-1.5 pr-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-label={t.label}
            onClick={() => onTab(t.id)}
            data-testid={t.testId}
            data-tip={t.tip}
            className={`relative flex h-6 w-7 items-center justify-center rounded transition-colors ${
              tab === t.id ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:bg-surface-4/60 hover:text-text-secondary'
            }`}
          >
            {t.icon}
            {t.id === 'changes' && changes > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-accent-blue px-[3px] text-[8.5px] font-semibold leading-none text-white">
                {changes > 99 ? '99+' : changes}
              </span>
            )}
          </button>
        ))}
        <span className="panel-title ml-2 truncate">{TABS.find((t) => t.id === tab)?.label}</span>
        <button onClick={onClose} data-tip="Hide (⌘B)" className="icon-btn ml-auto h-5 w-5">
          <XIcon size={11} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <div className="flex h-full flex-col" style={pane('files')}>
          <div className="flex h-7 flex-shrink-0 items-center pl-3 pr-1.5">
            <span className="panel-title truncate">{projectName}</span>
            <button onClick={onRefreshTree} data-tip="Refresh" className="icon-btn ml-auto h-5 w-5">
              <RefreshIcon size={11} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FileTree rootPath={projectPath} activePath={activeFile} onOpen={onOpen} refreshKey={treeKey} />
          </div>
        </div>
        <div className="h-full" style={pane('changes')}>
          <ChangesPanel projectPath={projectPath} visible={visible && tab === 'changes'} onOpen={onOpen} />
        </div>
        <div className="h-full overflow-y-auto" style={pane('git')}>
          <SourceControl projectPath={projectPath} onOpen={onOpen} onCount={onChanges} />
        </div>
        <div className="h-full" style={pane('sessions')}>
          <AgentSessions projectPath={projectPath} visible={visible && tab === 'sessions'} onLaunch={onLaunch} />
        </div>
        <div className="h-full" style={pane('agent')}>
          <AgentMonitorPanel projectPath={projectPath} visible={visible && tab === 'agent'} data={agent} onSend={onAgentSend} />
        </div>
      </div>
    </div>
  )
}
