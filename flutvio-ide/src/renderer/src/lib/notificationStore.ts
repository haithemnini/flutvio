/**
 * notificationStore.ts — things that happened while you were looking elsewhere: an agent
 * finished its turn, wants attention, a long command ended. Shown by the bell in the title bar;
 * the unread count also goes on the Dock icon.
 */

import { useSyncExternalStore } from 'react'

export interface AppNotification {
  id: number
  kind: 'done' | 'attention' | 'command' | 'limit'
  title: string
  body: string
  /** Terminal tab it is about (clicking goes there). */
  term?: string
  /** Program in that terminal (colours the dot). */
  process?: string
  at: number
  read: boolean
}

const MAX = 50
let items: AppNotification[] = []
let seq = 1
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
  try {
    window.flutvio.ui.setBadge(items.reduce((n, x) => n + (x.read ? 0 : 1), 0))
  } catch {
    /* no bridge (tests) */
  }
}

export function pushNotification(n: Omit<AppNotification, 'id' | 'at' | 'read'>): void {
  items = [{ ...n, id: seq++, at: Date.now(), read: false }, ...items].slice(0, MAX)
  emit()
}

function update(match: (n: AppNotification) => boolean): void {
  if (!items.some((n) => !n.read && match(n))) return
  items = items.map((n) => (!n.read && match(n) ? { ...n, read: true } : n))
  emit()
}

export const markRead = (id: number): void => update((n) => n.id === id)
export const markAllRead = (): void => update(() => true)
/** Looking at a terminal reads what was said about it. */
export const markTermRead = (term: string): void => update((n) => n.term === term)

export function clearNotifications(): void {
  if (!items.length) return
  items = []
  emit()
}

/** Was something already said about this terminal a moment ago? (bell right after "finished") */
export const recentlyNotified = (term: string, withinMs: number): boolean => items.some((n) => n.term === term && Date.now() - n.at < withinMs)

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(subscribe, () => items)
}
