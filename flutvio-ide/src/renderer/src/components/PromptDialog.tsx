/**
 * PromptDialog.tsx — small centred dialog with one text field (Enter confirms, Esc cancels).
 */

import React, { useEffect, useRef, useState } from 'react'
import { SpinnerIcon } from './Icons'

interface Props {
  title: string
  hint?: React.ReactNode
  placeholder?: string
  confirmLabel: string
  /** Returns an error message to show, or null when the value is acceptable. */
  validate?: (value: string) => string | null
  onConfirm: (value: string) => Promise<void>
  onClose: () => void
}

export default function PromptDialog({ title, hint, placeholder, confirmLabel, validate, onConfirm, onClose }: Props): React.JSX.Element {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const submit = async (): Promise<void> => {
    const v = value.trim()
    const problem = !v ? 'Enter a name.' : validate?.(v) ?? null
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await onConfirm(v)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[18vh]" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        className="w-[380px] rounded-lg border border-border-default bg-surface-3 p-3 shadow-pop"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="text-xs font-medium text-text-primary">{title}</p>
        {hint && <p className="mt-1 text-2xs leading-relaxed text-text-tertiary">{hint}</p>}
        <input
          ref={inputRef}
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}
          placeholder={placeholder}
          spellCheck={false}
          className="mt-2.5 h-7 w-full rounded-md border border-border-default bg-surface-1 px-2 font-mono text-xs text-text-primary outline-none placeholder:text-text-disabled focus:border-accent-blue/60"
        />
        {error && <p className="mt-1.5 break-words text-2xs text-accent-red">{error}</p>}
        <div className="mt-3 flex justify-end gap-1.5">
          <button type="button" onClick={onClose} disabled={busy} className="h-6 rounded px-2.5 text-xs text-text-secondary hover:bg-surface-4">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex h-6 items-center gap-1.5 rounded bg-accent-blue px-2.5 text-xs font-medium text-white hover:bg-accent-blue/90 disabled:opacity-60"
          >
            {busy && <SpinnerIcon size={11} />} {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
