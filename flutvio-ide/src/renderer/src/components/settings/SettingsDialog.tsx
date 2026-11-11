/**
 * SettingsDialog.tsx — Settings (⌘,). Every change applies immediately and is remembered.
 */

import React, { useEffect, useState } from 'react'
import type { ToolCheck } from '../../../../shared/flutvio-api'
import { DEFAULT_SETTINGS, MONO_FONTS, resetSettings, setSetting, useSettings, type Settings } from '../../lib/settings'
import { Row, Section, Segmented, Select, Stepper, Switch } from '../ui/Controls'
import ThemePicker from './ThemePicker'
import { CheckIcon, RefreshIcon, SpinnerIcon, XIcon } from '../Icons'

type Page = 'appearance' | 'editor' | 'terminal' | 'flutter' | 'simulator' | 'shortcuts' | 'tools'

import { SHORTCUT_GROUPS } from '../../lib/shortcuts'
const PAGES: Array<{ id: Page; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'editor', label: 'Editor' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'flutter', label: 'Flutter' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'tools', label: 'Tools' },
]

const PAGE_KEYS: Record<Page, Array<keyof Settings>> = {
  appearance: ['theme', 'uiScale'],
  editor: [
    'editorFontFamily', 'editorFontSize', 'editorLineHeight', 'editorTabSize', 'editorWordWrap', 'editorMinimap',
    'editorLigatures', 'editorStickyScroll', 'editorFormatOnSave', 'editorWhitespace', 'editorCursor',
  ],
  terminal: ['terminalFontSize', 'terminalCursor', 'terminalCursorBlink'],
  flutter: ['reloadOnSave'],
  simulator: ['simFps', 'simShowFrame'],
  shortcuts: [],
  tools: [],
}

