/**
 * Onboarding.tsx — first launch: welcome → theme → tools check → open a project.
 * Also WhatsNew: shown once after the app version changes.
 */

import React, { useEffect, useState } from 'react'
import type { ToolCheck } from '../../../shared/flutvio-api'
import { setSetting } from '../lib/settings'
import ThemePicker from './settings/ThemePicker'
import { ToolList } from './settings/SettingsDialog'
import { BranchIcon, CheckIcon, ChevronRightIcon, FlutterIcon, FlutvioAppIcon, FolderIcon, FolderOpenIcon, PlusIcon, RefreshIcon, SpinnerIcon } from './Icons'

const STEPS = ['Welcome', 'Theme', 'Tools', 'Start'] as const

interface Props {
  onOpenProject: () => Promise<void>
  onOpenRecent: (path: string) => void
  onDone: () => void
}

export default function Onboarding({ onOpenProject, onOpenRecent, onDone }: Props): React.JSX.Element {
  const [step, setStepRaw] = useState(0)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const setStep = (next: number): void => {
    setDir(next >= step ? 'fwd' : 'back')
    setStepRaw(next)
  }
  const [tools, setTools] = useState<ToolCheck[] | null>(null)
  const [recent, setRecent] = useState<string[]>([])

  const check = (): void => {
    setTools(null)
    window.flutvio.ui.checkTools().then(setTools).catch(() => setTools([]))
  }
  useEffect(() => {
    check()
    window.flutvio.ui.recentProjects().then(setRecent).catch(() => undefined)
  }, [])

  const finish = (): void => {
    setSetting('onboardingDone', true)
    void window.flutvio.ui.appInfo().then((i) => setSetting('lastSeenVersion', i.version))
    onDone()
  }

  const missing = tools?.filter((t) => t.required && !t.ok) ?? []

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-surface-0" data-testid="onboarding">
      <div className="drag absolute inset-x-0 top-0 h-9" />
      <div className="flex w-[min(560px,90vw)] flex-col">
        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1 rounded-full transition-all ${i === step ? 'w-6 bg-accent-blue' : i < step ? 'w-3 bg-text-tertiary' : 'w-3 bg-surface-4'}`} />
          ))}
        </div>

        <div className={`min-h-[400px] ${dir === 'fwd' ? 'animate-slideFromRight' : 'animate-slideFromLeft'}`} key={step}>
          {step === 0 && (
            <div className="flex flex-col items-center pt-6 text-center">
              <FlutvioAppIcon size={72} />
              <h1 className="mt-5 text-xl font-semibold text-text-primary">Welcome to Flutvio</h1>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-text-secondary">
                A calm workspace for Flutter: your code, the iOS Simulator, terminals and coding agents in one window.
              </p>
              <ul className="mt-7 space-y-2 text-left text-xs text-text-secondary">
                <li>• Edit Dart with completion, errors and format on save</li>
                <li>• Mirror the Xcode Simulator right next to your code</li>
                <li>• Hot reload on save, git worktrees, split terminals</li>
                <li>• Resume Claude Code, OpenCode, Codex and Gemini sessions</li>
              </ul>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-base font-semibold text-text-primary">Choose a look</h2>
              <p className="mb-6 mt-1 text-xs text-text-tertiary">You can change it any time in Settings (⌘,).</p>
              <ThemePicker size="lg" />
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-start">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Your tools</h2>
                  <p className="mt-1 text-xs text-text-tertiary">Flutvio uses what is already installed on your Mac.</p>
                </div>
                <button onClick={check} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-2xs text-text-secondary hover:bg-surface-4">
                  <RefreshIcon size={11} /> Check again
                </button>
              </div>
              <div className="mt-3 max-h-[300px] overflow-y-auto">
                <ToolList tools={tools} />
              </div>
              {missing.length > 0 && (
                <p className="mt-2 text-2xs text-accent-orange">
                  Missing: {missing.map((t) => t.name).join(', ')}. You can continue and install them later.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <GetStarted
              recent={recent}
              onOpenProject={() => void onOpenProject().then(finish)}
              onOpenPath={(p) => {
                onOpenRecent(p)
                finish()
              }}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center">
          {step > 0 ? (
            <button onClick={() => setStep(step - 1)} className="h-8 rounded-md px-3 text-xs text-text-secondary hover:bg-surface-4">
              Back
            </button>
          ) : (
            <button onClick={finish} className="h-8 rounded-md px-3 text-xs text-text-tertiary hover:bg-surface-4" data-testid="onboarding-skip">
              Skip
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(step + 1)} className="ml-auto h-8 rounded-md bg-text-primary px-4 text-xs font-medium text-surface-0 hover:opacity-90" data-testid="onboarding-next">
              Continue
            </button>
          ) : (
            <button onClick={finish} className="ml-auto h-8 rounded-md px-3 text-xs text-text-tertiary hover:bg-surface-4 hover:text-text-secondary">
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type Mode = 'open' | 'new' | 'clone'

const short = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')
const NAME_RULE = /^[a-z][a-z0-9_]*$/

/** `owner/repo`, `https://github.com/owner/repo(.git)`, `git@host:owner/repo.git` → the folder git will create. */
function repoFolder(source: string): string | null {
  const m = /([\w.-]+?)(?:\.git)?\/?$/.exec(source.trim())
  return /[/:]/.test(source) && m ? m[1] : null
}

/** Last onboarding step: open, create or clone a project — plus recent projects. */
function GetStarted({ recent, onOpenProject, onOpenPath }: { recent: string[]; onOpenProject: () => void; onOpenPath: (path: string) => void }): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('open')
  const [value, setValue] = useState('')
  const [parent, setParent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)

  // New projects go next to the most recent one unless another folder is chosen.
  useEffect(() => {
    if (!parent && recent[0]) setParent(recent[0].slice(0, recent[0].lastIndexOf('/')) || null)
  }, [recent, parent])

  const choose = (m: Mode): void => {
    if (busy) return
    setMode(m)
    setValue('')
    setError(null)
  }

  const pickParent = async (): Promise<void> => {
    const p = await window.flutvio.ui.pickFolder(mode === 'new' ? 'Where to create the project' : 'Where to clone the repository')
    if (p) setParent(p)
  }

  const v = value.trim()
  // Shown as you type (only once there is something to judge).
  const hint =
    mode === 'new' && v && !NAME_RULE.test(v)
      ? /^[A-Z]/.test(v) || /[A-Z]/.test(v)
        ? 'Lowercase only — Dart package names look like my_app.'
        : /^[0-9_]/.test(v)
          ? 'Start with a letter.'
          : 'Letters, numbers and _ only (no spaces or dashes).'
      : null
  const folder = mode === 'new' ? (NAME_RULE.test(v) ? v : null) : repoFolder(v)
  const fail = (message: string): void => {
    setError(message)
    setShake((n) => n + 1)
  }

  const submit = async (): Promise<void> => {
    if (!v) return fail(mode === 'new' ? 'Give the project a name.' : 'Enter a repository.')
    if (mode === 'new' && !NAME_RULE.test(v)) return fail(hint ?? 'Use lowercase letters, numbers and _.')
    let dir = parent
    if (!dir) {
      dir = await window.flutvio.ui.pickFolder(mode === 'new' ? 'Where to create the project' : 'Where to clone the repository')
      if (!dir) return
      setParent(dir)
    }
    setBusy(true)
    setError(null)
    try {
      const path = mode === 'new' ? await window.flutvio.ui.createProject(dir, v) : await window.flutvio.ui.cloneRepo(dir, v)
      setDone(true)
      window.setTimeout(() => onOpenPath(path), 450)
    } catch (e) {
      fail((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const tiles: Array<{ id: Mode; title: string; text: string; icon: React.ReactNode; tint: string }> = [
    { id: 'open', title: 'Open', text: 'From this Mac', icon: <FolderOpenIcon size={18} />, tint: 'text-accent-blue bg-accent-blue/[0.12]' },
    { id: 'new', title: 'New', text: 'A new Flutter app', icon: <PlusIcon size={18} />, tint: 'text-accent-green bg-accent-green/[0.12]' },
    { id: 'clone', title: 'Clone', text: 'GitHub or git URL', icon: <BranchIcon size={18} />, tint: 'text-accent-purple bg-accent-purple/[0.12]' },
  ]
  const field = 'h-9 w-full rounded-lg border bg-surface-3/60 px-3 font-mono text-xs text-text-primary outline-none transition-colors placeholder:font-sans placeholder:text-text-disabled focus:border-accent-blue/70 focus:bg-transparent'

  return (
    <div data-testid="get-started">
      <div className="text-center">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">Open a project</h2>
        <p className="mt-1 text-xs text-text-tertiary">Pick one you have, start a new app, or clone a repository.</p>
      </div>

      {/* What to do */}
      <div className="mt-6 grid grid-cols-3 gap-2" role="tablist">
        {tiles.map((t) => {
          const on = mode === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              disabled={busy}
              onClick={() => choose(t.id)}
              data-testid={`start-${t.id}`}
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-50 ${
                on ? 'border-border-strong bg-surface-4/50 shadow-[0_0_0_1px_rgb(var(--border-strong))]' : 'border-border-default hover:border-border-strong hover:bg-surface-4/30'
              }`}
            >
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${t.tint}`}>{t.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-text-primary">{t.title}</span>
                <span className="block truncate text-2xs text-text-tertiary">{t.text}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* The chosen action */}
      <div key={mode} className="mt-3 animate-fadeIn rounded-xl border border-border-default bg-surface-3/30 p-4">
        {mode === 'open' ? (
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-text-primary">Choose the project folder</div>
              <div className="mt-0.5 text-2xs leading-relaxed text-text-tertiary">
                The folder that contains <code className="rounded bg-surface-4 px-1 text-text-secondary">pubspec.yaml</code>.
              </div>
            </div>
            <button onClick={onOpenProject} data-testid="start-browse" className="flex h-8 flex-shrink-0 items-center gap-2 rounded-lg bg-accent-blue px-3.5 text-xs font-medium text-white hover:bg-accent-blue/90">
              <FolderIcon size={13} /> Choose folder…
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <label className="mb-1.5 block text-2xs font-medium text-text-secondary" htmlFor="start-input">
              {mode === 'new' ? 'Project name' : 'Repository'}
            </label>
            <input
              id="start-input"
              key={shake}
              autoFocus
              value={value}
              disabled={busy || done}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              placeholder={mode === 'new' ? 'my_app' : 'owner/repo  or  https://github.com/owner/repo.git'}
              spellCheck={false}
              autoCapitalize="off"
              data-testid="start-input"
              className={`${field} ${hint || error ? 'border-accent-red/60' : 'border-border-default'} ${shake ? 'animate-shake' : ''}`}
            />
            <div className={`mt-1.5 min-h-[16px] break-words text-2xs leading-relaxed ${error || hint ? 'text-accent-red' : 'text-text-tertiary'}`} data-testid="start-hint">
              {error ?? hint ?? (mode === 'new' ? 'Lowercase letters, numbers and underscores.' : 'A GitHub repository (owner/repo) or any git URL.')}
            </div>

            <label className="mb-1.5 mt-3 block text-2xs font-medium text-text-secondary">Location</label>
            <button
              type="button"
              disabled={busy || done}
              onClick={() => void pickParent()}
              data-testid="start-location"
              className="group flex h-9 w-full items-center gap-2.5 rounded-lg border border-border-default bg-surface-3/60 px-3 text-left hover:border-border-strong"
            >
              <FolderIcon size={13} className="flex-shrink-0 text-text-tertiary" />
              <span className={`min-w-0 flex-1 truncate font-mono text-xs ${parent ? 'text-text-primary' : 'font-sans text-text-disabled'}`}>
                {parent ? (
                  <>
                    {short(parent)}
                    {folder && <span className="text-text-tertiary">/{folder}</span>}
                  </>
                ) : (
                  'Choose where to put it…'
                )}
              </span>
              <span className="flex-shrink-0 text-2xs text-text-tertiary group-hover:text-text-primary">{parent ? 'Change…' : 'Choose…'}</span>
            </button>

            <div className="mt-4 flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-2xs text-text-tertiary">
                {busy ? (mode === 'new' ? 'Running flutter create — this takes a few seconds…' : 'Cloning — large repositories take a while…') : done ? 'Opening…' : ''}
              </span>
              <button
                type="submit"
                disabled={busy || done || !v || Boolean(hint)}
                data-testid="start-submit"
                className={`flex h-8 flex-shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs font-medium text-white transition-colors disabled:opacity-40 ${done ? 'bg-accent-green' : 'bg-accent-blue hover:bg-accent-blue/90'}`}
              >
                {busy ? <SpinnerIcon size={12} /> : done ? <CheckIcon size={13} strokeWidth={2.4} /> : null}
                {busy ? (mode === 'new' ? 'Creating…' : 'Cloning…') : done ? 'Done' : mode === 'new' ? 'Create project' : 'Clone repository'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Recent */}
      <div className="mt-6">
        <div className="panel-title mb-1.5">Recent</div>
        {recent.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border-default">
            {recent.slice(0, 4).map((p, i) => (
              <button
                key={p}
                disabled={busy}
                onClick={() => onOpenPath(p)}
                data-testid="start-recent"
                className={`group flex h-10 w-full items-center gap-3 px-3 text-left hover:bg-surface-4/50 ${i ? 'border-t border-border-subtle' : ''}`}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-surface-4 text-[#54c5f8]">
                  <FlutterIcon size={12} />
                </span>
                <span className="flex-shrink-0 text-xs font-medium text-text-primary">{p.split('/').pop()}</span>
                <span className="min-w-0 flex-1 truncate text-2xs text-text-tertiary">{short(p.slice(0, p.lastIndexOf('/')))}</span>
                <ChevronRightIcon size={12} className="flex-shrink-0 text-text-disabled transition-transform group-hover:translate-x-0.5 group-hover:text-text-secondary" />
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border-default px-3 py-4 text-center text-2xs text-text-tertiary">Projects you open will be listed here.</div>
        )}
      </div>
    </div>
  )
}

/** Notes for the current version, shown once after an update. */
const WHATS_NEW: Array<{ title: string; text: string }> = [
  { title: 'Themes & Settings', text: 'Dark, Black, Midnight, Light, Paper or follow macOS. Editor, terminal and interface sizes in Settings (⌘,).' },
  { title: 'Built-in browser', text: 'Open Flutter web, localhost or docs beside your code (⇧⌘B).' },
  { title: 'Menus & shortcuts', text: 'Open File (⇧⌘O), recent projects, Run ⌘R, Hot Reload ⌘\\, Hot Restart ⇧⌘\\.' },
  { title: 'Git worktrees', text: 'Work on several branches side by side from the branch menu.' },
]

export function WhatsNew({ version, onClose }: { version: string; onClose: () => void }): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[420px] animate-fadeIn rounded-xl border border-border-default bg-surface-3 p-5 shadow-pop">
        <div className="flex items-center gap-2.5">
          <FlutvioAppIcon size={28} />
          <div>
            <div className="text-sm font-medium text-text-primary">What’s new</div>
            <div className="text-2xs text-text-tertiary">Flutvio {version}</div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {WHATS_NEW.map((n) => (
            <div key={n.title}>
              <div className="text-xs text-text-primary">{n.title}</div>
              <div className="text-2xs leading-relaxed text-text-tertiary">{n.text}</div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-5 h-7 w-full rounded-md bg-text-primary text-xs font-medium text-surface-0 hover:opacity-90">
          Got it
        </button>
      </div>
    </div>
  )
}
