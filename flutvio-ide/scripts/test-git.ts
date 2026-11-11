/**
 * scripts/test-git.ts — gitService against a throwaway repository with a local bare "remote".
 * GitHub part is read-only (public flutter/flutter PRs) and skipped when gh is missing / offline.
 * Run: npx tsx scripts/test-git.ts
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as scm from '../src/main/gitService'

let passed = 0
let failed = 0
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed++
    console.log(`FAIL  ${name}\n      ${(err as Error).message}`)
  }
}
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const base = realpathSync(mkdtempSync(join(tmpdir(), 'flutvio-git-')))
const remote = join(base, 'remote.git')
const repo = join(base, 'repo')
const g = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' })
g(base, 'init', '-q', '--bare', '-b', 'main', remote)
g(base, 'init', '-q', '-b', 'main', repo)
g(repo, 'config', 'user.email', 'test@example.com')
g(repo, 'config', 'user.name', 'Test')
g(repo, 'remote', 'add', 'origin', remote)
writeFileSync(join(repo, 'a.txt'), 'one\n')
writeFileSync(join(repo, 'b.txt'), 'bee\n')
g(repo, 'add', '.')
g(repo, 'commit', '-qm', 'first')

async function main(): Promise<void> {
  await test('status outside a repo is null', async () => {
    assert((await scm.status(base)) === null, 'expected null')
  })

  await test('status: modified, untracked, staged, renamed', async () => {
    writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n')
    writeFileSync(join(repo, 'new file.txt'), 'hi\n')
    renameSync(join(repo, 'b.txt'), join(repo, 'c.txt'))
    g(repo, 'add', '-A', 'b.txt', 'c.txt')
    const st = await scm.status(repo)
    assert(st && st.branch === 'main', `branch ${st?.branch}`)
    const by = Object.fromEntries(st!.files.map((f) => [f.path, f]))
    assert(by['a.txt']?.work === 'M' && by['a.txt'].index === '.', `a.txt ${JSON.stringify(by['a.txt'])}`)
    assert(by['new file.txt']?.work === '?', 'untracked with a space in the name')
    assert(by['c.txt']?.index === 'R' && by['c.txt'].orig === 'b.txt', `rename ${JSON.stringify(by['c.txt'])}`)
  })

  await test('stage / unstage', async () => {
    await scm.stage(repo, ['a.txt'])
    let a = (await scm.status(repo))!.files.find((f) => f.path === 'a.txt')!
    assert(a.index === 'M' && a.work === '.', `staged ${JSON.stringify(a)}`)
    await scm.unstage(repo, ['a.txt'])
    a = (await scm.status(repo))!.files.find((f) => f.path === 'a.txt')!
    assert(a.index === '.' && a.work === 'M', `unstaged ${JSON.stringify(a)}`)
  })

  await test('fileAt HEAD / index / worktree', async () => {
    assert((await scm.fileAt(repo, 'HEAD', 'a.txt')) === 'one\n', 'HEAD')
    assert((await scm.fileAt(repo, 'WORKTREE', 'a.txt')) === 'one\ntwo\n', 'worktree')
    assert((await scm.fileAt(repo, 'HEAD', 'missing.txt')) === '', 'missing → empty')
  })

  await test('discard restores tracked and deletes untracked', async () => {
    writeFileSync(join(repo, 'junk.txt'), 'x')
    await scm.discard(repo, ['a.txt', 'junk.txt'])
    const st = (await scm.status(repo))!
    assert(!st.files.some((f) => f.path === 'a.txt'), 'a.txt restored')
    assert(!existsSync(join(repo, 'junk.txt')), 'junk deleted')
  })

  await test('commit (all) and push sets upstream', async () => {
    const sha = await scm.commit(repo, 'second\n\nbody', { all: true })
    assert(/^[0-9a-f]{7,}$/.test(sha), `sha ${sha}`)
    await scm.push(repo)
    const st = (await scm.status(repo))!
    assert(st.upstream === 'origin/main' && st.ahead === 0 && st.files.length === 0, `after push ${JSON.stringify(st)}`)
  })

  await test('ahead count, empty message rejected, amend', async () => {
    writeFileSync(join(repo, 'a.txt'), 'three\n')
    let threw = false
    await scm.commit(repo, '  ', { all: true }).catch(() => (threw = true))
    assert(threw, 'empty message should fail')
    await scm.commit(repo, 'third', { all: true })
    assert((await scm.status(repo))!.ahead === 1, 'ahead 1')
    await scm.commit(repo, 'third (amended)', { amend: true })
    assert(g(repo, 'log', '-1', '--format=%s').trim() === 'third (amended)', 'amended')
  })

  await test('log has parents + refs; commitFiles lists the change', async () => {
    const commits = await scm.log(repo)
    assert(commits.length === 3, `commits ${commits.length}`)
    assert(commits[0].parents[0] === commits[1].sha, 'parent link')
    assert(commits[0].refs.some((r) => r.includes('HEAD -> main')), `refs ${commits[0].refs}`)
    assert(commits[1].refs.some((r) => r.includes('origin/main')), 'remote ref')
    const files = await scm.commitFiles(repo, commits[0].sha)
    assert(files.length === 1 && files[0].path === 'a.txt' && files[0].status === 'M', JSON.stringify(files))
    const second = await scm.commitFiles(repo, commits[1].sha)
    assert(second.some((f) => f.status === 'A' && f.path === 'new file.txt'), JSON.stringify(second))
  })

  await test('branches and switch', async () => {
    await scm.switchBranch(repo, 'feature/x', true)
    const list = await scm.branches(repo)
    assert(list.find((b) => b.name === 'feature/x')?.current, 'feature/x current')
    assert(list.some((b) => b.name === 'origin/main' && b.remote), 'remote branch listed')
    await scm.switchBranch(repo, 'main')
    assert((await scm.status(repo))!.branch === 'main', 'back on main')
  })

  await test('pull --ff-only brings a commit from the remote', async () => {
    await scm.push(repo)
    const other = join(base, 'other')
    g(base, 'clone', '-q', remote, other)
    g(other, 'config', 'user.email', 'o@example.com')
    g(other, 'config', 'user.name', 'Other')
    writeFileSync(join(other, 'z.txt'), 'z\n')
    g(other, 'add', '.')
    g(other, 'commit', '-qm', 'from other')
    g(other, 'push', '-q')
    await scm.fetch(repo)
    assert((await scm.status(repo))!.behind === 1, 'behind 1 after fetch')
    await scm.pull(repo)
    assert(existsSync(join(repo, 'z.txt')) && (await scm.status(repo))!.behind === 0, 'pulled')
  })

  // ── GitHub, read-only ──
  const ghOk = await scm.ghStatus(repo).catch(() => null)
  if (ghOk?.installed && ghOk.authed) {
    await test('gh: status shows the signed-in user (local repo has no GitHub remote)', async () => {
      assert(ghOk.user && ghOk.repo === null, JSON.stringify(ghOk))
    })
    await test('gh: list, view and diff a public PR (flutter/flutter, read-only)', async () => {
      const prs = await scm.prList(repo, 'open', 'flutter/flutter')
      assert(prs.length > 0 && prs[0].number > 0 && prs[0].title, `prs ${prs.length}`)
      const d = await scm.prView(repo, prs[0].number, 'flutter/flutter')
      assert(d.number === prs[0].number && Array.isArray(d.files) && Array.isArray(d.timeline), 'detail')
      const diff = await scm.prDiff(repo, prs[0].number, 'flutter/flutter')
      assert(diff.includes('diff --git'), 'unified diff')
    })
  } else {
    console.log('SKIP  gh tests (gh not installed or not signed in)')
  }

  rmSync(base, { recursive: true, force: true })
  console.log(`\n${passed}/${passed + failed} passed`)
  if (failed) process.exit(1)
}

void main()