export default function SettingsDialog({
  onClose,
  onShowOnboarding,
  initialPage,
}: {
  onClose: () => void
  onShowOnboarding: () => void
  initialPage?: Page
}): React.JSX.Element {
  const [page, setPage] = useState<Page>(initialPage ?? 'appearance')
  const s = useSettings()

  useEffect(() => {
    // The terminal usually has the keyboard: take focus away from it and catch Escape before it does.
    const prev = document.activeElement as HTMLElement | null
    prev?.blur()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [onClose])

  const changed = PAGE_KEYS[page].some((k) => s[k] !== DEFAULT_SETTINGS[k])

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[min(560px,86vh)] w-[min(760px,92vw)] animate-fadeIn overflow-hidden rounded-xl border border-border-default bg-surface-3 shadow-pop" data-testid="settings">
        {/* Nav */}
        <nav className="w-44 flex-shrink-0 p-2 pt-3">
          <div className="mb-2 px-2 text-xs font-medium text-text-primary">Settings</div>
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`flex h-7 w-full items-center rounded-md px-2 text-left text-xs transition-colors ${
                page === p.id ? 'bg-surface-4 text-text-primary' : 'text-text-secondary hover:bg-surface-4/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>

        {/* Page */}
        <div className="flex min-w-0 flex-1 flex-col bg-surface-0">
          <div className="flex h-11 flex-shrink-0 items-center px-5">
            <h2 className="text-sm font-medium text-text-primary">{PAGES.find((p) => p.id === page)?.label}</h2>
            <div className="ml-auto flex items-center gap-1">
              {changed && (
                <button onClick={() => resetSettings(PAGE_KEYS[page])} className="h-6 rounded px-2 text-2xs text-text-tertiary hover:bg-surface-4 hover:text-text-primary">
                  Reset to defaults
                </button>
              )}
              <button onClick={onClose} className="icon-btn" aria-label="Close settings">
                <XIcon size={13} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {page === 'appearance' && (
              <>
                <Section title="Theme">
                  <div className="py-3">
                    <ThemePicker />
                  </div>
                </Section>
                <Section title="Interface">
                  <Row label="Interface size" hint="Scales text, icons and panels (⌘= / ⌘− / ⌘0).">
                    <Segmented
                      value={s.uiScale}
                      options={[
                        { value: 0.9, label: 'Small' },
                        { value: 1, label: 'Default' },
                        { value: 1.1, label: 'Large' },
                        { value: 1.2, label: 'Larger' },
                      ]}
                      onChange={(v) => setSetting('uiScale', v)}
                    />
                  </Row>
                </Section>
              </>
            )}

            {page === 'editor' && (
              <>
                <Section title="Font">
                  <Row label="Font">
                    <Select value={s.editorFontFamily} options={MONO_FONTS.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => setSetting('editorFontFamily', v)} />
                  </Row>
                  <Row label="Font size">
                    <Stepper value={s.editorFontSize} min={10} max={24} step={0.5} onChange={(v) => setSetting('editorFontSize', v)} format={(v) => `${v}px`} />
                  </Row>
                  <Row label="Line height">
                    <Stepper value={s.editorLineHeight} min={14} max={32} onChange={(v) => setSetting('editorLineHeight', v)} format={(v) => `${v}px`} />
                  </Row>
                  <Row label="Ligatures" hint="Joins => != >= into single symbols.">
                    <Switch checked={s.editorLigatures} onChange={(v) => setSetting('editorLigatures', v)} />
                  </Row>
                </Section>
                <Section title="Editing">
                  <Row label="Tab size">
                    <Segmented value={s.editorTabSize} options={[2, 4].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => setSetting('editorTabSize', v)} />
                  </Row>
                  <Row label="Format on save" hint="Runs dart format when you save a Dart file.">
                    <Switch checked={s.editorFormatOnSave} onChange={(v) => setSetting('editorFormatOnSave', v)} />
                  </Row>
                  <Row label="Word wrap">
                    <Switch checked={s.editorWordWrap} onChange={(v) => setSetting('editorWordWrap', v)} />
                  </Row>
                  <Row label="Cursor">
                    <Segmented
                      value={s.editorCursor}
                      options={[
                        { value: 'line', label: 'Line' },
                        { value: 'block', label: 'Block' },
                        { value: 'underline', label: 'Underline' },
                      ]}
                      onChange={(v) => setSetting('editorCursor', v)}
                    />
                  </Row>
                </Section>
                <Section title="Display">
                  <Row label="Minimap">
                    <Switch checked={s.editorMinimap} onChange={(v) => setSetting('editorMinimap', v)} />
                  </Row>
                  <Row label="Sticky scroll" hint="Keeps the current class / function visible at the top.">
                    <Switch checked={s.editorStickyScroll} onChange={(v) => setSetting('editorStickyScroll', v)} />
                  </Row>
                  <Row label="Show whitespace">
                    <Switch checked={s.editorWhitespace} onChange={(v) => setSetting('editorWhitespace', v)} />
                  </Row>
                </Section>
              </>
            )}

            {page === 'terminal' && (
              <Section title="Terminal">
                <Row label="Font size" hint="Uses the editor font.">
                  <Stepper value={s.terminalFontSize} min={10} max={24} step={0.5} onChange={(v) => setSetting('terminalFontSize', v)} format={(v) => `${v}px`} />
                </Row>
                <Row label="Cursor">
                  <Segmented
                    value={s.terminalCursor}
                    options={[
                      { value: 'block', label: 'Block' },
                      { value: 'bar', label: 'Bar' },
                      { value: 'underline', label: 'Underline' },
                    ]}
                    onChange={(v) => setSetting('terminalCursor', v)}
                  />
                </Row>
                <Row label="Blinking cursor">
                  <Switch checked={s.terminalCursorBlink} onChange={(v) => setSetting('terminalCursorBlink', v)} />
                </Row>
              </Section>
            )}

            {page === 'flutter' && (
              <Section title="Running">
                <Row label="Hot reload on save" hint="Saving a Dart file while the app runs applies the change at once.">
                  <Switch checked={s.reloadOnSave} onChange={(v) => setSetting('reloadOnSave', v)} />
                </Row>
              </Section>
            )}

            {page === 'simulator' && (
              <Section title="Simulator mirror">
                <Row label="Frame rate" hint="60 fps is smoother; 30 fps uses less CPU. Applies on the next connect.">
                  <Segmented value={s.simFps} options={[30, 60].map((n) => ({ value: n as 30 | 60, label: `${n} fps` }))} onChange={(v) => setSetting('simFps', v)} />
                </Row>
                <Row label="Device frame" hint="Xcode's device frame around the screen.">
                  <Switch checked={s.simShowFrame} onChange={(v) => setSetting('simShowFrame', v)} />
                </Row>
              </Section>
            )}

            {page === 'shortcuts' && <ShortcutsPage />}

            {page === 'tools' && <ToolsPage onShowOnboarding={onShowOnboarding} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ToolList({ tools }: { tools: ToolCheck[] | null }): React.JSX.Element {
  if (!tools)
    return (
      <div className="flex items-center gap-2 py-6 text-2xs text-text-tertiary">
        <SpinnerIcon size={12} /> Checking your Mac…
      </div>
    )
  return (
    <div className="divide-y divide-border-subtle" data-testid="tool-list">
      {tools.map((t) => (
        <div key={t.id} className="flex items-start gap-3 py-2.5">
          <span
            className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${
              t.ok ? 'bg-accent-green/15 text-accent-green' : t.required ? 'bg-accent-red/15 text-accent-red' : 'bg-surface-4 text-text-tertiary'
            }`}
          >
            {t.ok ? <CheckIcon size={10} /> : <XIcon size={9} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-xs text-text-primary">
              {t.name}
              {!t.required && <span className="text-2xs text-text-tertiary">optional</span>}
            </div>
            <div className="truncate text-2xs text-text-tertiary" title={t.detail}>
              {t.detail}
            </div>
            {!t.ok && <code className="mt-1 block select-text break-all rounded bg-surface-4/60 px-1.5 py-1 font-mono text-[10.5px] text-text-secondary">{t.hint}</code>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Every keyboard shortcut, searchable (the list lives in lib/shortcuts.ts). */
function ShortcutsPage(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const groups = SHORTCUT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((s) => !q || s.label.toLowerCase().includes(q) || s.keys.toLowerCase().includes(q) || g.title.toLowerCase().includes(q)),
  })).filter((g) => g.items.length)
  return (
    <div data-testid="shortcuts-page">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search shortcuts"
        className="mb-4 h-8 w-full rounded-md border border-border-default bg-transparent px-2.5 text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-blue/60"
      />
      {groups.length === 0 && <p className="text-2xs text-text-tertiary">No shortcut matches.</p>}
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          {g.items.map((s) => (
            <div key={s.keys + s.label} className="flex min-h-[30px] items-center gap-3 py-1">
              <span className="min-w-0 flex-1 text-xs text-text-secondary">
                {s.label}
                {s.note && <span className="ml-1.5 text-2xs text-text-tertiary">{s.note}</span>}
              </span>
              <span className="flex flex-shrink-0 items-center gap-1">
                {s.keys.split('  /  ').map((combo, i) => (
                  <React.Fragment key={combo}>
                    {i > 0 && <span className="text-2xs text-text-disabled">/</span>}
                    <span className="kbd whitespace-nowrap px-1.5 py-px">{combo}</span>
                  </React.Fragment>
                ))}
              </span>
            </div>
          ))}
        </Section>
      ))}
      <p className="text-2xs leading-relaxed text-text-tertiary">
        ⌘ Command · ⌥ Option · ⌃ Control · ⇧ Shift · ⌫ Delete · ⌦ Forward delete · ↩ Return · ⇥ Tab. Open this list any time with <span className="kbd">⌘ /</span>.
      </p>
    </div>
  )
}

