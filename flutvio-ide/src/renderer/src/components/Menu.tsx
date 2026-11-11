/**
 * Menu.tsx — small dropdown menu (click the trigger, pick an item; Esc / outside click closes).
 */

import React, { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  key: string
  label: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  checked?: boolean
  onSelect: () => void
}

interface Props {
  trigger: (open: boolean) => React.ReactNode
  items: Array<MenuItem | 'sep' | { header: string }>
  align?: 'left' | 'right'
  width?: number
  onOpen?: () => void
  className?: string
}

export default function Menu({ trigger, items, align = 'left', width = 240, onOpen, className = '' }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        onClick={() => {
          if (!open) onOpen?.()
          setOpen((v) => !v)
        }}
      >
        {trigger(open)}
      </div>
      {open && (
        <div
          role="menu"
          style={{ width }}
          className={`absolute top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-border-default bg-surface-3 py-1 shadow-pop ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={`sep-${i}`} className="my-1 h-px bg-border-subtle" />
            ) : 'header' in it ? (
              <div key={`h-${i}`} className="px-2.5 pb-0.5 pt-1.5 text-2xs text-text-tertiary">
                {it.header}
              </div>
            ) : (
              <button
                key={it.key}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
                className="flex h-7 w-full items-center gap-2 px-2.5 text-left text-xs text-text-secondary hover:bg-surface-4 hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="flex w-3.5 flex-shrink-0 justify-center text-text-tertiary">{it.icon}</span>
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && <span className="flex-shrink-0 text-2xs text-text-tertiary">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
