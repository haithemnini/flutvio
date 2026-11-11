/**
 * Workspace.tsx — main screen, terminal first (cmux style).
 *
 *   [ terminals — the whole centre | simulator (+ Logs drawer) | side panel ]
 *
 * Opening a project shows the terminal and the simulator, nothing else. The terminal is where
 * any coding agent runs; its tab is named after what runs in it. Files, Changes, Git and
 * Sessions live in the side panel (hidden until asked for); the editor is a centre tab that
 * exists only while files are open; Flutter's output is a drawer under the simulator.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentMonitorData } from '../../../shared/flutvio-api'
import type { FlutterController } from '../hooks/useFlutter'
import { usePersisted } from '../lib/usePersisted'
import { getSettings } from '../lib/settings'
import { useTheme } from '../lib/appearance'
import { terminalTheme } from '../lib/themes'
import { useCommand } from '../lib/commands'
import FlutterConsole from './FlutterConsole/FlutterConsole'
import SimulatorPanel from './Simulator/SimulatorPanel'
import BrowserPanel from './Browser/BrowserPanel'
import TerminalView from './Terminal/TerminalView'
import FlutterTerminal from './Terminal/FlutterTerminal'
import { FLUTTER_TERM } from '../lib/flutterCommands'
import { agentName, compactNumber, contextTone, isAgent, isShell as isShellProcess, processColor } from '../lib/agents'
import { pushToast } from '../lib/toastStore'
import { markTermRead, pushNotification, recentlyNotified } from '../lib/notificationStore'
import EditorArea from './Editor/EditorArea'
import SidePanel from './SidePanel'
import type { Layout } from '../lib/layout'
import Splitter from './Splitter'
import { ChevronRightIcon, CodeIcon, FlutterIcon, GlobeIcon, PhoneIcon, PlusIcon, SpinnerIcon, SplitIcon, TerminalIcon, TrashIcon, XIcon } from './Icons'

interface TermTab {
  id: string
  /** Name given when the tab was opened for something specific (a resumed session). */
  label?: string
  command?: string
}

const MAIN_TERM: TermTab = { id: 'main' }
const MAX_SPLIT = 4
/** A plain command that ran at least this long is worth a notification when it ends. */
const LONG_COMMAND_MS = 20_000
let termSeq = 1

interface Props {
  flutter: FlutterController
  layout: Layout
  onLayout: React.Dispatch<React.SetStateAction<Layout>>
}

