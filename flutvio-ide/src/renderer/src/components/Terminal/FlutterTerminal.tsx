/**
 * FlutterTerminal.tsx — the Flutter tab: a shell in the project folder with the everyday
 * `flutter` commands one click away (packages, clean, analyze, builds), and the output of the
 * running app beside it. The buttons type the command into the shell, so you see everything
 * and can keep typing yourself.
 */

import React, { useEffect, useRef, useState } from 'react'
import type { FlutterController } from '../../hooks/useFlutter'
import { isShell } from '../../lib/agents'
import { pushToast } from '../../lib/toastStore'
import { FLUTTER_TERM, isPackageSpec } from '../../lib/flutterCommands'
import FlutterConsole from '../FlutterConsole/FlutterConsole'
import Menu from '../Menu'
import TerminalView from './TerminalView'
import { ChevronDownIcon, PackageIcon, PlusIcon, StopIcon, TrashIcon } from '../Icons'

interface Props {
  projectPath: string
  /** The tab is selected. */
  active: boolean
  flutter: FlutterController
  /** Foreground program of the Flutter shell (from the terminal title watcher). */
  process: string | undefined
}

interface Cmd {
  label: string
  command: string
  tip: string
  /** Changes the packages: offer a hot restart afterwards. */
  packages?: boolean
}

const COMMANDS: Cmd[] = [
  { label: 'Pub get', command: 'flutter pub get', tip: 'Download the packages in pubspec.yaml', packages: true },
  { label: 'Upgrade', command: 'flutter pub upgrade', tip: 'Upgrade packages to the newest allowed versions', packages: true },
  { label: 'Outdated', command: 'flutter pub outdated', tip: 'List packages that have newer versions' },
  { label: 'Clean', command: 'flutter clean', tip: 'Delete the build folders' },
  { label: 'Analyze', command: 'flutter analyze', tip: 'Check the whole project for errors' },
  { label: 'Test', command: 'flutter test', tip: 'Run the tests' },
  { label: 'Doctor', command: 'flutter doctor', tip: 'Check the Flutter installation' },
]
const BUILD_RUNNER: Cmd = { label: 'Build runner', command: 'dart run build_runner build --delete-conflicting-outputs', tip: 'Generate code (build_runner)' }
const BUILDS: Array<{ label: string; command: string }> = [
  { label: 'Android APK', command: 'flutter build apk' },
  { label: 'Android App Bundle', command: 'flutter build appbundle' },
  { label: 'iOS (ipa)', command: 'flutter build ipa' },
  { label: 'Web', command: 'flutter build web' },
  { label: 'macOS', command: 'flutter build macos' },
]

