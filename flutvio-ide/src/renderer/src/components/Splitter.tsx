/**
 * Splitter.tsx — a 1px divider with a wider invisible grab area that resizes a neighbouring pane.
 *
 *  dir="x": vertical line, drags left/right (pane widths)
 *  dir="y": horizontal line, drags up/down (pane heights)
 *  invert:  the pane sits after the splitter (right / below), so dragging toward it shrinks it.
 */

import React, { useRef } from 'react'

interface Props {
  dir: 'x' | 'y'
  size: number
  onResize: (size: number) => void
  min: number
  max: number
  invert?: boolean
  /** Draw the 1px line (otherwise only the hover highlight shows). */
  visible?: boolean
}

export default function Splitter({ dir, size, onResize, min, max, invert = false, visible = false }: Props): React.JSX.Element {
  const [active, setActive] = React.useState(false)
  const start = useRef({ pos: 0, size: 0 })

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    start.current = { pos: dir === 'x' ? e.clientX : e.clientY, size }
    setActive(true)
    document.body.style.cursor = dir === 'x' ? 'col-resize' : 'row-resize'
    document.body.dataset.resizing = '1'

    const onMove = (ev: MouseEvent): void => {
      const d = (dir === 'x' ? ev.clientX : ev.clientY) - start.current.pos
      onResize(Math.round(Math.max(min, Math.min(max, start.current.size + (invert ? -d : d)))))
    }
    const onUp = (): void => {
      setActive(false)
      document.body.style.cursor = ''
      delete document.body.dataset.resizing
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const line = dir === 'x' ? 'w-px self-stretch' : 'h-px w-full'
  const hit = dir === 'x' ? '-left-[3px] w-[7px] inset-y-0 cursor-col-resize' : '-top-[3px] h-[7px] inset-x-0 cursor-row-resize'

  return (
    <div className={`relative z-20 flex-shrink-0 ${visible ? 'bg-border-default' : 'bg-transparent'} ${line}`}>
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={() => onResize(Math.round((min + max) / 2))}
        className={`absolute ${hit} transition-colors delay-150 hover:bg-accent-blue/40 ${active ? 'bg-accent-blue/60' : ''}`}
      />
    </div>
  )
}
