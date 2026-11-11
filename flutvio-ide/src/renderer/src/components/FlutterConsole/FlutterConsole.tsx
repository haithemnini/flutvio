/**
 * FlutterConsole.tsx — output of `flutter run` (app logs, build progress, errors).
 * Shown as a tab of the bottom panel; the tab header owns the Clear button.
 *
 * Each line uses dir="auto", so Arabic log lines read right-to-left natively.
 * Auto-scrolls while the user is at the bottom; stops if they scroll up.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LogLine } from '../../hooks/useFlutter'
import { PlayIcon, SpinnerIcon } from '../Icons'

interface Props {
  logs: LogLine[]
  progress: string | null
}

export default function FlutterConsole({ logs, progress }: Props): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState(true)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stick) el.scrollTop = el.scrollHeight
  }, [logs, progress, stick])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = (): void => setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-3 pb-2 font-mono text-[12px] leading-[18px]" data-testid="console">
      {logs.length === 0 && !progress && (
        <div className="flex h-full items-center justify-center gap-2 font-sans text-xs text-text-tertiary">
          <PlayIcon size={10} /> Run the app to see its output here.
        </div>
      )}
      {logs.map((line) => (
        <div
          key={line.id}
          dir="auto"
          className={`select-text whitespace-pre-wrap break-words ${
            line.error ? '-mx-2 rounded bg-accent-red/[0.07] px-2 text-accent-red' : 'text-text-secondary'
          }`}
        >
          {line.text || ' '}
        </div>
      ))}
      {progress && (
        <div className="mt-1 flex items-center gap-2 text-accent-orange">
          <SpinnerIcon size={12} />
          <span dir="auto">{progress}</span>
        </div>
      )}
    </div>
  )
}
