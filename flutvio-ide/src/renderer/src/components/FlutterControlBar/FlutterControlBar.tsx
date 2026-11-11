/**
 * FlutterControlBar.tsx — the window title bar (flat, 36px).
 *
 *  left:   traffic lights · project ▾ · device ▾
 *  center: ▶/■ · ⚡ · ↻ · status
 *  right:  sidebar / panel / simulator toggles · ⋯ (RTL Lab)
 */

import React from 'react'
import type { FlutterDevice, FlutterStatus } from '../../../../shared/flutvio-api'
import type { FlutterController } from '../../hooks/useFlutter'
import type { Tab } from '../../App'
import type { Layout } from '../../lib/layout'
import Menu from '../Menu'
import BranchMenu from './BranchMenu'
import NotificationCenter from '../Notifications/NotificationCenter'
import { setSetting, useSettings } from '../../lib/settings'
import {
  ChevronDownIcon,
  FlaskIcon,
  MoreIcon,
  PlayIcon,
  RefreshIcon,
  RestartIcon,
  SpinnerIcon,
  StopIcon,
  ZapIcon,
  CheckIcon,
  SettingsIcon,
  LayoutIcon,
  PhoneIcon,
} from '../Icons'

const STATUS_LABEL: Record<FlutterStatus, string> = {
  idle: 'Idle',
  launching: 'Launching',
  running: 'Running',
  reloading: 'Reloading',
  restarting: 'Restarting',
  stopping: 'Stopping',
}

