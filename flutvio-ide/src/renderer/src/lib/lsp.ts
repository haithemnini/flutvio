/**
 * lsp.ts — thin LSP client: connects Monaco's Dart models to the Dart analysis server
 * running in the main process (src/main/dartLsp.ts).
 *
 *  - documents: didOpen / didChange (full text, debounced, flushed before every request) / didSave / didClose
 *  - providers: completion (+ resolve), hover, signature help, definition, formatting
 *  - diagnostics → Monaco markers, counts → status bar
 */

import { monaco } from './monaco'
import { setEditorStatus } from './editorStatus'
import type * as Monaco from 'monaco-editor'

type Range = { start: { line: number; character: number }; end: { line: number; character: number } }
interface TextEdit {
  range: Range
  newText: string
}
interface Diagnostic {
  range: Range
  severity?: number
  message: string
  code?: string | number
  source?: string
}

const api = (): typeof window.flutvio.lsp => window.flutvio.lsp

const toMonacoRange = (r: Range): Monaco.IRange => ({
  startLineNumber: r.start.line + 1,
  startColumn: r.start.character + 1,
  endLineNumber: r.end.line + 1,
  endColumn: r.end.character + 1,
})
const toPosition = (p: Monaco.Position): { line: number; character: number } => ({ line: p.lineNumber - 1, character: p.column - 1 })

/** LSP CompletionItemKind → Monaco kind. */
function kindOf(k?: number): Monaco.languages.CompletionItemKind {
  const K = monaco.languages.CompletionItemKind
  const map: Record<number, Monaco.languages.CompletionItemKind> = {
    1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field, 6: K.Variable, 7: K.Class, 8: K.Interface,
    9: K.Module, 10: K.Property, 11: K.Unit, 12: K.Value, 13: K.Enum, 14: K.Keyword, 15: K.Snippet, 16: K.Color,
    17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember, 21: K.Constant, 22: K.Struct, 23: K.Event,
    24: K.Operator, 25: K.TypeParameter,
  }
  return map[k ?? 1] ?? K.Text
}

function markdown(contents: unknown): Monaco.IMarkdownString[] {
  if (!contents) return []
  if (typeof contents === 'string') return [{ value: contents }]
  if (Array.isArray(contents)) return contents.flatMap(markdown)
  const c = contents as { kind?: string; value?: string; language?: string }
  if (c.language) return [{ value: '```' + c.language + '\n' + c.value + '\n```' }]
  return c.value ? [{ value: c.value }] : []
}

class DartLspClient {
  private root: string | null = null
  private started: Promise<unknown> | null = null
  private docs = new Map<string, { model: Monaco.editor.ITextModel; version: number; timer: number; dirty: boolean; sub: Monaco.IDisposable }>()
  private providersRegistered = false
  private offEvents: (() => void) | null = null
  /** Problem counts per file (status bar). */
  private counts = new Map<string, { e: number; w: number }>()
  /** Opens a project file (go to definition). */
  openFile: (path: string, line?: number, col?: number) => void = () => undefined

  start(root: string): void {
    if (this.root === root && this.started) return
    this.stop()
    this.root = root
    this.listen()
    this.registerProviders()
    const attempt: Promise<unknown> = api()
      .start(root)
      .then((caps) => {
        if (this.started !== attempt || caps === null) return caps // replaced by a newer start
        // Re-open documents already in the editor.
        for (const d of this.docs.values()) this.sendOpen(d.model)
        return caps
      })
      .catch((err: Error) => {
        if (this.started !== attempt) return // a newer start owns the status now
        setEditorStatus({ lsp: 'error', lspMessage: err.message })
        this.started = null
      })
    this.started = attempt
  }

  stop(): void {
    for (const [uri, d] of this.docs) {
      d.sub.dispose()
      window.clearTimeout(d.timer)
      monaco.editor.setModelMarkers(d.model, 'dart', [])
      this.docs.delete(uri)
    }
    if (this.root) void api().stop()
    this.root = null
    this.started = null
    this.counts.clear()
    setEditorStatus({ lsp: 'off', errors: 0, warnings: 0 })
  }

