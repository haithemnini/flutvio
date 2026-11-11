/**
 * themes.ts — app themes. One theme sets three things at once:
 *   - the UI colour tokens (CSS variables used by tailwind.config.js)
 *   - the Monaco editor theme (syntax + editor chrome)
 *   - the terminal (xterm) colours
 *
 * "system" follows macOS appearance (Dark ↔ Light).
 */

import type { ITheme } from '@xterm/xterm'
import type * as Monaco from 'monaco-editor'

export type ThemeId = 'dark' | 'black' | 'midnight' | 'light' | 'paper'
export type ThemeSetting = ThemeId | 'system'

interface Palette {
  surface0: string
  surface3: string
  surface4: string
  borderSubtle: string
  borderDefault: string
  borderStrong: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  textDisabled: string
  blue: string
  purple: string
  green: string
  orange: string
  red: string
}

interface Syntax {
  text: string
  comment: string
  doc: string
  keyword: string
  string: string
  number: string
  type: string
  fn: string
  annotation: string
  operator: string
  escape: string
  delimiter: string
  lineHighlight: string
  lineNumber: string
  lineNumberActive: string
}

export interface Theme {
  id: ThemeId
  name: string
  kind: 'dark' | 'light'
  ui: Palette
  syntax: Syntax
  ansi: Pick<ITheme, 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'brightBlack' | 'brightRed' | 'brightGreen' | 'brightYellow' | 'brightBlue' | 'brightMagenta' | 'brightCyan' | 'brightWhite'>
}

const DARK_ANSI: Theme['ansi'] = {
  black: '#1a1a20', red: '#ef4444', green: '#3dd68c', yellow: '#f59e0b', blue: '#4f8ef7', magenta: '#a855f7', cyan: '#06b6d4', white: '#e8e8ed',
  brightBlack: '#52525e', brightRed: '#f87171', brightGreen: '#6ee7b7', brightYellow: '#fbbf24', brightBlue: '#93c5fd', brightMagenta: '#c084fc', brightCyan: '#67e8f9', brightWhite: '#f8fafc',
}
const LIGHT_ANSI: Theme['ansi'] = {
  black: '#1d1d1f', red: '#c8352e', green: '#2e8b57', yellow: '#9a6a00', blue: '#2f6fe4', magenta: '#8a3fd1', cyan: '#0f7c80', white: '#6d6d74',
  brightBlack: '#8a8a92', brightRed: '#e0453d', brightGreen: '#38a169', brightYellow: '#b7791f', brightBlue: '#3b82f6', brightMagenta: '#9f5be0', brightCyan: '#139aa0', brightWhite: '#3a3a40',
}

const DARK_SYNTAX: Omit<Syntax, 'lineHighlight' | 'lineNumber' | 'lineNumberActive'> = {
  text: '#d4d4d8', comment: '#5f5f67', doc: '#6f7a68', keyword: '#c792ea', string: '#a8cc8c', number: '#f2a970', type: '#e6c07b',
  fn: '#82aaff', annotation: '#7fdbca', operator: '#89ddff', escape: '#89ddff', delimiter: '#8b8b93',
}
const LIGHT_SYNTAX: Omit<Syntax, 'lineHighlight' | 'lineNumber' | 'lineNumberActive'> = {
  text: '#26262b', comment: '#9a9aa2', doc: '#7f8a72', keyword: '#8a3fd1', string: '#2f7d32', number: '#b35c00', type: '#9a6700',
  fn: '#2559c4', annotation: '#0f7c80', operator: '#2f6f8f', escape: '#0f7c80', delimiter: '#6a6a72',
}