function deviceLabel(d: FlutterDevice): string {
  const kind = d.emulator ? (d.platform.startsWith('android') ? 'Emulator' : 'Simulator') : d.platform === 'darwin' ? 'macOS' : 'Device'
  return `${d.name} · ${kind}`
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

interface Props {
  flutter: FlutterController
  tab: Tab
  onTab: (tab: Tab) => void
  layout: Layout
  onLayout: React.Dispatch<React.SetStateAction<Layout>>
  onOpenSettings: () => void
}

export default function FlutterControlBar({ flutter, tab, onTab, layout, onLayout, onOpenSettings }: Props): React.JSX.Element {
  const { state, devices, devicesLoading, actions } = flutter
  const { status, project, deviceId } = state
  const idle = status === 'idle'
  const running = status === 'running'
  const busy = status === 'reloading' || status === 'restarting'
  const live = running || busy
  const selected = devices.find((d) => d.id === deviceId)

  const prefs = useSettings()
  const toggle = (key: 'panel' | 'simulator'): void => onLayout((l) => ({ ...l, [key]: !l[key] }))

  return (
    <header className="drag relative flex h-9 flex-shrink-0 items-center bg-surface-0 pl-[78px] pr-2">
      {/* ── Left: project · device ── */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5" style={noDrag}>
        <button
          onClick={() => void actions.pickProject()}
          disabled={!idle}
          title={project ? `${project.path} — click to open another project` : 'Open a Flutter project folder'}
          data-testid="project-button"
          className="flex h-6 min-w-0 max-w-[180px] items-center gap-1 rounded px-1.5 text-xs font-medium text-text-primary hover:bg-surface-4 disabled:hover:bg-transparent"
        >
          <span className="truncate">{project ? project.name : 'Open Project…'}</span>
          <ChevronDownIcon size={11} className="flex-shrink-0 text-text-tertiary" />
        </button>

        <BranchMenu flutter={flutter} />

        <span className="px-0.5 text-text-disabled">/</span>

        {/* Device: native menu, styled as text */}
        <div className="relative flex min-w-0 items-center rounded hover:bg-surface-4">
          <select
            value={deviceId ?? ''}
            onChange={(e) => void actions.selectDevice(e.target.value)}
            disabled={!idle}
            data-testid="device-select"
            title={selected ? deviceLabel(selected) : undefined}
            className="h-6 max-w-[200px] appearance-none truncate rounded bg-transparent pl-1.5 pr-5 text-xs text-text-secondary outline-none"
          >
            <option value="" disabled>
              {devicesLoading && !devices.length ? 'Loading devices…' : 'Select a device…'}
            </option>
            {deviceId && !selected && !devicesLoading && <option value={deviceId}>{deviceId} (not connected)</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id} disabled={!d.supported}>
                {deviceLabel(d)}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-1 text-text-tertiary" size={11} />
        </div>
        <button
          onClick={() => void actions.refreshDevices()}
          disabled={devicesLoading}
          data-tip="Refresh devices"
          className="icon-btn h-5 w-5"
          data-testid="refresh-devices"
        >
          <RefreshIcon size={11} className={devicesLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Center: run controls ── */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5" style={noDrag}>
        {idle ? (
          <button
            onClick={() => void actions.run()}
            disabled={!project || !deviceId}
            data-tip={!project ? 'Open a project first' : !deviceId ? 'Select a device first' : 'Run'}
            aria-label="Run"
            data-testid="run-button"
            className="icon-btn text-accent-green hover:text-accent-green"
          >
            <PlayIcon size={12} />
          </button>
        ) : (
          <button
            onClick={() => void actions.stop()}
            disabled={status === 'stopping'}
            data-tip="Stop"
            aria-label="Stop"
            data-testid="stop-button"
            className="icon-btn text-accent-red hover:text-accent-red"
          >
            {status === 'stopping' ? <SpinnerIcon size={12} /> : <StopIcon size={11} />}
          </button>
        )}
        <button
          onClick={() => void actions.hotReload()}
          disabled={!running}
          data-tip="Hot Reload"
          aria-label="Hot Reload"
          data-testid="reload-button"
          className="icon-btn"
        >
          {status === 'reloading' ? <SpinnerIcon size={12} /> : <ZapIcon size={13} />}
        </button>
        <button
          onClick={() => void actions.hotRestart()}
          disabled={!running}
          data-tip="Hot Restart"
          aria-label="Hot Restart"
          data-testid="restart-button"
          className="icon-btn"
        >
          {status === 'restarting' ? <SpinnerIcon size={12} /> : <RestartIcon size={13} />}
        </button>

        <span
          data-testid="status-pill"
          data-status={status}
          className={`ml-2 flex items-center gap-1.5 text-2xs ${live ? 'text-text-secondary' : 'text-text-tertiary'}`}
        >
          {status === 'launching' || status === 'stopping' ? (
            <SpinnerIcon size={10} />
          ) : (
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-accent-green' : 'bg-text-disabled'}`} />
          )}
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/* ── Right: layout ── */}
      <div className="flex flex-1 items-center justify-end gap-px" style={noDrag}>
        {tab === 'workspace' && (
          <>
            <button className="icon-btn" aria-pressed={layout.simulator} onClick={() => toggle('simulator')} data-tip="Simulator (⇧⌘M)" data-testid="toggle-simulator">
              <PhoneIcon size={14} />
            </button>
            <button className="icon-btn" aria-pressed={layout.panel} onClick={() => toggle('panel')} data-tip="Files · Changes · Git · Sessions · Agent (⌘B)" data-testid="toggle-panel">
              <LayoutIcon pane="right" on={layout.panel} />
            </button>
          </>
        )}
        <NotificationCenter />
        <button className="icon-btn" onClick={onOpenSettings} data-tip="Settings (⌘,)" data-testid="open-settings">
          <SettingsIcon size={14} />
        </button>
        {/* Mode buttons stay in the DOM for the automated tests; the menu is what people use. */}
        <button data-testid="tab-workspace" onClick={() => onTab('workspace')} className="hidden" />
        <button data-testid="tab-rtl-lab" onClick={() => onTab('rtl-lab')} className="hidden" />
        <Menu
          align="right"
          width={210}
          trigger={() => (
            <button className="icon-btn" aria-label="More">
              <MoreIcon size={14} />
            </button>
          )}
          items={[
            {
              key: 'reload-on-save',
              label: 'Hot reload on save',
              icon: prefs.reloadOnSave ? <CheckIcon size={12} /> : undefined,
              hint: '⌘S',
              onSelect: () => setSetting('reloadOnSave', !prefs.reloadOnSave),
            },
            'sep',
            { key: 'ws', label: 'Workspace', icon: tab === 'workspace' ? <CheckIcon size={12} /> : undefined, onSelect: () => onTab('workspace') },
            { key: 'rtl', label: 'RTL Lab', icon: tab === 'rtl-lab' ? <CheckIcon size={12} /> : <FlaskIcon size={12} />, onSelect: () => onTab('rtl-lab') },
          ]}
        />
      </div>
    </header>
  )
}