  private listen(): void {
    if (this.offEvents) return
    const counts = this.counts
    this.offEvents = api().onEvent((method, params) => {
      if (method === '$/flutvio/reopen') {
        // The server was restarted after a crash: send the open files again.
        for (const d of this.docs.values()) this.sendOpen(d.model)
      } else if (method === '$/flutvio/status') {
        const p = params as { state: 'starting' | 'ready' | 'error'; message?: string }
        setEditorStatus({ lsp: p.state, lspMessage: p.message })
      } else if (method === '$/analyzerStatus') {
        setEditorStatus({ lsp: (params as { isAnalyzing: boolean }).isAnalyzing ? 'analyzing' : 'ready' })
      } else if (method === 'textDocument/publishDiagnostics') {
        const { uri, diagnostics } = params as { uri: string; diagnostics: Diagnostic[] }
        counts.set(uri, {
          e: diagnostics.filter((d) => d.severity === 1).length,
          w: diagnostics.filter((d) => d.severity === 2).length,
        })
        let errors = 0
        let warnings = 0
        for (const c of counts.values()) {
          errors += c.e
          warnings += c.w
        }
        setEditorStatus({ errors, warnings })
        const model = monaco.editor.getModel(monaco.Uri.parse(uri))
        if (!model) return
        const S = monaco.MarkerSeverity
        monaco.editor.setModelMarkers(
          model,
          'dart',
          diagnostics.map((d) => ({
            ...toMonacoRange(d.range),
            message: d.message,
            code: d.code !== undefined ? String(d.code) : undefined,
            source: d.source ?? 'dart',
            severity: d.severity === 1 ? S.Error : d.severity === 2 ? S.Warning : d.severity === 3 ? S.Info : S.Hint,
          })),
        )
      }
    })
  }

  // ── Documents ──

  /** Starts tracking a Dart model (sends didOpen once the server is up). */
  open(model: Monaco.editor.ITextModel): void {
    const uri = model.uri.toString()
    if (this.docs.has(uri) || model.getLanguageId() !== 'dart') return
    const doc = {
      model,
      version: 1,
      timer: 0,
      dirty: false,
      sub: model.onDidChangeContent(() => {
        doc.dirty = true
        window.clearTimeout(doc.timer)
        doc.timer = window.setTimeout(() => this.flush(uri), 250)
      }),
    }
    this.docs.set(uri, doc)
    void this.started?.then(() => this.sendOpen(model))
  }

  private sendOpen(model: Monaco.editor.ITextModel): void {
    const d = this.docs.get(model.uri.toString())
    if (!d) return
    api().notify('textDocument/didOpen', {
      textDocument: { uri: model.uri.toString(), languageId: 'dart', version: d.version, text: model.getValue() },
    })
  }

  private flush(uri: string): void {
    const d = this.docs.get(uri)
    if (!d || !d.dirty) return
    window.clearTimeout(d.timer)
    d.dirty = false
    d.version++
    api().notify('textDocument/didChange', {
      textDocument: { uri, version: d.version },
      contentChanges: [{ text: d.model.getValue() }],
    })
  }

  saved(model: Monaco.editor.ITextModel): void {
    const uri = model.uri.toString()
    if (!this.docs.has(uri)) return
    this.flush(uri)
    api().notify('textDocument/didSave', { textDocument: { uri } })
  }

  close(model: Monaco.editor.ITextModel): void {
    const uri = model.uri.toString()
    const d = this.docs.get(uri)
    if (!d) return
    d.sub.dispose()
    window.clearTimeout(d.timer)
    this.docs.delete(uri)
    api().notify('textDocument/didClose', { textDocument: { uri } })
  }

  private async request<T>(model: Monaco.editor.ITextModel, method: string, params: object): Promise<T | null> {
    if (!this.started) return null
    await this.started
    this.flush(model.uri.toString())
    try {
      return (await api().request(method, params)) as T
    } catch {
      return null
    }
  }

  /** Formats a model with the analysis server (dart format). Returns true if edits were applied. */
  async format(model: Monaco.editor.ITextModel): Promise<boolean> {
    const edits = await this.request<TextEdit[]>(model, 'textDocument/formatting', {
      textDocument: { uri: model.uri.toString() },
      options: { tabSize: 2, insertSpaces: true },
    })
    if (!edits?.length) return false
    model.pushEditOperations([], edits.map((e) => ({ range: toMonacoRange(e.range), text: e.newText })), () => null)
    return true
  }

  // ── Providers ──

