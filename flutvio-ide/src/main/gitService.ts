/**
 * src/main/gitService.ts
 * Flutvio — source control (IPC: scm:*) and GitHub pull requests (IPC: gh:*).
 *
 *   git  — status, stage / unstage / discard, commit, fetch / pull / push, file contents at a ref,
 *          commit history for the graph, files of a commit, branches / switch.
 *   gh   — the GitHub CLI with the user's own login (`gh auth login`); Flutvio never sees a token.
 *          PR list / details / diff, comment, review, checkout, create, merge.
 */

import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { GhStatus, PrDetail, PrSummary, ScmCommit, ScmFile, ScmStatus } from '../shared/flutvio-api'

const GH_CANDIDATES = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh']

function exec(cmd: string, args: string[], cwd: string, input?: string, timeout = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { cwd, timeout, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } },
      (err, out, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim().split('\n').filter(Boolean).slice(-3).join(' ')))
        else resolve(out)
      },
    )
    if (input !== undefined) child.stdin?.end(input)
  })
}

const git = (cwd: string, args: string[], input?: string): Promise<string> => exec('git', args, cwd, input)
const ghBin = (): string => GH_CANDIDATES.find(existsSync) ?? 'gh'
const gh = (cwd: string, args: string[], input?: string): Promise<string> => exec(ghBin(), args, cwd, input, 90_000)

// ─── Parsing (exported for tests) ─────────────────────────────────────────────

/** `git status --porcelain=v2 --branch -z` → branch info + files. */
export function parseStatus(out: string): Omit<ScmStatus, 'root'> {
  let branch = ''
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const files: ScmFile[] = []
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]
    if (!line) continue
    if (line.startsWith('# branch.head ')) branch = line.slice(14)
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) [ahead, behind] = [Number(m[1]), Number(m[2])]
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // 1 XY sub mH mI mW hH hI path        2 XY … score path \0 origPath
      const f = line.split(' ')
      const xy = f[1]
      const path = line.startsWith('1 ') ? f.slice(8).join(' ') : f.slice(9).join(' ')
      const orig = line.startsWith('2 ') ? parts[++i] : undefined
      files.push({ path, orig, index: xy[0], work: xy[1] })
    } else if (line.startsWith('u ')) {
      const f = line.split(' ')
      files.push({ path: f.slice(10).join(' '), index: 'U', work: 'U', conflict: true })
    } else if (line.startsWith('? ')) {
      files.push({ path: line.slice(2), index: '.', work: '?' })
    }
  }
  if (branch === '(detached)') branch = ''
  return { branch, upstream, ahead, behind, files }
}

const SEP = '\x1f'
const END = '\x1e'

/** `git log` with the format used by `log()` → commits. */
export function parseLog(out: string): ScmCommit[] {
  return out
    .split(END)
    .map((r) => r.replace(/^\n/, ''))
    .filter(Boolean)
    .map((r) => {
      const [sha, parents, author, email, date, subject, refs] = r.split(SEP)
      return {
        sha,
        parents: parents ? parents.split(' ') : [],
        author,
        email,
        date: Number(date) * 1000,
        subject,
        refs: refs ? refs.split(', ').filter(Boolean) : [],
      }
    })
}

// ─── Git ──────────────────────────────────────────────────────────────────────

async function top(path: string): Promise<string> {
  return (await git(path, ['rev-parse', '--show-toplevel'])).trim()
}

