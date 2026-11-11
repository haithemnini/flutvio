/**
 * src/main/projectFiles.ts
 * Flutvio — project file browser and text file access (IPC: files:*).
 *
 * Only paths inside the open project are readable or writable.
 */

import { ipcMain } from 'electron'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { FileEntry, FileReadResult } from '../shared/flutvio-api'

/** Folders that are noisy and never useful to browse in the tree. */
const HIDDEN = new Set([
  '.git', '.dart_tool', '.idea', '.gradle', 'node_modules', 'Pods', 'DerivedData',
  '.flutter-plugins', '.flutter-plugins-dependencies', '.DS_Store', 'build',
])
const MAX_READ_BYTES = 2 * 1024 * 1024

let root: string | null = null
/** Files the user picked with File › Open File… (allowed even outside the project). */
const picked = new Set<string>()

export function allowFile(path: string): void {
  picked.add(resolve(path))
}

export function setFilesRoot(path: string | null): void {
  root = path ? realpathSync(path) : null
}

/** Resolves a path and refuses anything outside the project root. */
function inside(path: string): string {
  const full = resolve(path)
  if (picked.has(full)) return full
  if (!root) throw new Error('No project is open.')
  const rel = relative(root, full)
  if (rel.startsWith('..') || resolve(root, rel) !== full) throw new Error('Path is outside the project.')
  return full
}

export function listDir(dir: string): FileEntry[] {
  const full = inside(dir)
  return readdirSync(full, { withFileTypes: true })
    .filter((d) => !HIDDEN.has(d.name) && !d.name.startsWith('.'))
    .map((d) => ({
      name: d.name,
      path: join(full, d.name),
      isDir: d.isDirectory(),
    }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
}

export function readText(path: string): FileReadResult {
  const full = inside(path)
  const size = statSync(full).size
  const buf = readFileSync(full)
  const binary = buf.subarray(0, 8000).includes(0)
  if (binary) return { path: full, content: '', binary: true, truncated: false, size }
  const truncated = size > MAX_READ_BYTES
  return {
    path: full,
    content: (truncated ? buf.subarray(0, MAX_READ_BYTES) : buf).toString('utf8'),
    binary: false,
    truncated,
    size,
  }
}

export function writeText(path: string, content: string): void {
  const full = inside(path)
  if (!existsSync(full)) throw new Error('File no longer exists.')
  writeFileSync(full, content, 'utf8')
}

export function registerFilesIPC(): void {
  ipcMain.removeHandler('files:list')
  ipcMain.removeHandler('files:read')
  ipcMain.removeHandler('files:write')
  ipcMain.handle('files:list', (_e, dir: string) => listDir(dir))
  ipcMain.handle('files:read', (_e, path: string) => readText(path))
  ipcMain.handle('files:write', (_e, path: string, content: string) => writeText(path, content))
}
