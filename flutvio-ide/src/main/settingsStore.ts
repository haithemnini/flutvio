/**
 * src/main/settingsStore.ts
 * Tiny JSON settings file in the app's userData folder.
 */

import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface Settings {
  lastProjectPath?: string
  lastDeviceId?: string
  /** Most recent first. */
  recentProjects?: string[]
}

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Settings
  } catch {
    return {}
  }
}

export function saveSettings(patch: Partial<Settings>): void {
  const next = { ...loadSettings(), ...patch }
  try {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch (err) {
    console.error('[settings] could not save:', err)
  }
}

/** Puts a project at the top of the recent list (max 10). */
export function addRecentProject(path: string): string[] {
  const list = [path, ...(loadSettings().recentProjects ?? []).filter((p) => p !== path)].slice(0, 10)
  saveSettings({ recentProjects: list })
  return list
}