export const THEMES: Record<ThemeId, Theme> = {
  dark: {
    id: 'dark',
    name: 'Dark',
    kind: 'dark',
    ui: {
      surface0: '#141416', surface3: '#1c1c1f', surface4: '#232327',
      borderSubtle: '#212125', borderDefault: '#2a2a2e', borderStrong: '#3a3a40',
      textPrimary: '#e6e6e8', textSecondary: '#a1a1a7', textTertiary: '#6d6d74', textDisabled: '#45454b',
      blue: '#4d8cf5', purple: '#8b6cff', green: '#3fb97f', orange: '#e0a030', red: '#e5534b',
    },
    syntax: { ...DARK_SYNTAX, lineHighlight: '#19191c', lineNumber: '#3f3f45', lineNumberActive: '#9a9aa1' },
    ansi: DARK_ANSI,
  },
  black: {
    id: 'black',
    name: 'Black',
    kind: 'dark',
    ui: {
      surface0: '#000000', surface3: '#111113', surface4: '#1a1a1d',
      borderSubtle: '#161618', borderDefault: '#242427', borderStrong: '#34343a',
      textPrimary: '#ededef', textSecondary: '#a3a3a9', textTertiary: '#6b6b72', textDisabled: '#3f3f45',
      blue: '#4d8cf5', purple: '#8b6cff', green: '#3fb97f', orange: '#e0a030', red: '#e5534b',
    },
    syntax: { ...DARK_SYNTAX, lineHighlight: '#0b0b0d', lineNumber: '#333338', lineNumberActive: '#a3a3a9' },
    ansi: { ...DARK_ANSI, black: '#000000' },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    kind: 'dark',
    ui: {
      surface0: '#0f1420', surface3: '#182030', surface4: '#1f2939',
      borderSubtle: '#1b2333', borderDefault: '#263043', borderStrong: '#34405a',
      textPrimary: '#e3e8f2', textSecondary: '#9aa6bd', textTertiary: '#66728a', textDisabled: '#404a5e',
      blue: '#6aa1ff', purple: '#9b87ff', green: '#4cc38a', orange: '#e7b04c', red: '#f06a6a',
    },
    syntax: { ...DARK_SYNTAX, comment: '#56627a', lineHighlight: '#141a28', lineNumber: '#38425a', lineNumberActive: '#9aa6bd' },
    ansi: DARK_ANSI,
  },
  light: {
    id: 'light',
    name: 'Light',
    kind: 'light',
    ui: {
      surface0: '#fbfbfc', surface3: '#ffffff', surface4: '#ececef',
      borderSubtle: '#ececef', borderDefault: '#dcdce1', borderStrong: '#c4c4cb',
      textPrimary: '#1d1d1f', textSecondary: '#55555c', textTertiary: '#8a8a92', textDisabled: '#b7b7bd',
      blue: '#2f6fe4', purple: '#6e4ff0', green: '#23955f', orange: '#b7791f', red: '#d0413a',
    },
    syntax: { ...LIGHT_SYNTAX, lineHighlight: '#f2f2f5', lineNumber: '#c0c0c6', lineNumberActive: '#55555c' },
    ansi: LIGHT_ANSI,
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    kind: 'light',
    ui: {
      surface0: '#f7f4ee', surface3: '#fffdf8', surface4: '#ebe6dc',
      borderSubtle: '#ece6db', borderDefault: '#ddd6c9', borderStrong: '#c8bfae',
      textPrimary: '#2b2722', textSecondary: '#5e574d', textTertiary: '#8d857a', textDisabled: '#b8b0a3',
      blue: '#2f6fb3', purple: '#7a52c7', green: '#3a8a5c', orange: '#b07a1f', red: '#c4473a',
    },
    syntax: { ...LIGHT_SYNTAX, text: '#2b2722', comment: '#a39a8b', lineHighlight: '#efeadf', lineNumber: '#c8bfae', lineNumberActive: '#5e574d' },
    ansi: { ...LIGHT_ANSI, black: '#2b2722' },
  },
}

export const THEME_LIST = Object.values(THEMES)

/** "system" → dark or light from macOS appearance. */
export function resolveTheme(setting: ThemeSetting): Theme {
  if (setting !== 'system') return THEMES[setting] ?? THEMES.dark
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  return dark ? THEMES.dark : THEMES.light
}

const rgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** Sets the UI colour tokens (CSS variables) on the document. */
export function applyUiTheme(theme: Theme): void {
  const u = theme.ui
  const vars: Record<string, string> = {
    '--surface-0': u.surface0,
    '--surface-3': u.surface3,
    '--surface-4': u.surface4,
    '--border-subtle': u.borderSubtle,
    '--border-default': u.borderDefault,
    '--border-strong': u.borderStrong,
    '--text-primary': u.textPrimary,
    '--text-secondary': u.textSecondary,
    '--text-tertiary': u.textTertiary,
    '--text-disabled': u.textDisabled,
    '--accent-blue': u.blue,
    '--accent-purple': u.purple,
    '--accent-green': u.green,
    '--accent-orange': u.orange,
    '--accent-red': u.red,
  }
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, rgb(v))
  root.dataset.kind = theme.kind
  root.style.colorScheme = theme.kind
}

