/**
 * src/main/flutterBin.ts
 * Finds the `flutter` executable.
 *
 * An app opened from Finder/Dock does not inherit the user's shell PATH, so
 * `flutter` is often not found even though it works in Terminal. Order:
 *   1. FLUTVIO_FLUTTER env var (explicit override)
 *   2. PATH of this process
 *   3. The user's login shell (`$SHELL -lc 'command -v flutter'`)
 *   4. Common install locations
 */

import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

let cached: Promise<string> | null = null

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function fromPath(): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && isExecutable(join(dir, 'flutter'))) return join(dir, 'flutter')
  }
  return null
}

function fromLoginShell(): Promise<string | null> {
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve) => {
    execFile(shell, ['-lc', 'command -v flutter'], { timeout: 5000 }, (err, stdout) => {
      const found = stdout?.trim().split('\n').pop() ?? ''
      resolve(!err && found && isExecutable(found) ? found : null)
    })
  })
}

const COMMON_LOCATIONS = [
  join(homedir(), 'develop/flutter/bin/flutter'),
  join(homedir(), 'flutter/bin/flutter'),
  join(homedir(), 'fvm/default/bin/flutter'),
  '/opt/homebrew/bin/flutter',
  '/usr/local/bin/flutter',
]

export function resolveFlutterBin(): Promise<string> {
  cached ??= (async () => {
    const override = process.env.FLUTVIO_FLUTTER
    if (override && isExecutable(override)) return override
    return fromPath() ?? (await fromLoginShell()) ?? COMMON_LOCATIONS.find(isExecutable) ?? 'flutter'
  })()
  return cached
}
