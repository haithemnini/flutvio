/**
 * agents.ts — the coding agents Flutvio recognises in a terminal (by the program's name).
 * Anything else that runs is just a command.
 */

export const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', 'nu', 'pwsh', 'login'])

export const AGENTS: Record<string, { name: string; color: string }> = {
  claude: { name: 'Claude Code', color: '#d97757' },
  opencode: { name: 'OpenCode', color: '#f5a742' },
  codex: { name: 'Codex', color: '#10a37f' },
  gemini: { name: 'Gemini', color: '#4d8cf5' },
  aider: { name: 'Aider', color: '#14b014' },
  'cursor-agent': { name: 'Cursor Agent', color: '#a78bfa' },
  amp: { name: 'Amp', color: '#f34e3f' },
  goose: { name: 'Goose', color: '#e5e5e5' },
  qwen: { name: 'Qwen', color: '#615ced' },
  crush: { name: 'Crush', color: '#ff5faf' },
}

export const isShell = (process: string | undefined): boolean => !process || SHELLS.has(process)
export const isAgent = (process: string | undefined): boolean => Boolean(process && AGENTS[process])
export const agentName = (process: string): string => AGENTS[process]?.name ?? process
export const processColor = (process: string): string => AGENTS[process]?.color ?? 'rgb(var(--text-tertiary))'

/** 89234 → "89.2K", 1200000 → "1.2M". */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(n)
}

/** Context fill → colour: calm, getting full, about to compact. */
export function contextTone(percent: number): { bar: string; text: string } {
  if (percent >= 85) return { bar: 'bg-accent-red', text: 'text-accent-red' }
  if (percent >= 65) return { bar: 'bg-accent-orange', text: 'text-accent-orange' }
  return { bar: 'bg-accent-green', text: 'text-accent-green' }
}
