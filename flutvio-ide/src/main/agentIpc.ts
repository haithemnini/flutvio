/**
 * src/main/agentIpc.ts
 * Flutvio — wires the agent monitor to the terminals and the renderer (IPC: agent:*).
 */

import { BrowserWindow, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { AgentMonitor } from './agentMonitor'
import type { PtyManager } from './ptyManager'

let claudeBin: Promise<string> | null = null
/** `claude` as the user's login shell finds it (the app's own PATH is shorter when launched from Finder). */
function findClaude(): Promise<string> {
  claudeBin ??= new Promise((ok) =>
    execFile(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v claude'], { timeout: 6000 }, (err, out) => {
      const found = err ? '' : out.trim().split('\n').pop() ?? ''
      const fallback = [join(homedir(), '.local/bin/claude'), join(homedir(), '.claude/local/claude')].find(existsSync)
      ok(found.startsWith('/') ? found : fallback ?? 'claude')
    }),
  )
  return claudeBin
}

export function registerAgentIPC(win: BrowserWindow, ptys: PtyManager): AgentMonitor {
  const monitor = new AgentMonitor(ptys, (channel, ...args) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  })
  ptys.hooks = {
    output: (id) => monitor.output(id),
    input: (id) => monitor.input(id),
    title: (id, title) => monitor.title(id, title),
    gone: (id) => monitor.forget(id),
  }
  for (const ch of ['agent:watch', 'agent:connections']) ipcMain.removeHandler(ch)
  ipcMain.handle('agent:watch', (_e, termId: string | null) => monitor.watch(termId))
  ipcMain.handle('agent:connections', async (_e, cwd: string, refresh: boolean) => monitor.connections(cwd, refresh, await findClaude()))
  win.on('closed', () => monitor.stop())
  return monitor
}