export default function Workspace({ flutter, layout, onLayout }: Props): React.JSX.Element {
  const { state, devices, logs, progress, actions } = flutter
  const theme = useTheme()
  const termBg = terminalTheme(theme).background

  const [sizes, setSizes] = usePersisted('flutvio.sizes.v3', { panel: 300, simulator: 400, logs: 220 })
  const [changes, setChanges] = useState(0)
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const [terms, setTerms] = useState<TermTab[]>([MAIN_TERM])
  /** Terminals shown side by side (empty = one at a time). */
  const [split, setSplit] = useState<string[]>([])
  /** Foreground process per terminal (from the main process). */
  const [running, setRunning] = useState<Record<string, string>>({})
  /** Terminals that rang the bell while not in view. */
  const [attention, setAttention] = useState<Record<string, boolean>>({})
  /** Terminals whose agent is in the middle of a turn. */
  const [working, setWorking] = useState<Record<string, boolean>>({})
  /** The Flutter tab's shell starts the first time the tab is opened. */
  const [flutterOpened, setFlutterOpened] = useState(false)
  /** Live data of the agent in the terminal in view (context meter, Agent panel). */
  const [agentData, setAgentData] = useState<AgentMonitorData | null>(null)

  const device = devices.find((d) => d.id === state.deviceId)
  const simUdid = device && device.emulator && device.platform.startsWith('ios') ? device.id : null
  const projectPath = state.project?.path ?? null

  // Opening another project closes the files and extra terminals of the previous one,
  // and lands on its shell.
  useEffect(() => {
    setOpenFiles([])
    setActiveFile(null)
    setTerms((ts) => {
      for (const t of ts) if (t.id !== MAIN_TERM.id) void window.flutvio.pty.kill(t.id)
      return [MAIN_TERM]
    })
    setSplit([])
    setRunning({})
    setAttention({})
    setWorking({})
    setFlutterOpened(false)
    void window.flutvio.pty.kill(FLUTTER_TERM)
    onLayout((l) => (l.center === MAIN_TERM.id ? l : { ...l, center: MAIN_TERM.id }))
  }, [projectPath, onLayout])

  // What the notifications need to know, readable from event handlers.
  const view = useRef({ center: layout.center, split, terms, running, projectName: state.project?.name ?? '' })
  view.current = { center: layout.center, split, terms, running, projectName: state.project?.name ?? '' }
  const startedAt = useRef<Record<string, number>>({})

  /** Is this terminal on screen with the window in front? (then nothing needs announcing) */
  const inView = (id: string): boolean => {
    const v = view.current
    return document.hasFocus() && (v.center === id || (v.split.includes(id) && v.split.includes(v.center)))
  }
  const tabLabel = (id: string): string => (id === FLUTTER_TERM ? 'Flutter' : (view.current.terms.find((t) => t.id === id)?.label ?? view.current.projectName))

  /** Something happened in a terminal the user is not looking at: dot on the tab, bell, toast, macOS notification. */
  const announce = (id: string, kind: 'done' | 'attention' | 'command', process: string, title: string): void => {
    if (inView(id)) return
    const body = tabLabel(id)
    setAttention((a) => (a[id] ? a : { ...a, [id]: true }))
    pushNotification({ kind, title, body, term: id, process })
    if (document.hasFocus()) pushToast({ kind: kind === 'attention' ? 'warn' : 'ok', title, text: body, action: { label: 'Show', run: () => setCenterRef.current(id) } })
    else window.flutvio.ui.notify({ title, body, term: id })
  }
  const announceRef = useRef(announce)
  announceRef.current = announce

  useEffect(
    () =>
      window.flutvio.pty.onTitle((id, title) => {
        const prev = view.current.running[id]
        const now = Date.now()
        // A plain long command (a build, tests…) ended while you were elsewhere.
        if (prev && !isShellProcess(prev) && !isAgent(prev) && isShellProcess(title) && now - (startedAt.current[id] ?? now) >= LONG_COMMAND_MS)
          announceRef.current(id, 'command', prev, `${prev} finished`)
        if (!isShellProcess(title) && isShellProcess(prev)) startedAt.current[id] = now
        if (!isAgent(title)) setWorking((w) => (w[id] ? { ...w, [id]: false } : w))
        setRunning((r) => (r[id] === title ? r : { ...r, [id]: title }))
      }),
    [],
  )

  // An agent started or finished a turn.
  useEffect(
    () =>
      window.flutvio.agent.onActivity((id, activity) => {
        setWorking((w) => (Boolean(w[id]) === (activity === 'working') ? w : { ...w, [id]: activity === 'working' }))
        const process = view.current.running[id] ?? ''
        if (activity === 'idle' && isAgent(process)) announceRef.current(id, 'done', process, `${agentName(process)} finished`)
      }),
    [],
  )

  /** The program rang the bell: an agent asking for you (unless it just said it finished). */
  const onBell = useCallback((id: string): void => {
    const process = view.current.running[id] ?? ''
    if (isAgent(process)) {
      if (!recentlyNotified(id, 4000)) announceRef.current(id, 'attention', process, `${agentName(process)} needs you`)
    } else if (!inView(id)) setAttention((a) => (a[id] ? a : { ...a, [id]: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setCenter = useCallback(
    (center: string): void => {
      onLayout((l) => (l.center === center ? l : { ...l, center }))
      setAttention((a) => (a[center] ? { ...a, [center]: false } : a))
      markTermRead(center)
    },
    [onLayout],
  )
  const setCenterRef = useRef(setCenter)
  setCenterRef.current = setCenter

  // Coming back to the window reads what was said about the terminal in view.
  useEffect(() => {
    const onFocus = (): void => {
      const id = view.current.center
      setAttention((a) => (a[id] ? { ...a, [id]: false } : a))
      markTermRead(id)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    if (layout.center === FLUTTER_TERM) setFlutterOpened(true)
  }, [layout.center])

  const openFile = useCallback(
    (path: string) => {
      setOpenFiles((files) => (files.includes(path) ? files : [...files, path]))
      setActiveFile(path)
      onLayout((l) => ({ ...l, center: 'editor' }))
    },
    [onLayout],
  )

  const activeTerm = terms.some((t) => t.id === layout.center) ? layout.center : null
  /** Terminal to fall back to when the editor closes. */
  const [lastTerm, setLastTerm] = useState(MAIN_TERM.id)
  useEffect(() => {
    if (activeTerm) setLastTerm(activeTerm)
  }, [activeTerm])

  const closeFile = (path: string): void => {
    const i = openFiles.indexOf(path)
    const next = openFiles.filter((f) => f !== path)
    setOpenFiles(next)
    if (path === activeFile) setActiveFile(next[Math.min(i, next.length - 1)] ?? null)
    if (!next.length) setCenter(terms.some((t) => t.id === lastTerm) ? lastTerm : MAIN_TERM.id)
  }

  /** Opens a terminal tab (optionally running `command`, e.g. resuming a session). */
  const launch = useCallback(
    (label?: string, command?: string): void => {
      const tab: TermTab = { id: `t${termSeq++}`, label, command }
      setTerms((ts) => [...ts, tab])
      setCenter(tab.id)
    },
    [setCenter],
  )

  // Menu: File › New Terminal / Open File… · Terminal › Flutter Terminal · a notification was clicked
  useCommand(['new-terminal', 'open-file', 'flutter-terminal', 'focus-terminal'], (cmd) => {
    if (cmd.id === 'new-terminal') launch()
    else if (cmd.id === 'flutter-terminal') setCenter(FLUTTER_TERM)
    else if (cmd.id === 'focus-terminal') {
      if (cmd.term === FLUTTER_TERM || terms.some((t) => t.id === cmd.term)) setCenter(cmd.term)
    } else
      void window.flutvio.ui.openFileDialog().then((path) => {
        if (path) openFile(path)
      })
  })

  // Menu / keys: Terminal › Split, Next / Previous Tab, Go to Tab n, File › Close Tab (⌘W).
  useCommand(['split-terminal', 'next-tab', 'prev-tab', 'select-tab', 'close-tab'], (cmd) => {
    const tabs = [...terms.map((t) => t.id), FLUTTER_TERM, ...(openFiles.length ? ['editor'] : [])]
    const i = Math.max(0, tabs.indexOf(layout.center))
    if (cmd.id === 'split-terminal') splitTerm()
    else if (cmd.id === 'next-tab') setCenter(tabs[(i + 1) % tabs.length])
    else if (cmd.id === 'prev-tab') setCenter(tabs[(i - 1 + tabs.length) % tabs.length])
    else if (cmd.id === 'select-tab') {
      if (tabs[cmd.index]) setCenter(tabs[cmd.index])
    } else if (cmd.id === 'close-tab' && activeTerm && terms.length > 1) closeTerm(activeTerm) // the editor closes its own tabs
  })

  const closeTerm = (id: string): void => {
    void window.flutvio.pty.kill(id)
    const i = terms.findIndex((t) => t.id === id)
    const next = terms.filter((t) => t.id !== id)
    setTerms(next)
    const nextSplit = split.filter((x) => x !== id)
    setSplit(nextSplit.length > 1 ? nextSplit : [])
    if (layout.center === id) setCenter(nextSplit[0] ?? next[Math.max(0, i - 1)]?.id ?? MAIN_TERM.id)
  }
  /** Adds a new shell beside the visible one(s). */
  const splitTerm = (): void => {
    const base = split.length && activeTerm && split.includes(activeTerm) ? split : activeTerm ? [activeTerm] : []
    if (!base.length || base.length >= MAX_SPLIT) return
    const tab: TermTab = { id: `t${termSeq++}` }
    setTerms((ts) => [...ts, tab])
    setSplit([...base, tab.id])
    setCenter(tab.id)
  }

  // Visible terminals: the split group when the active one is in it, else just the active one.
  // Under the editor the last terminal stays laid out (so it keeps its size).
  const shownFor = activeTerm ?? lastTerm
  const shown = split.includes(shownFor) ? split : [shownFor]
  const canSplit = Boolean(activeTerm) && shown.length < MAX_SPLIT
  const editorOpen = layout.center === 'editor' && openFiles.length > 0
  const flutterTab = layout.center === FLUTTER_TERM

  // The agent monitor follows the terminal in view (the last one, under the editor / Flutter tab).
  const watchTerm = isAgent(running[shownFor]) ? shownFor : null
  useEffect(() => {
    let alive = true
    setAgentData(null)
    void window.flutvio.agent.watch(watchTerm).then((d) => alive && setAgentData(d))
    const off = window.flutvio.agent.onData((d) => {
      if (d.termId === watchTerm) setAgentData(d)
    })
    return () => {
      alive = false
      off()
    }
  }, [watchTerm])
  const ctx = agentData?.session?.contextTokens ? Math.min(100, Math.round((agentData.session.contextTokens / agentData.session.contextWindow) * 100)) : null
  const errorCount = logs.reduce((n, l) => n + (l.error ? 1 : 0), 0)
  const lastLog = logs.length ? logs[logs.length - 1] : null

  if (!projectPath) {
    return (
      <div className="flex h-full min-h-0">
        <main className="min-w-0 flex-1">
          <EditorArea
            projectPath={null}
            files={[]}
            active={null}
            onActivate={setActiveFile}
            onOpen={openFile}
            onClose={closeFile}
            onSaved={() => undefined}
            onOpenProject={() => void actions.pickProject()}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Centre: terminals (and the editor while files are open) ── */}
      <main className="flex min-w-[280px] flex-1 flex-col" style={{ background: termBg }} data-testid="terminal-area">
        <div className="flex h-8 flex-shrink-0 items-stretch border-b border-border-subtle pr-1.5">
          <div className="no-scrollbar flex min-w-0 items-stretch overflow-x-auto" role="tablist">
            {terms.map((t) => {
              const proc = running[t.id] ?? ''
              const isShell = isShellProcess(proc)
              const name = isShell ? (t.label ?? (proc || 'zsh')) : proc
              return (
                <CenterTab
                  key={t.id}
                  active={activeTerm === t.id}
                  onClick={() => setCenter(t.id)}
                  onClose={terms.length > 1 ? () => closeTerm(t.id) : undefined}
                  title={t.label && !isShell ? `${proc} — ${t.label}` : undefined}
                  testId="term-tab"
                  process={proc}
                  activity={working[t.id] ? 'working' : 'idle'}
                >
                  {isShell ? (
                    <TerminalIcon size={12} className="flex-shrink-0 opacity-70" />
                  ) : (
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${working[t.id] ? 'animate-pulseDot' : ''}`} style={{ background: processColor(proc) }} />
                  )}
                  <span dir="auto" className="max-w-[180px] truncate">
                    {name}
                  </span>
                  {attention[t.id] && activeTerm !== t.id && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-orange" data-tip="Needs attention" />}
                </CenterTab>
              )
            })}
            <CenterTab active={flutterTab} onClick={() => setCenter(FLUTTER_TERM)} testId="flutter-tab" process={running[FLUTTER_TERM]} title="Flutter commands and the app's output (⇧⌘F)">
              <FlutterIcon size={11} className={`flex-shrink-0 ${flutterTab ? 'text-[#54c5f8]' : 'opacity-70'}`} />
              Flutter
              {!isShellProcess(running[FLUTTER_TERM]) && <SpinnerIcon size={9} className="flex-shrink-0 text-text-tertiary" />}
              {attention[FLUTTER_TERM] && !flutterTab && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-orange" data-tip="Finished" />}
            </CenterTab>
            {openFiles.length > 0 && (
              <CenterTab active={editorOpen} onClick={() => setCenter('editor')} testId="center-editor">
                <CodeIcon size={12} className="flex-shrink-0 opacity-70" />
                Editor
                <span className="text-text-tertiary">{openFiles.length}</span>
              </CenterTab>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-px pl-1">
            <button onClick={() => launch()} data-tip="New terminal" className="icon-btn h-6 w-6" data-testid="new-terminal">
              <PlusIcon size={13} />
            </button>
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center gap-1">
            {ctx !== null && agentData && (
              <button
                onClick={() => onLayout((l) => ({ ...l, panel: true, panelTab: 'agent' }))}
                title={`${agentName(agentData.agent)} context: ${compactNumber(agentData.session!.contextTokens)} of ${compactNumber(agentData.session!.contextWindow)} tokens — click for details`}
                data-testid="context-meter"
                data-percent={ctx}
                className="flex h-6 items-center gap-1.5 rounded px-1.5 text-2xs text-text-tertiary hover:bg-surface-4 hover:text-text-primary"
              >
                <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-4">
                  <span className={`block h-full rounded-full ${contextTone(ctx).bar}`} style={{ width: `${Math.max(4, ctx)}%` }} />
                </span>
                <span className="tabular-nums">{ctx}%</span>
              </button>
            )}
            {agentData?.session?.limit && (
              <button
                onClick={() => onLayout((l) => ({ ...l, panel: true, panelTab: 'agent' }))}
                className="flex h-5 items-center rounded-full bg-accent-red/15 px-2 text-[10.5px] font-medium text-accent-red"
                data-testid="limit-pill"
              >
                Limit reached
              </button>
            )}
            <button onClick={splitTerm} disabled={!canSplit} data-tip="Split terminal" className="icon-btn h-6 w-6" data-testid="split-terminal">
              <SplitIcon size={12} />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {/* Every terminal stays mounted (shell, agent and history survive). */}
          {terms.map((t) => {
            const i = shown.indexOf(t.id)
            const n = shown.length
            return (
              <div
                key={t.id}
                className={`absolute inset-y-0 pb-1 pl-3.5 pr-1.5 pt-2 transition-opacity ${n > 1 && i > 0 ? 'border-l border-border-subtle' : ''}`}
                style={{
                  left: `${((i >= 0 ? i : 0) * 100) / n}%`,
                  width: `${100 / n}%`,
                  visibility: i >= 0 ? 'visible' : 'hidden',
                  opacity: n > 1 && activeTerm !== t.id ? 0.55 : 1,
                }}
                onFocusCapture={() => layout.center !== t.id && !editorOpen && setCenter(t.id)}
              >
                <TerminalView
                  id={t.id}
                  cwd={projectPath}
                  command={t.command}
                  active={activeTerm === t.id}
                  onBell={() => onBell(t.id)}
                  key={`${t.id}:${projectPath}`}
                />
              </div>
            )
          })}
          {/* The Flutter tab: its own shell with the everyday commands, and the app's output. */}
          {flutterOpened && (
            <div className="absolute inset-0" style={{ background: termBg, zIndex: flutterTab ? 4 : -1, visibility: flutterTab ? 'visible' : 'hidden' }} aria-hidden={!flutterTab}>
              <FlutterTerminal projectPath={projectPath} active={flutterTab} flutter={flutter} process={running[FLUTTER_TERM]} />
            </div>
          )}
          {/* The editor covers the terminals while its tab is selected; it stays mounted. */}
          <div
            className="absolute inset-0 bg-surface-1"
            style={{ zIndex: editorOpen ? 5 : -1, visibility: editorOpen ? 'visible' : 'hidden' }}
            aria-hidden={!editorOpen}
          >
            <EditorArea
              projectPath={projectPath}
              files={openFiles}
              active={activeFile}
              onActivate={setActiveFile}
              onOpen={openFile}
              onClose={closeFile}
              onSaved={(path) => {
                setTreeKey((k) => k + 1)
                // Hot reload on save: Dart files, app running, preference on.
                if (path.endsWith('.dart') && state.status === 'running' && getSettings().reloadOnSave) void actions.hotReload()
              }}
              onOpenProject={() => void actions.pickProject()}
              visible={editorOpen}
            />
          </div>
        </div>
      </main>

      {/* ── Right column: Simulator / Browser (only while asked for) and the Flutter Logs drawer ──
          Nothing here runs unless it is showing: closing the simulator stops the mirror. */}
      {(layout.simulator || layout.logs) && (
        <>
          <Splitter dir="x" invert visible size={sizes.simulator} min={280} max={820} onResize={(simulator) => setSizes((s) => ({ ...s, simulator }))} />
          <div style={{ width: sizes.simulator }} className="flex flex-shrink-0 flex-col bg-surface-1" data-testid="right-column">
            {layout.simulator && (
              <div className="relative min-h-0 flex-1">
                {layout.right === 'browser' ? (
                  <BrowserPanel leading={<RightSwitch value="browser" onChange={(right) => onLayout((l) => ({ ...l, right }))} />} />
                ) : (
                  <SimulatorPanel
                    preferredUdid={simUdid}
                    onScreenshot={() => void actions.screenshot()}
                    screenshotBusy={flutter.screenshotBusy}
                    leading={<RightSwitch value="simulator" onChange={(right) => onLayout((l) => ({ ...l, right }))} />}
                    onClose={() => onLayout((l) => ({ ...l, simulator: false }))}
                  />
                )}
              </div>
            )}

            {/* Logs: one quiet line when closed, the full Flutter output when open. */}
            {layout.logs && layout.simulator && (
              <Splitter dir="y" invert size={sizes.logs} min={90} max={640} onResize={(v) => setSizes((s) => ({ ...s, logs: v }))} />
            )}
            <div
              className={`flex flex-col ${layout.simulator ? 'flex-shrink-0 border-t border-border-subtle' : 'min-h-0 flex-1'}`}
              style={layout.logs && layout.simulator ? { height: sizes.logs } : undefined}
            >
              <div className={`flex flex-shrink-0 items-center gap-1.5 pl-1.5 pr-1.5 text-[11px] ${layout.simulator ? 'h-[26px]' : 'h-8 border-b border-border-subtle'}`}>
                <button
                  onClick={() => onLayout((l) => ({ ...l, logs: !l.logs }))}
                  data-testid="console-toggle"
                  aria-expanded={layout.logs}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-text-tertiary hover:text-text-primary"
                >
                  <ChevronRightIcon size={10} className={`flex-shrink-0 transition-transform ${layout.logs ? 'rotate-90' : ''}`} />
                  <span className="flex-shrink-0 font-medium">Logs</span>
                  {progress ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-accent-orange">
                      <SpinnerIcon size={9} className="flex-shrink-0" />
                      <span dir="auto" className="truncate">
                        {progress}
                      </span>
                    </span>
                  ) : (
                    !layout.logs &&
                    lastLog && (
                      <span dir="auto" className={`min-w-0 truncate font-mono ${lastLog.error ? 'text-accent-red' : 'text-text-disabled'}`}>
                        {lastLog.text}
                      </span>
                    )
                  )}
                </button>
                {errorCount > 0 && (
                  <span className="flex-shrink-0 rounded-full bg-accent-red/15 px-1.5 leading-4 text-accent-red" data-tip="Errors in the output">
                    {errorCount}
                  </span>
                )}
                {layout.logs && (
                  <button onClick={actions.clearLogs} data-tip="Clear" className="icon-btn h-5 w-5">
                    <TrashIcon size={11} />
                  </button>
                )}
              </div>
              {layout.logs && (
                <div className="min-h-0 flex-1">
                  <FlutterConsole logs={logs} progress={progress} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Side panel: Files · Changes · Git · Sessions (kept mounted while hidden) ── */}
      {layout.panel && <Splitter dir="x" invert visible size={sizes.panel} min={220} max={900} onResize={(panel) => setSizes((s) => ({ ...s, panel }))} />}
      <div style={{ width: sizes.panel, display: layout.panel ? undefined : 'none' }} className="flex-shrink-0 bg-surface-2">
        <SidePanel
          projectPath={projectPath}
          projectName={state.project?.name ?? ''}
          visible={layout.panel}
          tab={layout.panelTab}
          onTab={(panelTab) => onLayout((l) => ({ ...l, panel: true, panelTab }))}
          onClose={() => onLayout((l) => ({ ...l, panel: false }))}
          activeFile={activeFile}
          onOpen={openFile}
          treeKey={treeKey}
          onRefreshTree={() => setTreeKey((k) => k + 1)}
          changes={changes}
          onChanges={setChanges}
          onLaunch={launch}
          agent={agentData}
          onAgentSend={(text) => {
            if (!watchTerm) return
            window.flutvio.pty.write(watchTerm, `${text}\r`)
            setCenter(watchTerm)
          }}
        />
      </div>

    </div>
  )
}

/** A tab of the centre strip: flat, with a thin accent line under the selected one. */
function CenterTab({
  active,
  onClick,
  onClose,
  children,
  testId,
  title,
  process,
  activity,
}: {
  active: boolean
  onClick: () => void
  onClose?: () => void
  children: React.ReactNode
  testId?: string
  title?: string
  process?: string
  activity?: string
}): React.JSX.Element {
  return (
    <div
      onClick={onClick}
      onAuxClick={(e) => {
        if (e.button === 1 && onClose) onClose()
      }}
      data-testid={testId}
      data-process={process}
      data-activity={activity}
      aria-selected={active}
      role="tab"
      title={title}
      className={`group relative flex flex-shrink-0 cursor-default items-center gap-1.5 pl-3 text-xs transition-colors ${onClose ? 'pr-1.5' : 'pr-3'} ${
        active ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
      }`}
    >
      {children}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label="Close terminal"
          className={`rounded p-0.5 hover:bg-surface-4 ${active ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <XIcon size={10} />
        </button>
      )}
      {active && <span className="absolute inset-x-2 bottom-0 h-[1.5px] rounded-full bg-accent-blue" />}
    </div>
  )
}

/** Simulator / Browser switch at the start of the right column's header. */
function RightSwitch({ value, onChange }: { value: Layout['right']; onChange: (v: Layout['right']) => void }): React.JSX.Element {
  return (
    <div className="mr-1 flex items-center gap-px">
      <button className="icon-btn" aria-pressed={value === 'simulator'} onClick={() => onChange('simulator')} data-tip="Simulator" data-testid="right-simulator">
        <PhoneIcon size={13} />
      </button>
      <button className="icon-btn" aria-pressed={value === 'browser'} onClick={() => onChange('browser')} data-tip="Browser" data-testid="right-browser">
        <GlobeIcon size={13} />
      </button>
    </div>
  )
}