function ToolsPage({ onShowOnboarding }: { onShowOnboarding: () => void }): React.JSX.Element {
  const [tools, setTools] = useState<ToolCheck[] | null>(null)
  const [version, setVersion] = useState('')
  const [taught, setTaught] = useState<string | null>(null)
  const teach = (): void => {
    window.flutvio.flutter
      .getState()
      .then((s) => {
        if (!s.project) throw new Error('Open a Flutter project first.')
        return window.flutvio.ui.teachAgents(s.project.path)
      })
      .then((r) => setTaught(r === 'added' ? 'Added to AGENTS.md' : 'AGENTS.md already has it'))
      .catch((e: Error) => setTaught(e.message))
  }
  const check = (): void => {
    setTools(null)
    window.flutvio.ui.checkTools().then(setTools).catch(() => setTools([]))
  }
  useEffect(() => {
    check()
    window.flutvio.ui.appInfo().then((i) => setVersion(`${i.name} ${i.version} · Electron ${i.electron}`))
  }, [])
  return (
    <>
      <Section title="Installed tools">
        <ToolList tools={tools} />
      </Section>
      <Section title="Agents and the simulator">
        <p className="text-2xs leading-relaxed text-text-secondary">
          Every Flutvio terminal has a <code className="font-mono text-text-primary">flutvio</code> command, so any agent you run there can see and drive the
          simulator: <code className="font-mono">flutvio screenshot</code>, <code className="font-mono">tap</code>, <code className="font-mono">type</code>,{' '}
          <code className="font-mono">reload</code>, <code className="font-mono">logs</code>. Run <code className="font-mono">flutvio help</code> for the list.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={teach} data-testid="teach-agents" className="h-7 rounded-md border border-border-default px-2.5 text-2xs text-text-secondary hover:bg-surface-4">
            Add instructions to AGENTS.md
          </button>
          {taught && <span className="text-2xs text-text-tertiary">{taught}</span>}
        </div>
      </Section>
      <div className="flex items-center gap-2">
        <button onClick={check} className="flex h-7 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-2xs text-text-secondary hover:bg-surface-4">
          <RefreshIcon size={11} /> Check again
        </button>
        <button onClick={onShowOnboarding} className="h-7 rounded-md border border-border-default px-2.5 text-2xs text-text-secondary hover:bg-surface-4">
          Show welcome guide
        </button>
        <span className="ml-auto text-2xs text-text-tertiary">{version}</span>
      </div>
    </>
  )
}
