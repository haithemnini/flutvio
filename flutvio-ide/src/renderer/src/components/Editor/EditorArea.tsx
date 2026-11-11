/**
 * EditorArea.tsx — editor tabs + one Monaco editor.
 *
 * Each open file has its own Monaco model (undo history and unsaved edits survive tab switches);
 * the editor swaps models and restores each file's scroll / cursor. Dart files are connected to
 * the Dart analysis server (lib/lsp.ts): completion, hover, errors, go to definition, format on save.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import { monaco, languageFor } from '../../lib/monaco'
import { dartLsp } from '../../lib/lsp'
import { setEditorStatus } from '../../lib/editorStatus'
import { fontStack, getSettings, subscribeSettings, type Settings } from '../../lib/settings'
import { runCommand, useCommand } from '../../lib/commands'
import { isVirtual, parseTab, tabLabel, type DiffTab, type PrTab } from '../../lib/virtualTabs'
import DiffView from '../Scm/DiffView'
import PrView from '../Scm/PrView'
import { BranchIcon, FileTypeIcon, FlutvioAppIcon, XIcon } from '../Icons'

interface Props {
  projectPath: string | null
  files: string[]
  active: string | null
  onActivate: (path: string) => void
  /** Opens a file as a tab (go to definition). */
  onOpen: (path: string) => void
  onClose: (path: string) => void
  /** Called after a file is written (path of the file). */
  onSaved: (path: string) => void
  onOpenProject: () => void
  /** False while covered by the terminal (⌘W then belongs to the terminal tab). */
  visible?: boolean
}

interface Doc {
  model: Monaco.editor.ITextModel | null
  savedVersion: number
  readOnly: boolean
  note: string | null
  view: Monaco.editor.ICodeEditorViewState | null
}

const basename = (p: string): string => p.split('/').pop() ?? p

/** Monaco options that come from Settings. */
function editorOptions(s: Settings): Monaco.editor.IEditorOptions & { tabSize: number } {
  return {
    fontFamily: fontStack(s.editorFontFamily),
    fontSize: s.editorFontSize,
    lineHeight: s.editorLineHeight,
    fontLigatures: s.editorLigatures,
    tabSize: s.editorTabSize,
    wordWrap: s.editorWordWrap ? 'on' : 'off',
    minimap: { enabled: s.editorMinimap, renderCharacters: false, maxColumn: 80, scale: 1, showSlider: 'mouseover' },
    stickyScroll: { enabled: s.editorStickyScroll },
    renderWhitespace: s.editorWhitespace ? 'all' : 'selection',
    cursorStyle: s.editorCursor,
  }
}