  private registerProviders(): void {
    if (this.providersRegistered) return
    this.providersRegistered = true
    const L = monaco.languages

    L.registerCompletionItemProvider('dart', {
      triggerCharacters: ['.', '(', '$', '"', "'", '/', '@', ':'],
      provideCompletionItems: async (model, position) => {
        const res = await this.request<{ items?: unknown[]; isIncomplete?: boolean } | unknown[]>(model, 'textDocument/completion', {
          textDocument: { uri: model.uri.toString() },
          position: toPosition(position),
        })
        if (!res) return { suggestions: [] }
        const items = (Array.isArray(res) ? res : res.items ?? []) as Array<{
          label: string
          kind?: number
          detail?: string
          documentation?: unknown
          sortText?: string
          filterText?: string
          insertText?: string
          insertTextFormat?: number
          textEdit?: TextEdit
          additionalTextEdits?: TextEdit[]
          deprecated?: boolean
          tags?: number[]
          data?: unknown
        }>
        const word = model.getWordUntilPosition(position)
        const fallback = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
        return {
          incomplete: !Array.isArray(res) && Boolean(res.isIncomplete),
          suggestions: items.map((it) => ({
            label: it.label,
            kind: kindOf(it.kind),
            detail: it.detail,
            documentation: markdown(it.documentation)[0],
            sortText: it.sortText,
            filterText: it.filterText,
            insertText: it.textEdit?.newText ?? it.insertText ?? it.label,
            insertTextRules: it.insertTextFormat === 2 ? L.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            range: it.textEdit ? toMonacoRange(it.textEdit.range) : fallback,
            additionalTextEdits: it.additionalTextEdits?.map((e) => ({ range: toMonacoRange(e.range), text: e.newText })),
            tags: it.deprecated || it.tags?.includes(1) ? [L.CompletionItemTag.Deprecated] : undefined,
            // Keep the raw item for resolve.
            _raw: it,
          })) as Monaco.languages.CompletionItem[],
        }
      },
      resolveCompletionItem: async (item) => {
        const raw = (item as unknown as { _raw?: { data?: unknown } })._raw
        if (!raw?.data) return item
        try {
          const r = (await api().request('completionItem/resolve', raw)) as {
            detail?: string
            documentation?: unknown
            additionalTextEdits?: TextEdit[]
          }
          return {
            ...item,
            detail: r.detail ?? item.detail,
            documentation: markdown(r.documentation)[0] ?? item.documentation,
            additionalTextEdits:
              r.additionalTextEdits?.map((e) => ({ range: toMonacoRange(e.range), text: e.newText })) ?? item.additionalTextEdits,
          }
        } catch {
          return item
        }
      },
    })

    L.registerHoverProvider('dart', {
      provideHover: async (model, position) => {
        const r = await this.request<{ contents: unknown; range?: Range }>(model, 'textDocument/hover', {
          textDocument: { uri: model.uri.toString() },
          position: toPosition(position),
        })
        if (!r) return null
        return { contents: markdown(r.contents), range: r.range ? toMonacoRange(r.range) : undefined }
      },
    })

    L.registerSignatureHelpProvider('dart', {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp: async (model, position) => {
        const r = await this.request<{
          signatures: Array<{ label: string; documentation?: unknown; parameters?: Array<{ label: string | [number, number]; documentation?: unknown }> }>
          activeSignature?: number
          activeParameter?: number
        }>(model, 'textDocument/signatureHelp', { textDocument: { uri: model.uri.toString() }, position: toPosition(position) })
        if (!r?.signatures?.length) return null
        return {
          value: {
            signatures: r.signatures.map((s) => ({
              label: s.label,
              documentation: markdown(s.documentation)[0],
              parameters: (s.parameters ?? []).map((p) => ({ label: p.label, documentation: markdown(p.documentation)[0] })),
            })),
            activeSignature: r.activeSignature ?? 0,
            activeParameter: r.activeParameter ?? 0,
          },
          dispose: () => undefined,
        }
      },
    })

    L.registerDefinitionProvider('dart', {
      provideDefinition: async (model, position) => {
        const r = await this.request<Array<{ uri: string; range: Range }> | { uri: string; range: Range }>(model, 'textDocument/definition', {
          textDocument: { uri: model.uri.toString() },
          position: toPosition(position),
        })
        if (!r) return null
        const list = Array.isArray(r) ? r : [r]
        return list.map((l) => ({ uri: monaco.Uri.parse(l.uri), range: toMonacoRange(l.range) }))
      },
    })

    L.registerDocumentFormattingEditProvider('dart', {
      provideDocumentFormattingEdits: async (model, options) => {
        const edits = await this.request<TextEdit[]>(model, 'textDocument/formatting', {
          textDocument: { uri: model.uri.toString() },
          options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
        })
        return (edits ?? []).map((e) => ({ range: toMonacoRange(e.range), text: e.newText }))
      },
    })

    // Cmd+click / F12 into another file: open it as a tab.
    monaco.editor.registerEditorOpener({
      openCodeEditor: (_source, resource, selection) => {
        if (resource.scheme !== 'file') return false
        const sel = selection && 'startLineNumber' in selection ? selection : selection ? { startLineNumber: selection.lineNumber, startColumn: selection.column } : undefined
        this.openFile(resource.fsPath, sel?.startLineNumber, sel?.startColumn)
        return true
      },
    })
  }
}

export const dartLsp = new DartLspClient()
