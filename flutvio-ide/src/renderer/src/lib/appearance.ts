/**
 * appearance.ts — applies the theme and interface zoom from the settings, and follows macOS
 * appearance when the theme is "System". Editor and terminals react through onThemeChange().
 */

import { useSyncExternalStore } from 'react'
import { monaco } from './monaco'
import { getSettings, subscribeSettings } from './settings'
import { applyUiTheme, resolveTheme, type Theme } from './themes'

let current: Theme = resolveTheme(getSettings().theme)
const listeners = new Set<() => void>()
let started = false

function apply(): void {
  const s = getSettings()
  const theme = resolveTheme(s.theme)
  applyUiTheme(theme)
  monaco.editor.setTheme(`flutvio-${theme.id}`)
  window.flutvio.ui.setZoom(s.uiScale)
  window.flutvio.ui.setBackground(theme.ui.surface0)
  if (theme !== current) {
    current = theme
    for (const l of listeners) l()
  }
}

/** Call once at startup. */
export function startAppearance(): void {
  if (started) return
  started = true
  apply()
  subscribeSettings(apply)
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', apply)
}

export function currentTheme(): Theme {
  return current
}

export function onThemeChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useTheme(): Theme {
  return useSyncExternalStore(onThemeChange, () => current)
}
