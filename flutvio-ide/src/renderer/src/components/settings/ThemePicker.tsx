/**
 * ThemePicker.tsx — theme cards with a small preview of each theme (used by Settings and onboarding).
 */

import React from 'react'
import { THEMES, type Theme, type ThemeSetting } from '../../lib/themes'
import { setSetting, useSettings } from '../../lib/settings'

function Preview({ theme }: { theme: Theme }): React.JSX.Element {
  const u = theme.ui
  const s = theme.syntax
  return (
    <div className="h-full w-full overflow-hidden rounded-[5px]" style={{ background: u.surface0 }}>
      <div className="flex h-full">
        <div className="w-[26%] space-y-1 px-1.5 pt-2" style={{ background: u.surface0 }}>
          {[70, 50, 60, 40].map((w, i) => (
            <div key={i} className="h-[3px] rounded" style={{ width: `${w}%`, background: i === 1 ? u.blue : u.textDisabled }} />
          ))}
        </div>
        <div className="flex-1 space-y-[5px] px-2 pt-2">
          <div className="flex gap-1">
            <div className="h-[3px] w-[18%] rounded" style={{ background: s.keyword }} />
            <div className="h-[3px] w-[30%] rounded" style={{ background: s.type }} />
          </div>
          <div className="ml-2 flex gap-1">
            <div className="h-[3px] w-[24%] rounded" style={{ background: s.fn }} />
            <div className="h-[3px] w-[36%] rounded" style={{ background: s.string }} />
          </div>
          <div className="ml-2 h-[3px] w-[40%] rounded" style={{ background: s.comment }} />
          <div className="flex gap-1">
            <div className="h-[3px] w-[14%] rounded" style={{ background: s.number }} />
            <div className="h-[3px] w-[22%] rounded" style={{ background: s.text }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function SystemPreview(): React.JSX.Element {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[5px]">
      <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}>
        <Preview theme={THEMES.light} />
      </div>
      <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
        <Preview theme={THEMES.dark} />
      </div>
    </div>
  )
}

const OPTIONS: Array<{ id: ThemeSetting; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'dark', label: 'Dark' },
  { id: 'black', label: 'Black' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'light', label: 'Light' },
  { id: 'paper', label: 'Paper' },
]

export default function ThemePicker({ size = 'md' }: { size?: 'md' | 'lg' }): React.JSX.Element {
  const { theme } = useSettings()
  const h = size === 'lg' ? 'h-[70px]' : 'h-[54px]'
  return (
    <div className="grid grid-cols-6 gap-2">
      {OPTIONS.map((o) => {
        const on = theme === o.id
        return (
          <button key={o.id} onClick={() => setSetting('theme', o.id)} className="group text-left" data-testid={`theme-${o.id}`}>
            <div
              className={`${h} rounded-lg p-[3px] transition-colors ${on ? 'bg-accent-blue' : 'bg-border-default group-hover:bg-border-strong'}`}
            >
              {o.id === 'system' ? <SystemPreview /> : <Preview theme={THEMES[o.id]} />}
            </div>
            <div className={`mt-1.5 text-center text-2xs ${on ? 'text-text-primary' : 'text-text-tertiary'}`}>{o.label}</div>
          </button>
        )
      })}
    </div>
  )
}
