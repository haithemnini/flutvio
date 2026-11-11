/**
 * scripts/test-graph.ts — commit-graph lanes and unified-diff parsing.
 * Run: npx tsx scripts/test-graph.ts
 */

import { layoutGraph } from '../src/renderer/src/lib/graph'
import { parseUnifiedDiff } from '../src/renderer/src/lib/unifiedDiff'

let passed = 0
let failed = 0
function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed++
    console.log(`FAIL  ${name}\n      ${(err as Error).message}`)
  }
}
function eq(a: unknown, b: unknown, msg: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`)
}

test('linear history stays in lane 0', () => {
  const rows = layoutGraph([
    { sha: 'c', parents: ['b'] },
    { sha: 'b', parents: ['a'] },
    { sha: 'a', parents: [] },
  ])
  eq(rows.map((r) => r.col), [0, 0, 0], 'cols')
  eq(rows[2].after, [], 'root closes the lane')
})

test('branch + merge uses a second lane and joins back', () => {
  // m merges f into main: m(p: c, f), f(p: b), c(p: b), b(p: a), a
  const rows = layoutGraph([
    { sha: 'm', parents: ['c', 'f'] },
    { sha: 'f', parents: ['b'] },
    { sha: 'c', parents: ['b'] },
    { sha: 'b', parents: ['a'] },
    { sha: 'a', parents: [] },
  ])
  eq(rows.map((r) => r.col), [0, 1, 0, 0, 0], 'cols')
  eq(rows[0].after, ['c', 'f'], 'merge opens lane 1 for f')
  eq(rows[2].after, ['b', 'b'], 'both lanes still head to b')
  eq(rows[3].after, ['a'], 'they join at b, lane 1 closes')
})

test('unified diff: files, status, line numbers, counts', () => {
  const files = parseUnifiedDiff(
    [
      'diff --git a/lib/a.dart b/lib/a.dart',
      'index 1..2 100644',
      '--- a/lib/a.dart',
      '+++ b/lib/a.dart',
      '@@ -1,3 +1,3 @@ class A {',
      ' one',
      '-two',
      '+TWO',
      ' three',
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1 @@',
      '+hello',
    ].join('\n'),
  )
  eq(files.length, 2, 'files')
  eq([files[0].additions, files[0].deletions], [1, 1], 'counts')
  eq(files[0].lines.filter((l) => l.kind === 'add')[0].newNo, 2, 'new line number')
  eq(files[0].lines.filter((l) => l.kind === 'del')[0].oldNo, 2, 'old line number')
  eq(files[1].status, 'added', 'added')
})

console.log(`\n${passed}/${passed + failed} passed`)
if (failed) process.exit(1)
