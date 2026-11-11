/**
 * graph.ts — lays out a commit graph: which lane (column) each commit sits in and how lines
 * connect rows. Input is `git log --topo-order` (children before parents).
 */

export interface GraphRow {
  sha: string
  /** Lane of this commit's dot. */
  col: number
  /** Lanes entering the row from above (sha expected in each lane, or null). */
  before: Array<string | null>
  /** Lanes leaving the row downwards. */
  after: Array<string | null>
  parents: string[]
}

export function layoutGraph(commits: Array<{ sha: string; parents: string[] }>): GraphRow[] {
  let lanes: Array<string | null> = []
  const rows: GraphRow[] = []
  for (const c of commits) {
    const before = lanes.slice()
    let col = lanes.indexOf(c.sha)
    if (col < 0) {
      col = lanes.indexOf(null)
      if (col < 0) col = lanes.length
    }
    const next = lanes.slice()
    next[col] = c.parents[0] ?? null
    // Other lanes that were also waiting for this commit end here (branches merging into it).
    for (let i = 0; i < next.length; i++) if (i !== col && next[i] === c.sha) next[i] = null
    for (const p of c.parents.slice(1)) {
      if (next.includes(p)) continue
      const free = next.indexOf(null)
      if (free >= 0 && free !== col) next[free] = p
      else next.push(p)
    }
    while (next.length && next[next.length - 1] === null) next.pop()
    rows.push({ sha: c.sha, col, before, after: next, parents: c.parents })
    lanes = next
  }
  return rows
}

export const LANE_COLORS = ['#4d8cf5', '#3fb97f', '#e0a030', '#c792ea', '#e5534b', '#7fdbca', '#f2a970', '#9aa6bd']
