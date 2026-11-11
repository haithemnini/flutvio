/**
 * scripts/test-worktrees.ts — WorktreeService against a throwaway git repository.
 * Run: npx tsx scripts/test-worktrees.ts
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validBranch, WorktreeService } from '../src/main/worktreeService'

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

const base = realpathSync(mkdtempSync(join(tmpdir(), 'flutvio-wt-')))
const repo = join(base, 'myrepo')
const app = join(repo, 'app') // Flutter project in a sub-folder
mkdirSync(app, { recursive: true })
const g = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' })
g(repo, 'init', '-q', '-b', 'main')
g(repo, 'config', 'user.email', 'test@example.com')
g(repo, 'config', 'user.name', 'Test')
writeFileSync(join(app, 'pubspec.yaml'), 'name: app\n')
g(repo, 'add', '.')
g(repo, 'commit', '-qm', 'init')

const svc = new WorktreeService()

async function main(): Promise<void> {
  await test('info outside a repo is null', async () => {
    assert((await svc.info(base)) === null, 'expected null')
  })

  await test('info reports root, sub-folder, branch, one worktree', async () => {
    const info = await svc.info(app)
    assert(info, 'no info')
    assert(info!.root === repo, `root ${info!.root}`)
    assert(info!.subdir === 'app', `subdir ${info!.subdir}`)
    assert(info!.branch === 'main', `branch ${info!.branch}`)
    assert(info!.worktrees.length === 1 && info!.worktrees[0].main, 'one main worktree')
    assert(!info!.dirty, 'clean')
  })

  await test('rejects bad branch names', async () => {
    assert(!validBranch('a b') && !validBranch('-x') && !validBranch('a..b') && validBranch('feature/login'), 'validBranch')
    let threw = false
    await svc.create(app, 'bad name').catch(() => (threw = true))
    assert(threw, 'expected an error')
  })

  let wtPath = ''
  await test('creates a worktree next to the repo on a new branch', async () => {
    const wt = await svc.create(app, 'feature/login')
    wtPath = wt.path
    assert(wt.path === join(base, 'myrepo.worktrees', 'feature-login'), `path ${wt.path}`)
    assert(wt.branch === 'feature/login', `branch ${wt.branch}`)
    assert(existsSync(join(svc.projectIn(wt.path, 'app'), 'pubspec.yaml')), 'project copy exists in sub-folder')
    const info = await svc.info(app)
    assert(info!.worktrees.length === 2, `worktrees ${info!.worktrees.length}`)
    const inWt = await svc.info(svc.projectIn(wt.path, 'app'))
    assert(inWt!.branch === 'feature/login' && inWt!.subdir === 'app', 'info from inside the worktree')
  })

  await test('refuses to create the same worktree twice', async () => {
    let threw = false
    await svc.create(app, 'feature/login').catch(() => (threw = true))
    assert(threw, 'expected an error')
  })

  await test('refuses to remove the main checkout', async () => {
    let threw = false
    await svc.remove(repo).catch(() => (threw = true))
    assert(threw, 'expected an error')
  })

  await test('refuses to remove a dirty worktree unless forced', async () => {
    writeFileSync(join(wtPath, 'app', 'new.txt'), 'x')
    assert((await svc.info(wtPath))!.dirty, 'dirty')
    let threw = false
    await svc.remove(wtPath).catch(() => (threw = true))
    assert(threw, 'expected an error without force')
    await svc.remove(wtPath, true)
    assert(!existsSync(wtPath), 'folder removed')
    const info = await svc.info(app)
    assert(info!.worktrees.length === 1, 'back to one worktree')
    assert(g(repo, 'branch', '--list', 'feature/login').trim() !== '', 'branch kept')
  })

  rmSync(base, { recursive: true, force: true })
  console.log(`\n${passed}/${passed + failed} passed`)
  if (failed) process.exit(1)
}

void main()
