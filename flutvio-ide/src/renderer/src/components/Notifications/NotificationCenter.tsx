/**
 * NotificationCenter.tsx — the bell in the title bar: a dot when something happened while you
 * were elsewhere (an agent finished, wants attention, a long command ended), and the list.
 * Clicking an entry goes to its terminal.
 */

import React, { useEffect, useRef, useState } from 'react'
import { clearNotifications, markAllRead, markRead, useNotifications, type AppNotification } from '../../lib/notificationStore'
import { processColor } from '../../lib/agents'
import { runCommand } from '../../lib/commands'
import { BellIcon } from '../Icons'

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'now'
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86_400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86_400)}d`
}

export default function NotificationCenter(): React.JSX.Element {
  const items = useNotifications()
  const unread = items.reduce((n, x) => n + (x.read ? 0 : 1), 0)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (n: AppNotification): void => {
    markRead(n.id)
    if (n.term) runCommand({ id: 'focus-terminal', term: n.term })
    setOpen(false)
  }

  return (
    <div ref={root} className="relative">
      <button
        className="icon-btn relative"
        aria-pressed={open}
        aria-label={unread ? `Notifications (${unread} new)` : 'Notifications'}
        data-tip={open ? undefined : 'Notifications'}
        data-testid="notifications-button"
        data-unread={unread}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon size={14} />
        {unread > 0 && (
          <span className="absolute right-0 top-0 flex h-[13px] min-w-[13px] items-center justify-center rounded-full bg-accent-orange px-[3px] text-[8.5px] font-semibold leading-none text-black">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[70] w-[320px] animate-fadeIn overflow-hidden rounded-xl border border-border-default bg-surface-3 shadow-pop" data-testid="notifications-list">
          <div className="flex h-9 items-center border-b border-border-subtle pl-3 pr-1.5">
            <span className="text-xs font-medium text-text-primary">Notifications</span>
            <div className="ml-auto flex items-center gap-0.5 text-2xs">
              {unread > 0 && (
                <button onClick={markAllRead} className="rounded px-1.5 py-0.5 text-text-tertiary hover:bg-surface-4 hover:text-text-primary">
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button onClick={clearNotifications} className="rounded px-1.5 py-0.5 text-text-tertiary hover:bg-surface-4 hover:text-text-primary">
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[380px] overflow-y-auto py-1">
            {items.length === 0 && (
              <div className="px-4 py-7 text-center">
                <BellIcon size={18} className="mx-auto text-text-disabled" />
                <p className="mt-2 text-xs text-text-secondary">Nothing yet</p>
                <p className="mx-auto mt-1 max-w-[230px] text-2xs leading-relaxed text-text-tertiary">
                  When an agent finishes or needs you while you are in another tab or app, it shows here.
                </p>
              </div>
            )}
            {items.map((n) => (
              <button key={n.id} onClick={() => go(n)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-4/60" data-testid="notification">
                <span
                  className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: n.kind === 'limit' ? 'rgb(var(--accent-red))' : n.process ? processColor(n.process) : 'rgb(var(--text-tertiary))', opacity: n.read ? 0.35 : 1 }}
                />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className={`block truncate text-xs ${n.read ? 'text-text-secondary' : 'font-medium text-text-primary'}`}>
                    {n.title}
                  </span>
                  <span dir="auto" className="mt-0.5 block truncate text-2xs text-text-tertiary">
                    {n.body}
                  </span>
                </span>
                <span className="flex-shrink-0 pt-px text-2xs text-text-disabled">{ago(n.at, now)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
