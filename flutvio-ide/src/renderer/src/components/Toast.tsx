/**
 * Toast.tsx — the stack of short messages at the bottom left of the window.
 * Each one: a small icon by kind, text, optional file preview / action, and a hairline that
 * runs out as it is about to leave. Hovering pauses it and shows the close button.
 */

import React, { useEffect, useRef, useState } from 'react'
import { dismissToast, useToasts, type ToastItem, type ToastKind } from '../lib/toastStore'
import { CheckIcon, CircleAlertIcon, InfoIcon, XIcon } from './Icons'

const TONE: Record<ToastKind, string> = {
  ok: 'text-accent-green',
  error: 'text-accent-red',
  warn: 'text-accent-orange',
  info: 'text-accent-blue',
}

export default function Toasts(): React.JSX.Element {
  const toasts = useToasts()
  return (
    <div className="pointer-events-none fixed bottom-8 left-3 z-[80] flex flex-col-reverse items-start gap-1.5" aria-live="polite">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastCard({ toast: t }: { toast: ToastItem }): React.JSX.Element {
  const [leaving, setLeaving] = useState(false)
  const [paused, setPaused] = useState(false)
  const [thumb, setThumb] = useState<string | null>(null)
  const left = useRef(t.duration)

  const close = (): void => {
    setLeaving(true)
    window.setTimeout(() => dismissToast(t.id), 160)
  }

  // Counts down only while the pointer is away.
  useEffect(() => {
    if (paused || leaving) return
    const started = Date.now()
    const timer = window.setTimeout(close, left.current)
    return () => {
      window.clearTimeout(timer)
      left.current = Math.max(800, left.current - (Date.now() - started))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, leaving])

  useEffect(() => {
    if (!t.path || !/\.(png|jpe?g)$/i.test(t.path)) return
    let alive = true
    window.flutvio.ui
      .imageThumb(t.path)
      .then((url) => alive && setThumb(url))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [t.path])

  const linkBtn = 'flex h-6 flex-shrink-0 items-center rounded-md border border-border-default px-2 text-2xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-4'

  return (
    <div
      role={t.kind === 'error' ? 'alert' : 'status'}
      data-testid="toast"
      data-kind={t.kind}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`group pointer-events-auto relative w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-border-default bg-surface-3 shadow-pop ${
        leaving ? 'animate-toastOut' : 'animate-toastIn'
      }`}
    >
      <div className="flex items-start gap-2.5 py-2.5 pl-3 pr-2">
        {thumb ? (
          <img src={thumb} alt="" className="h-11 w-auto max-w-[64px] flex-shrink-0 rounded border border-border-subtle object-cover" />
        ) : (
          <span className={`mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center ${TONE[t.kind]}`}>
            {t.kind === 'ok' ? <CheckIcon size={14} strokeWidth={2.2} /> : t.kind === 'info' ? <InfoIcon size={14} /> : <CircleAlertIcon size={14} />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {t.title && (
            <div dir="auto" className="truncate text-xs font-medium leading-4 text-text-primary">
              {t.title}
            </div>
          )}
          <div
            dir="auto"
            className={`select-text break-words text-2xs leading-4 ${t.title ? 'mt-px text-text-tertiary' : 'text-xs text-text-secondary'} ${t.kind === 'error' ? 'line-clamp-4' : 'line-clamp-2'}`}
          >
            {t.text}
          </div>
          {(t.path || t.action) && (
            <div className="mt-2 flex items-center gap-1.5">
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.run()
                    close()
                  }}
                  className={linkBtn}
                >
                  {t.action.label}
                </button>
              )}
              {t.path && (
                <button onClick={() => void window.flutvio.flutter.revealFile(t.path!)} className={linkBtn}>
                  Show in Finder
                </button>
              )}
            </div>
          )}
        </div>
        <button
          onClick={close}
          aria-label="Dismiss"
          className="-mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:bg-surface-4 hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
        >
          <XIcon size={10} />
        </button>
      </div>
      {/* Time left: a hairline, only as strong as it needs to be. */}
      <span
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-text-tertiary/40"
        style={{ animation: `toastBar ${t.duration}ms linear forwards`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  )
}
