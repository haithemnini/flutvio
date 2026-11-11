/**
 * Controls.tsx — small form controls used by Settings and onboarding.
 */

import React from 'react'
import { ChevronDownIcon, MinusIcon, PlusIcon } from '../Icons'

/** One settings row: label + description on the left, control on the right. */
export function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <div className="text-xs text-text-primary">{label}</div>
        {hint && <div className="mt-0.5 text-2xs leading-relaxed text-text-tertiary">{hint}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="mb-5">
      <h3 className="panel-title mb-1">{title}</h3>
      <div className="divide-y divide-border-subtle">{children}</div>
    </section>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-8 rounded-full transition-colors ${checked ? 'bg-accent-blue' : 'bg-surface-4'}`}
    >
      <span
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[16px]' : 'translate-x-[2px]'}`}
      />
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: React.ReactNode }>
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="flex h-7 items-center rounded-md bg-surface-4/60 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`flex h-full items-center rounded px-2.5 text-2xs transition-colors ${
            o.value === value ? 'bg-surface-3 text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  width = 180,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  width?: number
}): React.JSX.Element {
  return (
    <div className="relative" style={{ width }}>
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value)
          if (o) onChange(o.value)
        }}
        className="h-7 w-full appearance-none rounded-md border border-border-default bg-surface-1 pl-2.5 pr-7 text-xs text-text-primary outline-none focus:border-accent-blue/60"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
    </div>
  )
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}): React.JSX.Element {
  const set = (v: number): void => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)))
  return (
    <div className="flex h-7 items-center rounded-md border border-border-default">
      <button className="flex h-full w-7 items-center justify-center text-text-tertiary hover:text-text-primary disabled:opacity-30" disabled={value <= min} onClick={() => set(value - step)}>
        <MinusIcon size={11} />
      </button>
      <span className="w-12 text-center font-mono text-2xs text-text-primary">{format(value)}</span>
      <button className="flex h-full w-7 items-center justify-center text-text-tertiary hover:text-text-primary disabled:opacity-30" disabled={value >= max} onClick={() => set(value + step)}>
        <PlusIcon size={11} />
      </button>
    </div>
  )
}