/** Monaco theme for an app theme (registered as `flutvio-<id>`). */
export function monacoTheme(theme: Theme): Monaco.editor.IStandaloneThemeData {
  const s = theme.syntax
  const u = theme.ui
  const h = (c: string): string => c.replace('#', '')
  return {
    base: theme.kind === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: h(s.text) },
      { token: 'comment', foreground: h(s.comment), fontStyle: 'italic' },
      { token: 'comment.doc', foreground: h(s.doc), fontStyle: 'italic' },
      { token: 'keyword', foreground: h(s.keyword) },
      { token: 'constant', foreground: h(s.number) },
      { token: 'number', foreground: h(s.number) },
      { token: 'number.hex', foreground: h(s.number) },
      { token: 'string', foreground: h(s.string) },
      { token: 'string.escape', foreground: h(s.escape) },
      { token: 'variable.interpolation', foreground: h(s.escape) },
      { token: 'delimiter.interpolation', foreground: h(s.escape) },
      { token: 'type', foreground: h(s.type) },
      { token: 'type.identifier', foreground: h(s.type) },
      { token: 'function', foreground: h(s.fn) },
      { token: 'annotation', foreground: h(s.annotation) },
      { token: 'operator', foreground: h(s.operator) },
      { token: 'delimiter', foreground: h(s.delimiter) },
      { token: 'identifier', foreground: h(s.text) },
      { token: 'type.yaml', foreground: h(s.fn) },
      { token: 'string.key.json', foreground: h(s.fn) },
      { token: 'string.value.json', foreground: h(s.string) },
      { token: 'keyword.md', foreground: h(s.keyword) },
    ],
    colors: {
      'editor.background': u.surface0,
      'editor.foreground': s.text,
      'editorLineNumber.foreground': s.lineNumber,
      'editorLineNumber.activeForeground': s.lineNumberActive,
      'editor.lineHighlightBackground': s.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': `${u.blue}40`,
      'editor.inactiveSelectionBackground': `${u.blue}22`,
      'editor.selectionHighlightBackground': `${u.blue}1f`,
      'editor.wordHighlightBackground': theme.kind === 'dark' ? '#ffffff10' : '#00000010',
      'editorCursor.foreground': u.blue,
      'editorIndentGuide.background1': u.borderSubtle,
      'editorIndentGuide.activeBackground1': u.borderStrong,
      'editorWhitespace.foreground': u.borderDefault,
      'editorBracketMatch.background': `${u.blue}22`,
      'editorBracketMatch.border': '#00000000',
      'editorGutter.background': u.surface0,
      'editorStickyScroll.background': u.surface0,
      'editorStickyScrollHover.background': s.lineHighlight,
      'editorStickyScroll.shadow': '#00000000',
      'editorStickyScroll.border': '#00000000',
      'editorWidget.background': u.surface3,
      'editorWidget.border': u.borderDefault,
      'editorHoverWidget.background': u.surface3,
      'editorHoverWidget.border': u.borderDefault,
      'editorSuggestWidget.background': u.surface3,
      'editorSuggestWidget.border': u.borderDefault,
      'editorSuggestWidget.selectedBackground': u.surface4,
      'editorSuggestWidget.highlightForeground': u.blue,
      'editorError.foreground': u.red,
      'editorWarning.foreground': u.orange,
      'editorInfo.foreground': u.blue,
      'scrollbarSlider.background': theme.kind === 'dark' ? '#ffffff12' : '#0000001a',
      'scrollbarSlider.hoverBackground': theme.kind === 'dark' ? '#ffffff22' : '#0000002a',
      'scrollbarSlider.activeBackground': theme.kind === 'dark' ? '#ffffff2e' : '#00000036',
      'minimap.background': u.surface0,
      'editorOverviewRuler.border': '#00000000',
      'input.background': u.surface0,
      'input.border': u.borderDefault,
      focusBorder: `${u.blue}80`,
      'list.hoverBackground': u.surface4,
      'list.activeSelectionBackground': u.surface4,
      'list.activeSelectionForeground': u.textPrimary,
      'quickInput.background': u.surface3,
      // Diff: soft tints that follow the theme.
      'diffEditor.insertedLineBackground': `${u.green}1c`,
      'diffEditor.insertedTextBackground': `${u.green}33`,
      'diffEditor.removedLineBackground': `${u.red}1c`,
      'diffEditor.removedTextBackground': `${u.red}33`,
      'diffEditorGutter.insertedLineBackground': `${u.green}26`,
      'diffEditorGutter.removedLineBackground': `${u.red}26`,
      'diffEditor.diagonalFill': theme.kind === 'dark' ? '#ffffff0d' : '#0000000d',
      'diffEditor.unchangedRegionBackground': u.surface0,
      'diffEditor.unchangedRegionForeground': u.textTertiary,
      'diffEditor.border': '#00000000',
    },
  }
}

/** Terminal colours for an app theme. */
export function terminalTheme(theme: Theme): ITheme {
  // The terminal is the main surface: pure black in the default Dark theme (and Black);
  // tinted themes (Midnight) and light themes keep their own background.
  const background = theme.id === 'dark' || theme.id === 'black' ? '#000000' : theme.ui.surface0
  return {
    background,
    foreground: theme.syntax.text,
    cursor: theme.ui.blue,
    cursorAccent: background,
    selectionBackground: `${theme.ui.blue}40`,
    ...theme.ansi,
  }
}
