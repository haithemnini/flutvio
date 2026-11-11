/**
 * src/main/worktreeService.ts
 * Flutvio — Git worktrees (IPC: git:*).
 *
 * A worktree is a second checkout of the same repository on another branch, in its own folder.
 * Flutvio puts new ones next to the repository:  <parent>/<repo>.worktrees/<branch>
 * so several agents / experiments can run in parallel without touching each other's files.
 *
 * The open Flutter project may live in a sub-folder of the repository; `projectIn()` maps the
 * project to the same sub-folder inside another worktree.
 */

import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import type { GitInfo, Worktree } from '../shared/flutvio-api'
import { resolveFlutterBin } from './flutterBin'

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('git', args, { cwd, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }, (err, out, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().split('\n').slice(-2).join(' ')))
      else resolve(out)
    }),
  )
}

/** Branch names git accepts (a safe subset: no spaces, no "..", no leading "-"). */
export function validBranch(name: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(name) && !name.startsWith('-') && !name.includes('..') && !name.endsWith('/') && !name.endsWith('.lock')
}

function parsePorcelain(out: string): Worktree[] {
  const list: Worktree[] = []
  let cur: Partial<Worktree> | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur?.path) list.push(cur as Worktree)
      cur = { path: line.slice(9), branch: '', head: '', bare: false, detached: false, locked: false, main: false }
    } else if (cur) {
      if (line.startsWith('HEAD ')) cur.head = line.slice(5)
      else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
      else if (line === 'bare') cur.bare = true
      else if (line === 'detached') cur.detached = true
      else if (line.startsWith('locked')) cur.locked = true
    }
  }
  if (cur?.path) list.push(cur as Worktree)
  if (list[0]) list[0].main = true
  return list
}

/** `flutter pub get` in a folder; best effort (errors show up later in the analyzer / Run). */
async function pubGet(cwd: string): Promise<void> {
  const flutter = await resolveFlutterBin()
  await new Promise<void>((resolve) => execFile(flutter, ['pub', 'get'], { cwd, timeout: 180_000 }, () => resolve()))
}

export class WorktreeService {
  /** Repository info for a folder, or null when it isn't inside a git repository. */
  async info(path: string): Promise<GitInfo | null> {
    if (!existsSync(path)) return null
    let top: string
    try {
      top = (await git(path, ['rev-parse', '--show-toplevel'])).trim()
    } catch {
      return null
    }
    const worktrees = parsePorcelain(await git(top, ['worktree', 'list', '--porcelain']))
    const current = worktrees.find((w) => w.path === top) ?? null
    const dirty = (await git(top, ['status', '--porcelain']).catch(() => '')).trim().length > 0
    return {
      root: top,
      // Sub-folder of the repository that holds the open project ('' when it is the root).
      subdir: relative(top, path),
      branch: current?.branch || (current?.detached ? current.head.slice(0, 7) : ''),
      dirty,
      worktrees: worktrees.filter((w) => !w.bare),
    }
  }

  /** Creates a worktree on a new branch (from the current HEAD) next to the main checkout. */
  async create(path: string, branch: string): Promise<Worktree> {
    if (!validBranch(branch)) throw new Error(`"${branch}" is not a valid branch name.`)
    const info = await this.info(path)
    if (!info) throw new Error('This project is not in a git repository.')
    const main = info.worktrees.find((w) => w.main) ?? info.worktrees[0]
    const base = join(dirname(main.path), `${basename(main.path)}.worktrees`)
    mkdirSync(base, { recursive: true })
    const target = join(base, branch.replace(/\//g, '-'))
    if (existsSync(target)) throw new Error(`A folder already exists at ${target}.`)
    const exists = await git(info.root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).then(
      () => true,
      () => false,
    )
    await git(info.root, exists ? ['worktree', 'add', target, branch] : ['worktree', 'add', '-b', branch, target])
    // A fresh checkout has no .dart_tool yet: fetch packages so the analyzer and Run work right away.
    const project = this.projectIn(target, info.subdir)
    if (existsSync(join(project, 'pubspec.yaml'))) await pubGet(project)
    const after = await this.info(target)
    return after!.worktrees.find((w) => w.path === target) ?? { path: target, branch, head: '', bare: false, detached: false, locked: false, main: false }
  }

  /** Removes a worktree folder (the branch is kept). Refuses when it has uncommitted changes unless forced. */
  async remove(worktreePath: string, force = false): Promise<void> {
    const info = await this.info(worktreePath)
    if (!info) throw new Error('Not a git worktree.')
    const wt = info.worktrees.find((w) => w.path === worktreePath)
    if (!wt) throw new Error('Not a git worktree.')
    if (wt.main) throw new Error('The main checkout cannot be removed.')
    const main = info.worktrees.find((w) => w.main)!
    await git(main.path, ['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath])
  }

  /** Path of the project inside another worktree (same sub-folder). */
  projectIn(worktreePath: string, subdir: string): string {
    return subdir ? join(worktreePath, subdir) : worktreePath
  }
}

export const worktreeService = new WorktreeService()

export function registerGitIPC(): void {
  for (const ch of ['git:info', 'git:createWorktree', 'git:removeWorktree']) ipcMain.removeHandler(ch)
  ipcMain.handle('git:info', (_e, path: string) => worktreeService.info(path))
  ipcMain.handle('git:createWorktree', (_e, path: string, branch: string) => worktreeService.create(path, branch))
  ipcMain.handle('git:removeWorktree', (_e, path: string, force?: boolean) => worktreeService.remove(path, force))
}
