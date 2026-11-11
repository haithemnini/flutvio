/**
 * editorStatus.ts — tiny shared store for the status bar: cursor, language, Dart analyzer state,
 * problem counts. Written by the editor and the LSP client, read with useEditorStatus().
 */

import { useSyncExternalStore } from 'react'

export interface EditorStatus {
  line: number
  col: number
  language: string | null
  lsp: 'off' | 'starting' | 'analyzing' | 'ready' | 'error'
  lspMessage?: string
  errors: number
  warnings: number
}

let state: EditorStatus = { line: 1, col: 1, language: null, lsp: 'off', errors: 0, warnings: 0 }
const listeners = new Set<() => void>()

export function setEditorStatus(patch: Partial<EditorStatus>): void {
  const next = { ...state, ...patch }
  if ((Object.keys(patch) as Array<keyof EditorStatus>).every((k) => next[k] === state[k])) return
  state = next
  for (const l of listeners) l()
}

export function useEditorStatus(): EditorStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
