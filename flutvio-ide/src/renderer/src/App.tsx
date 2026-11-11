/**
 * App.tsx — Flutvio Root Component
 *
 *   [ title bar: project · branch · device · run controls · layout toggles ]
 *   [ Workspace (or RTL Lab)                                               ]
 *   [ status bar                                                           ]
 *
 * Also owns: theme/zoom (lib/appearance), app-menu commands, Settings (⌘,), first-launch
 * onboarding and "What's new". The Flutter controller lives here so the bars share it.
 */

import React, { useEffect, useState } from 'react'
import Workspace from './components/Workspace'
import { DEFAULT_LAYOUT, type Layout } from './lib/layout'
import RTLTestPane from './components/Phase0RTL/RTLTestPane'
import FlutterControlBar from './components/FlutterControlBar/FlutterControlBar'
import StatusBar from './components/StatusBar'
import Toasts from './components/Toast'
import SettingsDialog from './components/settings/SettingsDialog'
import Onboarding, { WhatsNew } from './components/Onboarding'
import { useFlutter } from './hooks/useFlutter'
import { usePersisted } from './lib/usePersisted'
import { startAppearance } from './lib/appearance'
import { useCommand } from './lib/commands'
import { getSettings, setSetting } from './lib/settings'
import { pushToast } from './lib/toastStore'
import { pushNotification } from './lib/notificationStore'

export type Tab = 'workspace' | 'rtl-lab'

startAppearance()

// Dev builds: lets the automated UI test raise toasts and notifications.
if (import.meta.env.DEV) Object.assign(window, { __flutvioDev: { pushToast, pushNotification } })

const ZOOMS = [0.8, 0.9, 1, 1.1, 1.2, 1.3]

export default function App(): React.JSX.Element {
  const flutter = useFlutter()
  const { actions, state } = flutter
  const [tab, setTab] = useState<Tab>('workspace')
  const [layout, setLayout] = usePersisted<Layout>('flutvio.layout.v4', DEFAULT_LAYOUT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'shortcuts' | undefined>(undefined)
  const [onboarding, setOnboarding] = useState(() => !getSettings().onboardingDone)
  const [whatsNew, setWhatsNew] = useState<string | null>(null)

  // "What's new" once per version (not on the very first launch — onboarding covers that).
  useEffect(() => {
    void window.flutvio.ui.appInfo().then((info) => {
      const s = getSettings()
      if (!s.onboardingDone) return
      if (s.lastSeenVersion && s.lastSeenVersion !== info.version) setWhatsNew(info.version)
      if (!s.lastSeenVersion) setSetting('lastSeenVersion', info.version)
    })
  }, [])

  // ── Menu commands handled at the app level ──
  useCommand(['settings', 'shortcuts', 'select-all', 'onboarding', 'whats-new', 'open-project', 'open-recent'], (cmd) => {
    if (cmd.id === 'settings') {
      setSettingsPage(undefined)
      setSettingsOpen(true)
    } else if (cmd.id === 'shortcuts') {
      setSettingsPage('shortcuts')
      setSettingsOpen(true)
    } else if (cmd.id === 'select-all') {
      // Terminals select their own text (TerminalView); everything else gets the standard behaviour.
      if (!document.activeElement?.closest('.xterm')) window.flutvio.ui.selectAll()
    }
    else if (cmd.id === 'onboarding') setOnboarding(true)
    else if (cmd.id === 'whats-new') void window.flutvio.ui.appInfo().then((i) => setWhatsNew(i.version))
    else if (cmd.id === 'open-project') void actions.pickProject()
    else if (cmd.id === 'open-recent') void actions.openProject(cmd.path)
  })
  useCommand(['flutter-terminal', 'focus-terminal'], () => setTab('workspace'))
  useCommand(['toggle-sidebar', 'toggle-panel', 'toggle-simulator', 'toggle-browser', 'toggle-logs', 'toggle-agent'], (cmd) => {
    setTab('workspace')
    setLayout((l) => {
      // ⌘B: the side panel. ⌘J: the side panel on Changes (closes it when already there).
      if (cmd.id === 'toggle-sidebar') return { ...l, panel: !l.panel }
      if (cmd.id === 'toggle-logs') return { ...l, logs: !l.logs }
      if (cmd.id === 'toggle-agent') return l.panel && l.panelTab === 'agent' ? { ...l, panel: false } : { ...l, panel: true, panelTab: 'agent' }
      if (cmd.id === 'toggle-panel') return l.panel && l.panelTab === 'changes' ? { ...l, panel: false } : { ...l, panel: true, panelTab: 'changes' }
      const want = cmd.id === 'toggle-browser' ? 'browser' : 'simulator'
      // Same view open → close the column; otherwise open it on that view.
      if (l.simulator && l.right === want) return { ...l, simulator: false }
      return { ...l, simulator: true, right: want }
    })
  })
  useCommand(['zoom-in', 'zoom-out', 'zoom-reset'], (cmd) => {
    const cur = getSettings().uiScale
    const i = ZOOMS.findIndex((z) => z >= cur - 0.001)
    const next = cmd.id === 'zoom-reset' ? 1 : cmd.id === 'zoom-in' ? ZOOMS[Math.min(ZOOMS.length - 1, i + 1)] : ZOOMS[Math.max(0, i - 1)]
    setSetting('uiScale', next)
  })
  useCommand(['run', 'stop', 'hot-reload', 'hot-restart', 'screenshot'], (cmd) => {
    const st = state.status
    if (cmd.id === 'run' && st === 'idle') void actions.run()
    else if (cmd.id === 'stop' && st !== 'idle') void actions.stop()
    else if (cmd.id === 'hot-reload' && st === 'running') void actions.hotReload()
    else if (cmd.id === 'hot-restart' && st === 'running') void actions.hotRestart()
    else if (cmd.id === 'screenshot') void actions.screenshot()
  })

  return (
    <div className="flex h-full flex-col bg-surface-0 text-text-primary">
      <FlutterControlBar
        flutter={flutter}
        tab={tab}
        onTab={setTab}
        layout={layout}
        onLayout={setLayout}
        onOpenSettings={() => {
          setSettingsPage(undefined)
          setSettingsOpen(true)
        }}
      />
      <div className="min-h-0 flex-1 bg-surface-1">
        {tab === 'workspace' ? <Workspace flutter={flutter} layout={layout} onLayout={setLayout} /> : <RTLTestPane />}
      </div>
      <StatusBar flutter={flutter} onOpenConsole={() => setLayout((l) => ({ ...l, logs: !l.logs }))} />

      <Toasts />

      {settingsOpen && (
        <SettingsDialog
          initialPage={settingsPage}
          onClose={() => setSettingsOpen(false)}
          onShowOnboarding={() => {
            setSettingsOpen(false)
            setOnboarding(true)
          }}
        />
      )}
      {onboarding && (
        <Onboarding
          onOpenProject={async () => {
            await actions.pickProject()
          }}
          onOpenRecent={(p) => void actions.openProject(p)}
          onDone={() => setOnboarding(false)}
        />
      )}
      {whatsNew && !onboarding && (
        <WhatsNew
          version={whatsNew}
          onClose={() => {
            setSetting('lastSeenVersion', whatsNew)
            setWhatsNew(null)
          }}
        />
      )}
    </div>
  )
}
