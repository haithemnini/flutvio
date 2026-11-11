/**
 * monaco.ts — one-time Monaco setup: bundled (no CDN), workers, the flutvio-dark theme,
 * and the Dart language. Import `monaco` from here so setup always runs first.
 */

import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import { dartLanguageConfig, dartMonarch } from './dartGrammar'
import { THEME_LIST, monacoTheme } from './themes'

(globalThis as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_id: string, label: string): Worker {
    if (label === 'json') return new JsonWorker()
    return new EditorWorker()
  },
}

monaco.languages.register({ id: 'dart', extensions: ['.dart'], aliases: ['Dart', 'dart'] })
monaco.languages.setLanguageConfiguration('dart', dartLanguageConfig)
monaco.languages.setMonarchTokensProvider('dart', dartMonarch)

// One Monaco theme per app theme (lib/themes.ts); lib/appearance.ts switches between them.
for (const t of THEME_LIST) monaco.editor.defineTheme(`flutvio-${t.id}`, monacoTheme(t))

export { monaco }

/** Monaco language id for a file name. */
export function languageFor(path: string): string {
  const name = path.split('/').pop() ?? ''
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const map: Record<string, string> = {
    dart: 'dart',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    arb: 'json',
    md: 'markdown',
    swift: 'swift',
    kt: 'kotlin',
    kts: 'kotlin',
    java: 'java',
    gradle: 'java',
    xml: 'xml',
    plist: 'xml',
    xcconfig: 'ini',
    html: 'html',
    css: 'css',
    js: 'javascript',
    ts: 'typescript',
    sh: 'shell',
    rb: 'ruby',
    py: 'python',
    c: 'c',
    h: 'cpp',
    m: 'objective-c',
    mm: 'objective-c',
    cc: 'cpp',
    cpp: 'cpp',
  }
  if (name === 'Podfile' || name === 'Gemfile') return 'ruby'
  return map[ext] ?? 'plaintext'
}
