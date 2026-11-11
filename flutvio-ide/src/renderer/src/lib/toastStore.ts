/**
 * toastStore.ts — short-lived messages shown at the bottom of the window (action results,
 * errors, "agent finished"). Anything in the renderer can push one; <Toasts /> shows them.
 */

import { useSyncExternalStore } from 'react'

export type ToastKind = 'ok' | 'error' | 'info' | 'warn'

export interface ToastItem {
  id: number
  kind: ToastKind
  /** Bold first line (optional). */
  title?: string
  text: string
  /** A file the toast is about (screenshots): shows a preview and "Show in Finder". */
  path?: string
  action?: { label: string; run: () => void }
  /** How long it stays, ms. */
  duration: number
}

const MAX = 4
let items: ToastItem[] = []
let seq = 1
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function pushToast(t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }): number {
  const id = seq++
  const duration = t.duration ?? (t.kind === 'error' ? 9000 : t.action || t.path ? 7000 : 4500)
  // Newest first; the same message twice in a row replaces itself instead of stacking.
  items = [{ ...t, id, duration }, ...items.filter((x) => !(x.kind === t.kind && x.text === t.text && x.title === t.title))].slice(0, MAX)
  emit()
  return id
}

export function dismissToast(id: number): void {
  const next = items.filter((t) => t.id !== id)
  if (next.length === items.length) return
  items = next
  emit()
}

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => items)
}
