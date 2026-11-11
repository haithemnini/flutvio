/**
 * src/main/ptyTitle.ts
 * Flutvio — names a terminal tab after what is running in it (`claude`, `opencode`, `vim`, …).
 * Pure helpers (unit-tested); ptyManager supplies the foreground command line.
 */

import { basename } from 'node:path'

/** Runtimes that only host a script — the script is the interesting name. */
const WRAPPERS = new Set(['node', 'bun', 'deno', 'python', 'python3', 'ruby', 'npx', 'bunx', 'tsx', 'env', 'sh', 'bash'])
const GENERIC = new Set(['index', 'cli', 'main', 'bin', 'run', 'start', 'app', 'dist', 'lib', 'src', 'build', 'out'])

const clean = (s: string): string => basename(s).replace(/^-/, '').replace(/\.(m?js|cjs|ts|py|rb|sh)$/, '')

/** `2.1.321`: a binary stored under its version (…/claude/versions/2.1.321). */
const isVersion = (name: string): boolean => /^v?\d+(\.\d+)+$/.test(name)

/** Whether a process name says nothing by itself (a runtime hosting a script, or a version-named binary), so the command line is needed. */
export const isWrapper = (name: string): boolean => isVersion(clean(name)) || WRAPPERS.has(clean(name).replace(/[\d.]+$/, ''))

/**
 * Tab title for a foreground command line, e.g.
 *   "-zsh" → "zsh" · "claude --resume x" → "claude" · "node /opt/homebrew/bin/gemini" → "gemini"
 *   "node /x/node_modules/@scope/tool/dist/index.js" → "tool"
 */
export function titleFromCommand(command: string): string {
  const parts = command.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const first = clean(parts[0])
  if (isVersion(first)) {
    // …/share/claude/versions/2.1.321 → claude
    const named = parts[0].split('/').filter(Boolean).reverse().find((seg) => !isVersion(seg) && !['versions', 'bin', 'releases'].includes(seg))
    return named ? clean(named) : first
  }
  if (!isWrapper(first)) return first
  // First argument that is not a flag (or an env assignment) is the script.
  const script = parts.slice(1).find((p) => !p.startsWith('-') && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(p))
  if (!script) return first
  const segs = script.split('/').filter(Boolean)
  for (let i = segs.length - 1; i >= 0; i--) {
    const name = clean(segs[i])
    if (name && !GENERIC.has(name.toLowerCase()) && !name.startsWith('.')) return name
  }
  return first
}
