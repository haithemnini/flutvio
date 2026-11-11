/**
 * settings.ts — user settings (Settings window, ⌘,). Remembered in localStorage (userData),
 * shared by every component through useSettings(); changes apply immediately.
 */

import { useSyncExternalStore } from 'react'
import type { ThemeSetting } from './themes'

export interface Settings {
  // Appearance
  theme: ThemeSetting
  /** Whole-window zoom (text, icons, panels). */
  uiScale: number
  // Editor
  editorFontFamily: string
  editorFontSize: number
  editorLineHeight: number
  editorTabSize: number
  editorWordWrap: boolean
  editorMinimap: boolean
  editorLigatures: boolean
  editorStickyScroll: boolean
  editorFormatOnSave: boolean
  editorWhitespace: boolean
  editorCursor: 'line' | 'block' | 'underline'
  // Terminal
  terminalFontSize: number
  terminalCursor: 'block' | 'bar' | 'underline'
  terminalCursorBlink: boolean
  // Flutter
  reloadOnSave: boolean
  // Simulator
  simFps: 30 | 60
  simShowFrame: boolean
  // General
  onboardingDone: boolean
  /** App version whose "What's new" was last shown. */
  lastSeenVersion: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  uiScale: 1,
  editorFontFamily: 'JetBrains Mono',
  editorFontSize: 12.5,
  editorLineHeight: 20,
  editorTabSize: 2,
  editorWordWrap: false,
  editorMinimap: true,
  editorLigatures: true,
  editorStickyScroll: true,
  editorFormatOnSave: true,
  editorWhitespace: false,
  editorCursor: 'line',
  terminalFontSize: 12.5,
  terminalCursor: 'block',
  terminalCursorBlink: true,
  reloadOnSave: true,
  simFps: 60,
  simShowFrame: true,
  onboardingDone: false,
  lastSeenVersion: '',
}

const KEY = 'flutvio.settings'
const OLD_KEY = 'flutvio.prefs'

let state: Settings = (() => {
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? '{}') as Partial<Settings>
    const cur = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...old, ...cur }
  } catch {
    return DEFAULT_SETTINGS
  }
})()
const listeners = new Set<() => void>()

export function getSettings(): Settings {
  return state
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (state[key] === value) return
  state = { ...state, [key]: value }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  for (const l of listeners) l()
}

export function resetSettings(keys: Array<keyof Settings>): void {
  for (const k of keys) setSetting(k, DEFAULT_SETTINGS[k] as never)
}

export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, () => state)
}

/** Font stacks for the editor / terminal font setting. */
export const MONO_FONTS: Array<{ id: string; label: string; stack: string }> = [
  { id: 'JetBrains Mono', label: 'JetBrains Mono', stack: '"JetBrains Mono", "IBM Plex Sans Arabic", monospace' },
  { id: 'SF Mono', label: 'SF Mono', stack: '"SF Mono", ui-monospace, "IBM Plex Sans Arabic", monospace' },
  { id: 'Menlo', label: 'Menlo', stack: 'Menlo, "IBM Plex Sans Arabic", monospace' },
  { id: 'Fira Code', label: 'Fira Code (if installed)', stack: '"Fira Code", "JetBrains Mono", "IBM Plex Sans Arabic", monospace' },
]

export function fontStack(id: string): string {
  return MONO_FONTS.find((f) => f.id === id)?.stack ?? MONO_FONTS[0].stack
}