export default function FlutterTerminal({ projectPath, active, flutter, process }: Props): React.JSX.Element {
  const [view, setView] = useState<'terminal' | 'output'>('terminal')
  const [pkg, setPkg] = useState('')
  const [pkgError, setPkgError] = useState(false)
  const [hasBuildRunner, setHasBuildRunner] = useState(false)
  const busy = !isShell(process)
  /** A package command we started and are waiting on. */
  const pending = useRef<Cmd | null>(null)
  const wasBusy = useRef(false)
  const status = useRef(flutter.state.status)
  status.current = flutter.state.status
  const errors = flutter.logs.reduce((n, l) => n + (l.error ? 1 : 0), 0)

  useEffect(() => {
    let alive = true
    window.flutvio.files
      .read(`${projectPath}/pubspec.yaml`)
      .then((f) => alive && setHasBuildRunner(/^\s*build_runner\s*:/m.test(f.content)))
      .catch(() => alive && setHasBuildRunner(false))
    return () => {
      alive = false
    }
  }, [projectPath, busy])

  // A package command ended while the app runs → new packages need a restart to load.
  useEffect(() => {
    if (busy) {
      wasBusy.current = true
      return
    }
    if (!wasBusy.current) return
    wasBusy.current = false
    const done = pending.current
    pending.current = null
    if (done?.packages && status.current === 'running')
      pushToast({ kind: 'info', title: 'Packages changed', text: 'Restart the app to load them.', action: { label: 'Hot restart', run: () => void flutter.actions.hotRestart() } })
  }, [busy, flutter.actions])

  const run = (cmd: Cmd): void => {
    if (busy) return
    setView('terminal')
    pending.current = cmd
    window.flutvio.pty.write(FLUTTER_TERM, `${cmd.command}\r`)
  }

  const addPackage = (e: React.FormEvent): void => {
    e.preventDefault()
    const v = pkg.trim().replace(/\s+/g, ' ')
    if (!v) return
    if (!isPackageSpec(v)) {
      setPkgError(true)
      window.setTimeout(() => setPkgError(false), 300)
      return
    }
    run({ label: 'Add', command: `flutter pub add ${v}`, tip: '', packages: true })
    setPkg('')
  }

  const chip = 'flex h-6 flex-shrink-0 items-center gap-1 rounded-md border border-border-subtle px-2 text-2xs text-text-secondary transition-colors hover:border-border-default hover:bg-surface-4 hover:text-text-primary disabled:pointer-events-none disabled:opacity-40'

  return (
    <div className="flex h-full flex-col" data-testid="flutter-terminal">
      <div className="flex h-9 flex-shrink-0 items-center gap-1.5 border-b border-border-subtle pl-3 pr-2">
        {/* Terminal | Run output */}
        <div className="mr-1 flex flex-shrink-0 rounded-md bg-surface-4/60 p-0.5 text-2xs">
          {(['terminal', 'output'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              data-testid={`flutter-view-${v}`}
              className={`flex h-5 items-center gap-1.5 rounded px-2 ${view === v ? 'bg-surface-3 text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              {v === 'terminal' ? 'Commands' : 'Run output'}
              {v === 'output' && errors > 0 && <span className="rounded-full bg-accent-red/15 px-1 leading-[13px] text-accent-red">{errors}</span>}
            </button>
          ))}
        </div>

        {view === 'terminal' ? (
          <>
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {[...COMMANDS.slice(0, 5), ...(hasBuildRunner ? [BUILD_RUNNER] : []), ...COMMANDS.slice(5)].map((c) => (
                <button key={c.label} onClick={() => run(c)} disabled={busy} title={`${c.tip}\n${c.command}`} className={chip} data-testid={`flutter-cmd-${c.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  {c.label}
                </button>
              ))}
              <Menu
                width={190}
                trigger={() => (
                  <button disabled={busy} className={chip}>
                    Build <ChevronDownIcon size={10} />
                  </button>
                )}
                items={BUILDS.map((b) => ({ key: b.label, label: b.label, hint: <span className="font-mono">{b.command.replace('flutter build ', '')}</span>, onSelect: () => run({ label: b.label, command: b.command, tip: '' }) }))}
              />
            </div>
            <form onSubmit={addPackage} className={`flex h-6 flex-shrink-0 items-center rounded-md border pl-1.5 focus-within:border-accent-blue/60 ${pkgError ? 'animate-shake border-accent-red/70' : 'border-border-subtle'}`}>
              <PackageIcon size={11} className="flex-shrink-0 text-text-tertiary" />
              <input
                value={pkg}
                onChange={(e) => setPkg(e.target.value)}
                disabled={busy}
                placeholder="Add package…"
                spellCheck={false}
                title="Package name from pub.dev, e.g. dio or dio:^5.4.0 — Enter runs flutter pub add"
                data-testid="flutter-add-package"
                className="h-full w-[108px] bg-transparent px-1.5 font-mono text-2xs text-text-primary outline-none placeholder:font-sans placeholder:text-text-disabled"
              />
              <button type="submit" disabled={busy || !pkg.trim()} aria-label="Add package" className="flex h-full w-6 items-center justify-center text-text-tertiary hover:text-text-primary disabled:opacity-30">
                <PlusIcon size={11} />
              </button>
            </form>
            {busy && (
              <button onClick={() => window.flutvio.pty.write(FLUTTER_TERM, '\x03')} data-tip="Stop (⌃C)" className="icon-btn h-6 w-6 text-accent-red hover:text-accent-red" data-testid="flutter-stop">
                <StopIcon size={10} />
              </button>
            )}
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-2xs text-text-tertiary">{flutter.progress ?? 'What the running app prints (flutter run).'}</span>
            <button onClick={flutter.actions.clearLogs} data-tip="Clear" className="icon-btn h-6 w-6">
              <TrashIcon size={11} />
            </button>
          </>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {/* The shell stays mounted under the output view. */}
        <div className="absolute inset-0 pb-1 pl-3.5 pr-1.5 pt-2" style={view === 'terminal' ? undefined : { visibility: 'hidden' }}>
          <TerminalView id={FLUTTER_TERM} cwd={projectPath} active={active && view === 'terminal'} key={`${FLUTTER_TERM}:${projectPath}`} />
        </div>
        {view === 'output' && (
          <div className="absolute inset-0 pt-2">
            <FlutterConsole logs={flutter.logs} progress={flutter.progress} />
          </div>
        )}
      </div>
    </div>
  )
}