export async function status(path: string): Promise<ScmStatus | null> {
  let root: string
  try {
    root = await top(path)
  } catch {
    return null
  }
  const out = await git(root, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'])
  return { root, ...parseStatus(out) }
}

export async function stage(root: string, paths: string[]): Promise<void> {
  if (paths.length) await git(root, ['add', '--', ...paths])
}

export async function unstage(root: string, paths: string[]): Promise<void> {
  if (!paths.length) return
  // Works before the first commit too (no HEAD yet).
  const hasHead = await git(root, ['rev-parse', '--verify', 'HEAD']).then(() => true, () => false)
  await git(root, hasHead ? ['restore', '--staged', '--', ...paths] : ['rm', '--cached', '-r', '--', ...paths])
}

/** Throws away working-tree changes (tracked files restored, untracked files deleted). */
export async function discard(root: string, paths: string[]): Promise<void> {
  if (!paths.length) return
  const st = await status(root)
  const untracked = new Set(st?.files.filter((f) => f.work === '?').map((f) => f.path))
  const tracked = paths.filter((p) => !untracked.has(p))
  const fresh = paths.filter((p) => untracked.has(p))
  if (tracked.length) await git(root, ['restore', '--worktree', '--', ...tracked])
  if (fresh.length) await git(root, ['clean', '-f', '--', ...fresh])
}

export async function commit(root: string, message: string, opts: { all?: boolean; amend?: boolean } = {}): Promise<string> {
  if (!message.trim() && !opts.amend) throw new Error('Write a commit message first.')
  if (opts.all) await git(root, ['add', '-A'])
  const args = ['commit', '--file=-']
  if (opts.amend) args.push('--amend')
  await git(root, args, message)
  return (await git(root, ['rev-parse', '--short', 'HEAD'])).trim()
}

export async function fetch(root: string): Promise<void> {
  await git(root, ['fetch', '--all', '--prune'])
}

export async function pull(root: string): Promise<void> {
  await git(root, ['pull', '--ff-only'])
}

export async function push(root: string): Promise<void> {
  const st = await status(root)
  if (st?.upstream) await git(root, ['push'])
  else await git(root, ['push', '--set-upstream', 'origin', 'HEAD'])
}

/** File contents at a ref: 'HEAD', ':' (the index), a commit sha, or 'WORKTREE'. '' when it doesn't exist there. */
export async function fileAt(root: string, ref: string, path: string): Promise<string> {
  try {
    if (ref === 'WORKTREE') {
      const { readFileSync } = await import('node:fs')
      return readFileSync(join(root, path), 'utf8')
    }
    return await git(root, ['show', `${ref === ':' ? '' : ref}:${path}`])
  } catch {
    return ''
  }
}

/**
 * Every uncommitted change as one unified diff (staged + unstaged against HEAD, plus untracked
 * text files as additions) — the live "what did the agent change" view.
 */
export async function workingDiff(root: string): Promise<string> {
  let out: string
  try {
    out = await git(root, ['diff', 'HEAD', '--no-color', '--no-ext-diff'])
  } catch {
    out = await git(root, ['diff', '--no-color', '--no-ext-diff']).catch(() => '') // no commits yet
  }
  const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z']).catch(() => ''))
    .split('\0')
    .filter(Boolean)
    .slice(0, 60)
  const { readFileSync, statSync } = await import('node:fs')
  for (const f of untracked) {
    try {
      const full = join(root, f)
      if (statSync(full).size > 256 * 1024) {
        out += `diff --git a/${f} b/${f}\nnew file mode 100644\nBinary files /dev/null and b/${f} differ\n`
        continue
      }
      const text = readFileSync(full, 'utf8')
      if (text.includes('\0')) {
        out += `diff --git a/${f} b/${f}\nnew file mode 100644\nBinary files /dev/null and b/${f} differ\n`
        continue
      }
      const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
      out += `diff --git a/${f} b/${f}\nnew file mode 100644\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1,${lines.length} @@\n`
      out += lines.map((l) => '+' + l).join('\n') + '\n'
    } catch {
      /* vanished meanwhile */
    }
  }
  return out
}

export async function log(root: string, limit = 300): Promise<ScmCommit[]> {
  const fmt = ['%H', '%P', '%an', '%ae', '%ct', '%s', '%D'].join(SEP) + END
  const out = await git(root, ['log', '--all', '--topo-order', `-n${limit}`, `--format=${fmt}`]).catch(() => '')
  return parseLog(out)
}

/** Files changed in a commit (against its first parent). */
export async function commitFiles(root: string, sha: string): Promise<Array<{ path: string; status: string }>> {
  const out = await git(root, ['show', '--first-parent', '--name-status', '--format=', '-z', sha])
  const parts = out.split('\0').filter(Boolean)
  const files: Array<{ path: string; status: string }> = []
  for (let i = 0; i < parts.length; i++) {
    const st = parts[i]
    if (/^[RC]/.test(st)) {
      files.push({ status: st[0], path: parts[i + 2] })
      i += 2
    } else {
      files.push({ status: st[0], path: parts[i + 1] })
      i += 1
    }
  }
  return files
}

export async function branches(root: string): Promise<Array<{ name: string; current: boolean; remote: boolean }>> {
  const out = await git(root, ['branch', '-a', '--format=%(HEAD)%09%(refname)'])
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [head, ref] = l.split('\t')
      const remote = ref.startsWith('refs/remotes/')
      return { name: ref.replace(/^refs\/(heads|remotes)\//, ''), current: head === '*', remote }
    })
    .filter((b) => !b.name.endsWith('/HEAD'))
}

export async function switchBranch(root: string, name: string, create = false): Promise<void> {
  await git(root, create ? ['switch', '-c', name] : ['switch', name])
}

// ─── GitHub (gh) ──────────────────────────────────────────────────────────────

export async function ghStatus(root: string): Promise<GhStatus> {
  const bin = ghBin()
  if (bin === 'gh' && !(await exec('which', ['gh'], root).then(() => true, () => false))) {
    return { installed: false, authed: false, user: null, repo: null, url: null }
  }
  const user = await gh(root, ['api', 'user', '--jq', '.login']).then((s) => s.trim(), () => null)
  if (!user) return { installed: true, authed: false, user: null, repo: null, url: null }
  const repo = await gh(root, ['repo', 'view', '--json', 'nameWithOwner,url'])
    .then((s) => JSON.parse(s) as { nameWithOwner: string; url: string })
    .catch(() => null)
  return { installed: true, authed: true, user, repo: repo?.nameWithOwner ?? null, url: repo?.url ?? null }
}

const R = (repo?: string): string[] => (repo ? ['-R', repo] : [])

export async function prList(root: string, state: 'open' | 'closed' | 'merged' | 'all' = 'open', repo?: string): Promise<PrSummary[]> {
  const out = await gh(root, [
    'pr', 'list', ...R(repo), '--state', state, '--limit', '50', '--json',
    'number,title,author,headRefName,baseRefName,isDraft,updatedAt,reviewDecision,url,additions,deletions,state',
  ])
  return (JSON.parse(out) as Array<Record<string, unknown>>).map((p) => ({
    number: p.number as number,
    title: p.title as string,
    author: (p.author as { login?: string })?.login ?? '',
    head: p.headRefName as string,
    base: p.baseRefName as string,
    draft: Boolean(p.isDraft),
    updatedAt: Date.parse(p.updatedAt as string),
    reviewDecision: (p.reviewDecision as string) || null,
    url: p.url as string,
    additions: (p.additions as number) ?? 0,
    deletions: (p.deletions as number) ?? 0,
    state: p.state as string,
  }))
}

export async function prView(root: string, number: number, repo?: string): Promise<PrDetail> {
  const out = await gh(root, [
    'pr', 'view', String(number), ...R(repo), '--json',
    'number,title,body,author,state,isDraft,headRefName,baseRefName,url,reviewDecision,reviews,comments,files,statusCheckRollup,additions,deletions,mergeable,createdAt',
  ])
  const p = JSON.parse(out) as Record<string, any>
  return {
    number: p.number,
    title: p.title,
    body: p.body ?? '',
    author: p.author?.login ?? '',
    state: p.state,
    draft: Boolean(p.isDraft),
    head: p.headRefName,
    base: p.baseRefName,
    url: p.url,
    reviewDecision: p.reviewDecision || null,
    mergeable: p.mergeable ?? null,
    createdAt: Date.parse(p.createdAt),
    additions: p.additions ?? 0,
    deletions: p.deletions ?? 0,
    files: (p.files ?? []).map((f: any) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
    checks: (p.statusCheckRollup ?? []).map((c: any) => ({
      name: c.name ?? c.context ?? 'check',
      status: (c.conclusion || c.state || c.status || '').toString().toLowerCase(),
    })),
    timeline: [
      ...(p.comments ?? []).map((c: any) => ({ kind: 'comment' as const, author: c.author?.login ?? '', body: c.body ?? '', at: Date.parse(c.createdAt) })),
      ...(p.reviews ?? []).map((r: any) => ({
        kind: 'review' as const,
        author: r.author?.login ?? '',
        body: r.body ?? '',
        state: r.state,
        at: Date.parse(r.submittedAt ?? r.createdAt),
      })),
    ].sort((a, b) => a.at - b.at),
  }
}

export async function prDiff(root: string, number: number, repo?: string): Promise<string> {
  return gh(root, ['pr', 'diff', String(number), ...R(repo), '--color', 'never'])
}

export async function prComment(root: string, number: number, body: string, repo?: string): Promise<void> {
  if (!body.trim()) throw new Error('Write a comment first.')
  await gh(root, ['pr', 'comment', String(number), ...R(repo), '--body-file', '-'], body)
}

export async function prReview(root: string, number: number, action: 'approve' | 'request-changes' | 'comment', body: string, repo?: string): Promise<void> {
  if (action !== 'approve' && !body.trim()) throw new Error('Write a review comment first.')
  await gh(root, ['pr', 'review', String(number), ...R(repo), `--${action}`, '--body-file', '-'], body)
}

export async function prCheckout(root: string, number: number): Promise<void> {
  await gh(root, ['pr', 'checkout', String(number)])
}

export async function prCreate(root: string, opts: { title: string; body: string; base?: string; draft?: boolean }): Promise<string> {
  if (!opts.title.trim()) throw new Error('Give the pull request a title.')
  const args = ['pr', 'create', '--title', opts.title, '--body-file', '-']
  if (opts.base) args.push('--base', opts.base)
  if (opts.draft) args.push('--draft')
  return (await gh(root, args, opts.body)).trim().split('\n').pop() ?? ''
}

export async function prMerge(root: string, number: number, method: 'merge' | 'squash' | 'rebase'): Promise<void> {
  await gh(root, ['pr', 'merge', String(number), `--${method}`])
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

export function registerScmIPC(): void {
  const handlers: Record<string, (...args: never[]) => unknown> = {
    'scm:status': (p: string) => status(p),
    'scm:stage': (r: string, paths: string[]) => stage(r, paths),
    'scm:unstage': (r: string, paths: string[]) => unstage(r, paths),
    'scm:discard': (r: string, paths: string[]) => discard(r, paths),
    'scm:commit': (r: string, m: string, o: { all?: boolean; amend?: boolean }) => commit(r, m, o),
    'scm:fetch': (r: string) => fetch(r),
    'scm:pull': (r: string) => pull(r),
    'scm:push': (r: string) => push(r),
    'scm:fileAt': (r: string, ref: string, p: string) => fileAt(r, ref, p),
    'scm:log': (r: string, n?: number) => log(r, n),
    'scm:workingDiff': (r: string) => workingDiff(r),
    'scm:commitFiles': (r: string, sha: string) => commitFiles(r, sha),
    'scm:branches': (r: string) => branches(r),
    'scm:switch': (r: string, name: string, create?: boolean) => switchBranch(r, name, create),
    'gh:status': (r: string) => ghStatus(r),
    'gh:prList': (r: string, s: 'open' | 'closed' | 'merged' | 'all', repo?: string) => prList(r, s, repo),
    'gh:prView': (r: string, n: number, repo?: string) => prView(r, n, repo),
    'gh:prDiff': (r: string, n: number, repo?: string) => prDiff(r, n, repo),
    'gh:prComment': (r: string, n: number, body: string, repo?: string) => prComment(r, n, body, repo),
    'gh:prReview': (r: string, n: number, a: 'approve' | 'request-changes' | 'comment', body: string, repo?: string) => prReview(r, n, a, body, repo),
    'gh:prCheckout': (r: string, n: number) => prCheckout(r, n),
    'gh:prCreate': (r: string, o: { title: string; body: string; base?: string; draft?: boolean }) => prCreate(r, o),
    'gh:prMerge': (r: string, n: number, m: 'merge' | 'squash' | 'rebase') => prMerge(r, n, m),
  }
  for (const [ch, fn] of Object.entries(handlers)) {
    ipcMain.removeHandler(ch)
    ipcMain.handle(ch, (_e, ...args) => fn(...(args as never[])))
  }
}
