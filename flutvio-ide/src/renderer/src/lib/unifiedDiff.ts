/**
 * unifiedDiff.ts — parses `git diff` / `gh pr diff` output into files → hunks → lines.
 */

export interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'hunk'
  text: string
  oldNo?: number
  newNo?: number
}

export interface DiffFile {
  path: string
  oldPath: string
  status: 'added' | 'deleted' | 'renamed' | 'modified' | 'binary'
  additions: number
  deletions: number
  lines: DiffLine[]
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let cur: DiffFile | null = null
  let oldNo = 0
  let newNo = 0
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(raw)
      cur = { path: m?.[2] ?? raw.slice(11), oldPath: m?.[1] ?? '', status: 'modified', additions: 0, deletions: 0, lines: [] }
      files.push(cur)
      continue
    }
    if (!cur) continue
    if (raw.startsWith('new file mode')) cur.status = 'added'
    else if (raw.startsWith('deleted file mode')) cur.status = 'deleted'
    else if (raw.startsWith('rename to ')) {
      cur.status = 'renamed'
      cur.path = raw.slice(10)
    } else if (raw.startsWith('Binary files')) cur.status = 'binary'
    else if (raw.startsWith('@@')) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(raw)
      oldNo = Number(m?.[1] ?? 0)
      newNo = Number(m?.[2] ?? 0)
      cur.lines.push({ kind: 'hunk', text: raw })
    } else if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('index ') || raw.startsWith('similarity') || raw.startsWith('rename from')) {
      continue
    } else if (raw.startsWith('+')) {
      cur.lines.push({ kind: 'add', text: raw.slice(1), newNo: newNo++ })
      cur.additions++
    } else if (raw.startsWith('-')) {
      cur.lines.push({ kind: 'del', text: raw.slice(1), oldNo: oldNo++ })
      cur.deletions++
    } else if (raw.startsWith(' ')) {
      cur.lines.push({ kind: 'ctx', text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ })
    }
  }
  return files
}
