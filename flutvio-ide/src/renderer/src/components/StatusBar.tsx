/**
 * StatusBar.tsx — 22px bar at the bottom: device, build progress, Dart analyzer, problems,
 * cursor position, last action timing.
 */

import React from 'react'
import type { FlutterController } from '../hooks/useFlutter'
import { useEditorStatus } from '../lib/editorStatus'
import { SpinnerIcon } from './Icons'

/** Hot reload goal from the roadmap: under 500 ms. */
const RELOAD_TARGET_MS = 500

const LANG: Record<string, string> = {
  dart: 'Dart',
  yaml: 'YAML',
  json: 'JSON',
  markdown: 'Markdown',
  swift: 'Swift',
  kotlin: 'Kotlin',
  xml: 'XML',
  plaintext: 'Plain Text',
}

interface Props {
  flutter: FlutterController
  onOpenConsole: () => void
}

export default function StatusBar({ flutter, onOpenConsole }: Props): React.JSX.Element {
  const { state, devices, lastAction, progress, logs } = flutter
  const logErrors = logs.reduce((n, l) => n + (l.error ? 1 : 0), 0)
  const editor = useEditorStatus()
  const device = devices.find((d) => d.id === (state.runningDeviceId ?? state.deviceId))

  const lsp =
    editor.lsp === 'starting' || editor.lsp === 'analyzing' ? (
      <span className="flex items-center gap-1">
        <SpinnerIcon size={9} /> Analyzing
      </span>
    ) : editor.lsp === 'error' ? (
      <span className="text-accent-red" title={editor.lspMessage}>
        Dart analyzer stopped
      </span>
    ) : editor.lsp === 'ready' ? (
      <span>Dart</span>
    ) : null

  return (
    <footer className="flex h-[22px] flex-shrink-0 items-center gap-3 bg-surface-0 px-2.5 text-[11px] text-text-tertiary">
      {device && <span className="flex-shrink-0">{device.name}</span>}
      {progress && (
        <span className="flex min-w-0 items-center gap-1.5">
          <SpinnerIcon size={9} />
          <span dir="auto" className="truncate">
            {progress}
          </span>
        </span>
      )}
      {lsp}
      <span className={`flex items-center gap-1.5 ${editor.errors ? 'text-accent-red' : ''}`} title="Problems found by the Dart analyzer">
        <span>✕ {editor.errors}</span>
        <span className={editor.warnings ? 'text-accent-orange' : ''}>△ {editor.warnings}</span>
      </span>
      <button onClick={onOpenConsole} className="flex items-center gap-1.5 hover:text-text-primary" title="Flutter logs (⇧⌘L)" data-testid="status-logs">
        Logs
        {logErrors > 0 && <span className="rounded-full bg-accent-red/15 px-1.5 leading-[14px] text-accent-red">{logErrors}</span>}
      </button>

      <div className="ml-auto flex flex-shrink-0 items-center gap-3">
        {lastAction && (
          <span
            data-testid="last-action"
            data-ms={lastAction.durationMs}
            data-seq={lastAction.seq}
            title="Duration of the last action"
            className={lastAction.kind === 'reload' && lastAction.durationMs > RELOAD_TARGET_MS ? 'text-accent-orange' : ''}
          >
            {lastAction.kind === 'reload' ? 'Reload' : lastAction.kind === 'restart' ? 'Restart' : 'Screenshot'} {lastAction.durationMs} ms
          </span>
        )}
        {editor.language && (
          <>
            <span>
              Ln {editor.line}, Col {editor.col}
            </span>
            <span>{LANG[editor.language] ?? editor.language}</span>
          </>
        )}
      </div>
    </footer>
  )
}