export default function EditorArea(props: Props): React.JSX.Element {
  const { projectPath, files, active, onActivate, onOpen, onClose, onSaved, onOpenProject } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const docs = useRef(new Map<string, Doc>())
  const reveal = useRef(new Map<string, { line: number; col: number }>())
  const activeRef = useRef<string | null>(null)
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const savedCb = useRef(onSaved)
  savedCb.current = onSaved

  // ── Dart analysis server follows the open project ──
  useEffect(() => {
    if (!projectPath) return
    dartLsp.start(projectPath)
    return () => dartLsp.stop()
  }, [projectPath])

  useEffect(() => {
    dartLsp.openFile = (path, line, col) => {
      if (line) reveal.current.set(path, { line, col: col ?? 1 })
      onOpen(path)
      if (path === activeRef.current && line) {
        editorRef.current?.revealLineInCenter(line)
        editorRef.current?.setPosition({ lineNumber: line, column: col ?? 1 })
      }
    }
  }, [onOpen])

  // ── Save ──
  const save = useCallback(async (path: string): Promise<void> => {
    const doc = docs.current.get(path)
    const model = doc?.model
    if (!doc || !model || doc.readOnly) return
    try {
      if (model.getLanguageId() === 'dart' && getSettings().editorFormatOnSave) await dartLsp.format(model)
      await window.flutvio.files.write(path, model.getValue())
      doc.savedVersion = model.getAlternativeVersionId()
      setDirty((d) => ({ ...d, [path]: false }))
      dartLsp.saved(model)
      savedCb.current(path)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  // ── Create the editor once ──
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const editor = monaco.editor.create(host, {
      model: null,
      automaticLayout: true,
      ...editorOptions(getSettings()),
      insertSpaces: true,
      scrollBeyondLastLine: true,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'line',
      bracketPairColorization: { enabled: true },
      guides: { indentation: true, bracketPairs: false },
      padding: { top: 8 },
      lineNumbersMinChars: 4,
      glyphMargin: false,
      folding: true,
      suggest: { showStatusBar: false, preview: true },
      quickSuggestions: { other: true, comments: false, strings: false },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      overviewRulerBorder: false,
      fixedOverflowWidgets: true,
    })
    editorRef.current = editor
    // Dev / automated tests only: expose the editor for the e2e harness.
    if (import.meta.env.DEV) Object.assign(window, { __flutvioEditor: editor, __flutvioMonaco: monaco })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeRef.current) void save(activeRef.current)
    })
    editor.onDidChangeCursorPosition((e) => setEditorStatus({ line: e.position.lineNumber, col: e.position.column }))
    // Editor settings apply live.
    const offSettings = subscribeSettings(() => {
      const s = getSettings()
      editor.updateOptions(editorOptions(s))
      for (const d of docs.current.values()) d.model?.updateOptions({ tabSize: s.editorTabSize })
    })

    return () => {
      offSettings()
      editor.dispose()
      editorRef.current = null
    }
  }, [save])

  // ── Load models for newly opened files ──
  useEffect(() => {
    for (const path of files) {
      if (docs.current.has(path) || isVirtual(path)) continue
      const doc: Doc = { model: null, savedVersion: 0, readOnly: false, note: null, view: null }
      docs.current.set(path, doc)
      window.flutvio.files
        .read(path)
        .then((r) => {
          if (!docs.current.has(path)) return
          if (r.binary) {
            doc.note = 'This file is binary and cannot be shown as text.'
          } else {
            const uri = monaco.Uri.file(path)
            const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(r.content, languageFor(path), uri)
            model.updateOptions({ tabSize: getSettings().editorTabSize })
            doc.model = model
            doc.savedVersion = model.getAlternativeVersionId()
            doc.readOnly = r.truncated
            if (r.truncated) doc.note = 'Large file: showing the first 2 MB, read-only.'
            model.onDidChangeContent(() => {
              const d = model.getAlternativeVersionId() !== doc.savedVersion
              setDirty((m) => (m[path] === d ? m : { ...m, [path]: d }))
            })
            dartLsp.open(model)
          }
          setLoaded((n) => n + 1)
        })
        .catch((e: Error) => setError(e.message))
    }
    // Dispose models of closed tabs.
    for (const [path, doc] of docs.current) {
      if (files.includes(path)) continue
      if (doc.model) {
        dartLsp.close(doc.model)
        doc.model.dispose()
      }
      docs.current.delete(path)
      setDirty((m) => {
        const { [path]: _, ...rest } = m
        return rest
      })
    }
  }, [files])

  // ── Show the active file ──
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const prev = activeRef.current
    if (prev && prev !== active) {
      const prevDoc = docs.current.get(prev)
      if (prevDoc?.model && editor.getModel() === prevDoc.model) prevDoc.view = editor.saveViewState()
    }
    activeRef.current = active
    if (active && isVirtual(active)) {
      setEditorStatus({ language: null })
      return
    }
    const doc = active ? docs.current.get(active) : undefined
    if (!doc?.model) {
      editor.setModel(null)
      setEditorStatus({ language: null })
      return
    }
    if (editor.getModel() !== doc.model) {
      editor.setModel(doc.model)
      if (doc.view) editor.restoreViewState(doc.view)
    }
    editor.updateOptions({ readOnly: doc.readOnly })
    const r = active ? reveal.current.get(active) : undefined
    if (r && active) {
      reveal.current.delete(active)
      editor.revealLineInCenter(r.line)
      editor.setPosition({ lineNumber: r.line, column: r.col })
    }
    setEditorStatus({ language: doc.model.getLanguageId() })
    editor.focus()
  }, [active, loaded])

  // Menu: File › Save / Close Tab
  useCommand(['save', 'close-tab'], (cmd) => {
    const path = activeRef.current
    if (!path) return
    if (cmd.id === 'save') {
      if (!isVirtual(path)) void save(path)
    } else if (props.visible !== false) close(path)
  })

  const close = (path: string): void => {
    if (dirty[path] && !window.confirm(`${basename(path)} has unsaved changes. Close it anyway?`)) return
    onClose(path)
  }

  const activeDoc = active ? docs.current.get(active) : undefined
  const empty = !files.length || !active
  const virtualActive = Boolean(active && isVirtual(active))
  const virtualTabs = files.filter(isVirtual)

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface-1">
      {!empty && (
        <div className="flex h-[30px] flex-shrink-0 items-stretch overflow-x-auto [&::-webkit-scrollbar]:h-0">
          {files.map((f) => {
            const on = f === active
            return (
              <div
                key={f}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    close(f)
                  } else onActivate(f)
                }}
                title={f}
                className={`group relative flex max-w-[200px] flex-shrink-0 items-center gap-1.5 pl-2.5 pr-1 text-xs ${
                  on ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {on && <span className="absolute inset-x-2 bottom-[-1px] h-px bg-text-secondary" />}
                {isVirtual(f) ? <BranchIcon size={11} className="flex-shrink-0 text-text-tertiary" /> : <FileTypeIcon name={basename(f)} size={12} />}
                <span className="truncate" dir="auto">
                  {isVirtual(f) ? tabLabel(f) : basename(f)}
                </span>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => close(f)}
                  aria-label={`Close ${basename(f)}`}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-surface-4 hover:text-text-primary"
                >
                  {dirty[f] ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-text-secondary group-hover:hidden" />
                      <XIcon size={10} className="hidden group-hover:block" />
                    </>
                  ) : (
                    <XIcon size={10} className={on ? '' : 'opacity-0 group-hover:opacity-100'} />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {(error || activeDoc?.note) && !empty && (
        <div className="flex flex-shrink-0 items-center gap-2 bg-surface-0 px-3 py-1 text-2xs">
          <span className={error ? 'text-accent-red' : 'text-accent-orange'}>{error ?? activeDoc?.note}</span>
          {error && (
            <button onClick={() => setError(null)} className="ml-auto text-text-tertiary hover:text-text-primary">
              <XIcon size={10} />
            </button>
          )}
        </div>
      )}

      <div ref={hostRef} className="min-h-0 flex-1" data-testid="editor" style={{ display: empty || virtualActive ? 'none' : undefined }} />
      {/* Diff and pull-request tabs stay mounted; only the active one is shown. */}
      {virtualTabs.map((id) => {
        const t = parseTab(id)
        if (!t) return null
        const show = id === active
        return (
          <div key={id} className={show ? 'min-h-0 flex-1' : 'hidden'}>
            {t.kind === 'diff' ? (
              <DiffView tab={t as DiffTab} visible={show} onOpenFile={onOpen} onChanged={() => savedCb.current('')} />
            ) : (
              <PrView tab={t as PrTab} visible={show} onChanged={() => savedCb.current('')} />
            )}
          </div>
        )
      })}
      {empty && <Welcome projectPath={projectPath} onOpenProject={onOpenProject} onOpen={onOpen} />}
    </div>
  )
}

function Welcome({ projectPath, onOpenProject, onOpen }: { projectPath: string | null; onOpenProject: () => void; onOpen: (path: string) => void }): React.JSX.Element {
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    window.flutvio.ui.recentProjects().then(setRecent).catch(() => undefined)
  }, [projectPath])
  const name = projectPath?.split('/').pop()

  const actions: Array<{ label: string; keys: string; run: () => void; show?: boolean }> = [
    { label: 'Open main.dart', keys: '', run: () => onOpen(`${projectPath}/lib/main.dart`), show: Boolean(projectPath) },
    { label: 'Open Project…', keys: '⌘O', run: onOpenProject },
    { label: 'Open File…', keys: '⇧⌘O', run: () => runCommand({ id: 'open-file' }) },
    { label: 'Run', keys: '⌘R', run: () => runCommand({ id: 'run' }), show: Boolean(projectPath) },
    { label: 'New Terminal', keys: '⌃⇧`', run: () => runCommand({ id: 'new-terminal' }) },
    { label: 'Settings', keys: '⌘,', run: () => runCommand({ id: 'settings' }) },
  ]
  const others = recent.filter((p) => p !== projectPath).slice(0, 4)

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto" data-testid="welcome">
      <div className="w-[min(380px,85%)] py-10">
        <div className="flex items-center gap-4">
          <FlutvioAppIcon size={56} />
          <div className="min-w-0">
            <div className="truncate text-xl font-semibold tracking-tight text-text-primary">{name ?? 'Flutvio'}</div>
            <div className="mt-0.5 truncate text-xs text-text-tertiary">{projectPath ? projectPath.replace(/^\/Users\/[^/]+/, '~') : 'Flutter workspace'}</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="panel-title mb-1.5">Start</div>
          {actions
            .filter((a) => a.show !== false)
            .map((a) => (
              <button key={a.label} onClick={a.run} className="flex h-8 w-full items-center rounded-md px-2 text-left text-[13px] text-text-secondary hover:bg-surface-4 hover:text-text-primary">
                <span>{a.label}</span>
                {a.keys && <span className="ml-auto font-mono text-2xs text-text-tertiary">{a.keys}</span>}
              </button>
            ))}
        </div>

        {others.length > 0 && (
          <div className="mt-6">
            <div className="panel-title mb-1.5">Recent</div>
            {others.map((p) => (
              <button
                key={p}
                onClick={() => runCommand({ id: 'open-recent', path: p })}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-4"
              >
                <span className="text-[13px] text-text-secondary">{p.split('/').pop()}</span>
                <span className="truncate text-2xs text-text-tertiary">{p.replace(/^\/Users\/[^/]+/, '~')}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-text-tertiary">
          <span>
            <span className="kbd">⌃Space</span> suggestions
          </span>
          <span>
            <span className="kbd">⌘</span> click → definition
          </span>
          <span>
            <span className="kbd">F1</span> commands
          </span>
        </div>
      </div>
    </div>
  )
}
