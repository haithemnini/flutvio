/**
 * virtualTabs.ts — editor tabs that are not files: diffs and pull requests.
 * A tab id is "diff:{json}" or "pr:{json}"; real files are plain absolute paths.
 */

export type DiffMode = 'work' | 'staged' | 'commit'

export interface DiffTab {
  kind: 'diff'
  root: string
  /** Path relative to the repository root. */
  path: string
  mode: DiffMode
  sha?: string
}

export interface PrTab {
  kind: 'pr'
  root: string
  number: number
  title?: string
}

export type VirtualTab = DiffTab | PrTab

export function tabId(t: VirtualTab): string {
  return `${t.kind}:${JSON.stringify(t)}`
}

export function parseTab(id: string): VirtualTab | null {
  const m = /^(diff|pr):(\{.*\})$/.exec(id)
  if (!m) return null
  try {
    return JSON.parse(m[2]) as VirtualTab
  } catch {
    return null
  }
}

export function isVirtual(id: string): boolean {
  return id.startsWith('diff:{') || id.startsWith('pr:{')
}

/** Name shown on the tab. */
export function tabLabel(id: string): string {
  const t = parseTab(id)
  if (!t) return id.split('/').pop() ?? id
  if (t.kind === 'pr') return `#${t.number}${t.title ? ` ${t.title}` : ''}`
  const name = t.path.split('/').pop() ?? t.path
  return t.mode === 'work' ? `${name} (changes)` : t.mode === 'staged' ? `${name} (staged)` : `${name} @ ${t.sha?.slice(0, 7)}`
}
