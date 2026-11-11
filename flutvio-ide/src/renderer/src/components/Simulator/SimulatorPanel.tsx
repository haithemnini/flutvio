/**
 * SimulatorPanel.tsx — mirrors the iOS Simulator that Xcode runs (nothing is re-created).
 *
 *  - Pick a simulator from the header menu: booted ones attach, others boot first
 *  - Screen: H.264 from the simulator framebuffer, hardware-decoded (lib/h264.ts)
 *  - Frame: Xcode's own device chrome (DeviceKit), with working side buttons
 *  - Mouse = finger: press, drag and release are streamed live; wheel / trackpad scrolls
 *  - Click the screen, then type: keys go to the simulator (other languages are pasted)
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DeviceChrome, SimDevice, SimElement, SimOrientation, SimSize } from '../../../../shared/flutvio-api'
import { H264Player } from '../../lib/h264'
import { useSettings } from '../../lib/settings'
import Menu from '../Menu'
import {
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  FitIcon,
  HomeIcon,
  KeyboardIcon,
  LayersIcon,
  MinusIcon,
  PlusIcon,
  PowerIcon,
  RefreshIcon,
  RotateIcon,
  SearchIcon,
  SpinnerIcon,
  XIcon,
} from '../Icons'

interface Props {
  /** Simulator chosen in the run menu (mirrored when booted). */
  preferredUdid: string | null
  onScreenshot: () => void
  screenshotBusy: boolean
  /** Shown at the start of the header (Simulator / Browser switch). */
  leading?: React.ReactNode
  /** Hides the panel (the mirror stops). */
  onClose?: () => void
}

const KEY = { backspace: 42, enter: 40, tab: 43, escape: 41, left: 80, right: 79, up: 82, down: 81 }
const ORIENTATIONS: SimOrientation[] = ['PORTRAIT', 'LANDSCAPE_LEFT', 'PORTRAIT_UPSIDE_DOWN', 'LANDSCAPE_RIGHT']
const sim = (): typeof window.flutvio.sim => window.flutvio.sim

export default function SimulatorPanel({ preferredUdid, onScreenshot, screenshotBusy, leading, onClose }: Props): React.JSX.Element {
  const { simFps, simShowFrame } = useSettings()
  const [devices, setDevices] = useState<SimDevice[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [size, setSize] = useState<SimSize | null>(null)
  const [chrome, setChrome] = useState<DeviceChrome | null>(null)
  const [live, setLive] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [booting, setBooting] = useState(false)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [focused, setFocused] = useState(false)
  const [panel, setPanel] = useState<'none' | 'text' | 'elements'>('none')
  const [elements, setElements] = useState<SimElement[] | null>(null)
  const [highlight, setHighlight] = useState<SimElement | null>(null)
  const [query, setQuery] = useState('')
  const [typing, setTyping] = useState('')
  const [pressed, setPressed] = useState<string | null>(null)
  const [orientation, setOrientation] = useState(0)
  const [reconnect, setReconnect] = useState(0)

  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<H264Player | null>(null)
  const liveRef = useRef(false)
  const down = useRef(false)
  const moveRaf = useRef(0)
  const lastMove = useRef<{ x: number; y: number } | null>(null)
  const typed = useRef({ text: '', timer: 0 })
  const wheel = useRef<{ x: number; y: number; timer: number } | null>(null)

  // ── Which simulator: chosen in the menu > run device (if booted) > first booted ──
  const loadDevices = useCallback(() => {
    sim()
      .devices()
      .then(setDevices)
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(loadDevices, [loadDevices])

  const preferred = devices.find((d) => d.udid === preferredUdid)
  const target =
    devices.find((d) => d.udid === chosen) ?? (preferred?.booted ? preferred : undefined) ?? devices.find((d) => d.booted) ?? preferred
  const udid = target?.booted ? target.udid : null

  // ── Video player ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !H264Player.supported()) return
    const player = new H264Player(
      canvas,
      (stats) => {
        if (import.meta.env.DEV) Object.assign(window, { __simFps: stats.fps })
        if (!liveRef.current) {
          liveRef.current = true
          setLive(true)
          setStatus('')
        }
      },
      (msg) => console.warn('[sim] decoder:', msg),
    )
    playerRef.current = player
    const off = sim().onEvent((event) => {
      switch (event.type) {
        case 'video':
          player.push(event.data)
          break
        case 'video-restart':
          player.reset()
          break
        case 'status':
          setStatus(event.message)
          break
        case 'error':
          setError(event.message)
          break
        case 'stopped':
          liveRef.current = false
          setLive(false)
          setStatus('')
          break
      }
    })
    return () => {
      off()
      player.close()
      playerRef.current = null
    }
  }, [udid])

  // ── Attach / detach ──
  useEffect(() => {
    if (!udid) return
    let cancelled = false
    liveRef.current = false
    setLive(false)
    setError(null)
    setElements(null)
    setSize(null)
    setStatus('Connecting…')
    playerRef.current?.reset()
    sim()
      .chrome(udid)
      .then((c) => !cancelled && setChrome(c))
      .catch(() => !cancelled && setChrome(null))
    sim()
      .start(udid, simFps)
      .then((s) => {
        if (!cancelled && s) setSize(s)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
          setStatus('')
        }
      })
    return () => {
      cancelled = true
      void sim().stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [udid, reconnect])

  // ── Stage size (for fit) ──
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Geometry (all in points, then scaled as one piece) ──
  const pts = size ?? { widthPts: 402, heightPts: 874 }
  const landscape = orientation % 2 === 1
  const sw = pts.widthPts
  const sh = pts.heightPts
  const frame = simShowFrame ? chrome : null
  const bz = frame?.bezel ?? (simShowFrame ? { left: 14, right: 14, top: 14, bottom: 14 } : { left: 0, right: 0, top: 0, bottom: 0 })
  const outerW = sw + bz.left + bz.right
  const outerH = sh + bz.top + bz.bottom
  const margin = 20
  /** Room kept under the device for the control bar. */
  const BAR_SPACE = 56
  const fitScale = Math.max(
    0.1,
    Math.min(
      (box.w - margin * 2) / (landscape ? outerH : outerW + 16),
      (box.h - margin * 2 - BAR_SPACE) / (landscape ? outerW + 16 : outerH),
    ),
  )
  const scale = zoom === 'fit' ? fitScale : zoom
  // Device centre and the control bar right under it (stays visible when zoomed in).
  const visH = (landscape ? outerW : outerH) * scale
  const centerY = zoom === 'fit' ? (box.h - BAR_SPACE) / 2 : Math.max(visH / 2 + margin, (box.h - BAR_SPACE) / 2)
  const barTop = Math.min(centerY + visH / 2 + 14, box.h - 44)
  const screenRadius = frame ? Math.max(0, frame.cornerRadius - Math.max(bz.left, bz.top)) : 52

  // ── Input ──
  const toPoints = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const c = canvasRef.current
    if (!c) return null
    const r = c.getBoundingClientRect()
    // Rotation is applied to the whole device; map back into portrait points.
    let u = (clientX - r.left) / r.width
    let v = (clientY - r.top) / r.height
    if (orientation === 1) [u, v] = [1 - v, u]
    else if (orientation === 2) [u, v] = [1 - u, 1 - v]
    else if (orientation === 3) [u, v] = [v, 1 - u]
    return { x: Math.min(sw, Math.max(0, u * sw)), y: Math.min(sh, Math.max(0, v * sh)) }
  }

  const fail = (err: Error): void => setError(err.message)

  const flushTyping = useCallback((): void => {
    window.clearTimeout(typed.current.timer)
    const text = typed.current.text
    typed.current.text = ''
    if (text) sim().typeText(text).catch(fail)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0 || !live) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic */
    }
    const p = toPoints(e.clientX, e.clientY)
    if (!p) return
    flushTyping()
    down.current = true
    sim().touch('down', p.x, p.y)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!down.current) return
    lastMove.current = toPoints(e.clientX, e.clientY)
    if (!moveRaf.current)
      moveRaf.current = requestAnimationFrame(() => {
        moveRaf.current = 0
        const p = lastMove.current
        if (p && down.current) sim().touch('move', p.x, p.y)
      })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!down.current) return
    down.current = false
    cancelAnimationFrame(moveRaf.current)
    moveRaf.current = 0
    const p = toPoints(e.clientX, e.clientY)
    if (p) sim().touch('up', p.x, p.y)
  }

  /** Wheel / trackpad → a finger drag that follows the scroll, released when scrolling pauses. */
  const onWheel = (e: React.WheelEvent): void => {
    if (!live || down.current) return
    const k = scale
    let w = wheel.current
    if (!w) {
      const p = toPoints(e.clientX, e.clientY)
      if (!p) return
      w = { x: p.x, y: p.y, timer: 0 }
      wheel.current = w
      sim().touch('down', w.x, w.y)
    }
    w.x = Math.min(sw - 2, Math.max(2, w.x - e.deltaX / k))
    w.y = Math.min(sh - 2, Math.max(2, w.y - e.deltaY / k))
    sim().touch('move', w.x, w.y)
    window.clearTimeout(w.timer)
    const cur = w
    w.timer = window.setTimeout(() => {
      sim().touch('up', cur.x, cur.y)
      if (wheel.current === cur) wheel.current = null
    }, 90)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!live || e.nativeEvent.isComposing) return
    if (e.metaKey && e.key.toLowerCase() === 'v') return // let paste through below
    if (e.metaKey || e.ctrlKey) return
    const special =
      e.key === 'Backspace'
        ? KEY.backspace
        : e.key === 'Enter'
          ? KEY.enter
          : e.key === 'Tab'
            ? KEY.tab
            : e.key === 'ArrowLeft'
              ? KEY.left
              : e.key === 'ArrowRight'
                ? KEY.right
                : e.key === 'ArrowUp'
                  ? KEY.up
                  : e.key === 'ArrowDown'
                    ? KEY.down
                    : 0
    if (special) {
      e.preventDefault()
      flushTyping()
      sim().key(special).catch(fail)
      return
    }
    if (e.key === 'Escape') {
      ;(e.currentTarget as HTMLElement).blur()
      return
    }
    if (e.key.length === 1 || [...e.key].length === 1) {
      e.preventDefault()
      typed.current.text += e.key
      window.clearTimeout(typed.current.timer)
      typed.current.timer = window.setTimeout(flushTyping, 120)
    }
  }

  const rotate = (): void => {
    const next = (orientation + 1) % 4
    setOrientation(next)
    sim().rotate(ORIENTATIONS[next]).catch(fail)
  }

  const loadElements = (): void => {
    setElements(null)
    sim().elements().then(setElements).catch(fail)
  }
  const togglePanel = (p: 'text' | 'elements'): void => {
    setPanel((cur) => (cur === p ? 'none' : p))
    if (p === 'elements' && panel !== 'elements') loadElements()
  }

  const pick = async (d: SimDevice): Promise<void> => {
    setChosen(d.udid)
    if (d.booted) return
    setBooting(true)
    setError(null)
    try {
      await sim().boot(d.udid)
      loadDevices()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBooting(false)
    }
  }

  const shutdown = async (d: SimDevice): Promise<void> => {
    setError(null)
    try {
      await sim().shutdown(d.udid)
      setChosen(null)
      loadDevices()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const filtered = elements?.filter((el) => !query || el.label.toLowerCase().includes(query.toLowerCase()))
  const booted = devices.filter((d) => d.booted)
  const others = devices.filter((d) => !d.booted)

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      {/* Header */}
      <div className="flex h-9 flex-shrink-0 items-center gap-1 pl-2 pr-1.5">
        {leading}
        <Menu
          width={260}
          onOpen={loadDevices}
          trigger={(open) => (
            <button
              className={`flex h-6 min-w-0 items-center gap-1.5 rounded px-1.5 text-xs transition-colors hover:bg-surface-4 ${open ? 'bg-surface-4' : ''}`}
            >
              <span
                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                  live ? 'bg-accent-green' : error ? 'bg-accent-red' : udid ? 'animate-pulseDot bg-accent-orange' : 'bg-text-disabled'
                }`}
              />
              <span className="truncate font-medium text-text-primary">{target?.name ?? 'Simulator'}</span>
              {target && <span className="flex-shrink-0 text-text-tertiary">{target.runtime}</span>}
              <ChevronDownIcon size={11} className="flex-shrink-0 text-text-tertiary" />
            </button>
          )}
          items={[
            ...(booted.length ? [{ header: 'Running' }] : []),
            ...booted.map((d) => ({
              key: d.udid,
              label: d.name,
              hint: d.runtime,
              icon: d.udid === udid ? <CheckIcon size={12} /> : undefined,
              onSelect: () => void pick(d),
            })),
            ...(others.length ? (['sep', { header: 'Boot' }] as const) : []),
            ...others.map((d) => ({
              key: d.udid,
              label: d.name,
              hint: d.runtime,
              icon: <PowerIcon size={11} />,
              onSelect: () => void pick(d),
            })),
            // Frees the memory the simulator uses (it is Xcode's simulator, running outside Flutvio).
            ...(target?.booted
              ? (['sep', { key: 'shutdown', label: `Shut down ${target.name}`, icon: <PowerIcon size={11} />, onSelect: () => void shutdown(target) }] as const)
              : []),
          ]}
        />
        <span className="ml-1 truncate text-2xs text-text-tertiary">{!live && (booting ? 'Booting…' : status)}</span>

        <div className="ml-auto flex items-center">
          <button className="icon-btn h-6 w-6" data-tip="Zoom out" onClick={() => setZoom(Math.max(0.2, +(scale - 0.1).toFixed(2)))}>
            <MinusIcon size={13} />
          </button>
          <button
            className="icon-btn h-6 w-6"
            aria-pressed={zoom === 'fit'}
            data-tip="Fit"
            onClick={() => setZoom('fit')}
          >
            <FitIcon size={13} />
          </button>
          <button className="icon-btn h-6 w-6" data-tip="Zoom in" onClick={() => setZoom(Math.min(3, +(scale + 0.1).toFixed(2)))}>
            <PlusIcon size={13} />
          </button>
          <button className="icon-btn h-6 w-6" data-tip="Reconnect" onClick={() => setReconnect((n) => n + 1)} disabled={!udid}>
            <RefreshIcon size={12} />
          </button>
          {onClose && (
            <button className="icon-btn h-6 w-6" data-tip="Close simulator (⇧⌘M)" onClick={onClose} data-testid="sim-close">
              <XIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Stage */}
      <div ref={stageRef} className={`relative min-h-0 flex-1 ${zoom === 'fit' ? 'overflow-hidden' : 'overflow-auto'}`}>
        {error && (
          <div
            className="absolute inset-x-2 top-1 z-30 flex items-start gap-2 rounded-md border border-accent-red/25 bg-surface-3 px-2.5 py-1.5 text-2xs text-[#ff9a9a] shadow-pop"
            data-testid="sim-error"
          >
            <span className="max-h-16 flex-1 select-text overflow-y-auto break-words leading-relaxed">{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
              <XIcon size={12} />
            </button>
          </div>
        )}

        {!udid ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-xs text-text-secondary">{target ? `${target.name} is not running` : 'No simulator running'}</p>
            {target ? (
              <button
                onClick={() => void pick(target)}
                disabled={booting}
                className="flex h-7 items-center gap-1.5 rounded-md bg-surface-4 px-3 text-xs text-text-primary hover:bg-border-default disabled:opacity-50"
              >
                {booting ? <SpinnerIcon size={12} /> : <PowerIcon size={12} />} Boot {target.name}
              </button>
            ) : (
              <p className="text-2xs text-text-tertiary">Pick one from the menu above.</p>
            )}
          </div>
        ) : (
          <div
            className="absolute left-1/2"
            style={{
              top: centerY,
              width: outerW,
              height: outerH,
              transform: `translate(-50%, -50%) scale(${scale}) rotate(${-orientation * 90}deg)`,
              transformOrigin: 'center',
            }}
          >
            {/* Side buttons (under the frame, like Xcode) */}
            {frame?.inputs.map((b) => {
              const isDown = pressed === b.name
              const left = b.anchor === 'left' ? b.x - b.width : outerW + b.x
              return (
                <button
                  key={b.name}
                  title={b.title}
                  disabled={!live}
                  onMouseDown={() => setPressed(b.name)}
                  onMouseUp={() => setPressed(null)}
                  onMouseLeave={() => setPressed(null)}
                  onClick={() => sim().button(b.button).catch(fail)}
                  className="group absolute"
                  style={{ left, top: b.y, width: b.width, height: b.height }}
                >
                  <img src={isDown ? b.imageDown : b.image} alt="" draggable={false} className="h-full w-full" />
                </button>
              )
            })}

            {/* Xcode device frame (9-slice) — under the screen, as Simulator.app draws it */}
            {frame ? <Frame chrome={frame} w={outerW} h={outerH} /> : simShowFrame ? <PlainFrame w={outerW} h={outerH} /> : null}

            {/* Screen */}
            <div
              className={`absolute overflow-hidden bg-black outline-none ${focused ? 'ring-2 ring-accent-blue/50' : ''}`}
              style={{ left: bz.left, top: bz.top, width: sw, height: sh, borderRadius: screenRadius }}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false)
                flushTyping()
              }}
              onWheel={onWheel}
            >
              <canvas
                ref={canvasRef}
                draggable={false}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                data-testid={live ? 'sim-screen' : undefined}
                className="block h-full w-full touch-none select-none"
                style={{ opacity: live ? 1 : 0, transition: 'opacity .2s' }}
              />
              {highlight && (
                <span
                  className="pointer-events-none absolute rounded-sm border-2 border-accent-blue bg-accent-blue/15"
                  style={{ left: highlight.x, top: highlight.y, width: highlight.width, height: highlight.height }}
                />
              )}
              {!live && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <SpinnerIcon size={22} className="text-white/40" />
                </div>
              )}
            </div>

          </div>
        )}

        {/* Popovers */}
        {panel === 'text' && (
          <form
            style={{ bottom: Math.max(8, box.h - barTop + 8) }}
            className="absolute inset-x-4 z-30 flex items-center gap-1 rounded-lg border border-border-default bg-surface-3 p-1 shadow-pop"
            onSubmit={(e) => {
              e.preventDefault()
              if (!typing) return
              sim().typeText(typing).catch(fail)
              setTyping('')
            }}
          >
            <input
              autoFocus
              value={typing}
              onChange={(e) => setTyping(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setPanel('none')}
              disabled={!live}
              dir="auto"
              placeholder="Text for the focused field…"
              data-testid="sim-text"
              className="h-6 min-w-0 flex-1 bg-transparent px-1.5 text-xs text-text-primary outline-none placeholder:text-text-tertiary"
            />
            <button type="submit" disabled={!live || !typing} className="h-6 rounded bg-accent-blue px-2 text-2xs font-medium text-white disabled:opacity-35">
              Send
            </button>
          </form>
        )}
        {panel === 'elements' && (
          <div
            style={{ bottom: Math.max(8, box.h - barTop + 8) }}
            className="absolute inset-x-4 z-30 flex max-h-[50%] flex-col overflow-hidden rounded-lg border border-border-default bg-surface-3 shadow-pop"
            data-testid="sim-elements"
          >
            <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border-subtle px-2">
              <SearchIcon size={12} className="text-text-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setPanel('none')}
                placeholder="Find an element…"
                className="min-w-0 flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
              />
              <button className="icon-btn h-5 w-5" onClick={loadElements} aria-label="Re-read screen">
                <RefreshIcon size={11} />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto py-0.5" onMouseLeave={() => setHighlight(null)}>
              {!elements && <p className="px-2.5 py-1.5 text-2xs text-text-tertiary">Reading the screen…</p>}
              {filtered?.length === 0 && <p className="px-2.5 py-1.5 text-2xs text-text-tertiary">No labelled elements.</p>}
              {filtered?.map((el, i) => (
                <button
                  key={`${el.label}-${i}`}
                  disabled={!live}
                  onMouseEnter={() => setHighlight(el)}
                  onClick={() => sim().tap(el.x + el.width / 2, el.y + el.height / 2).catch(fail)}
                  className="flex h-6 w-full items-center gap-2 px-2.5 text-left text-xs text-text-secondary hover:bg-surface-4 hover:text-text-primary"
                >
                  <span dir="auto" className="min-w-0 flex-1 truncate">
                    {el.label}
                  </span>
                  <span className="flex-shrink-0 font-mono text-[10px] text-text-tertiary">{el.role.replace(/^AX/, '')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Control bar, right under the device */}
        {udid && box.h > 0 && (
          <div
            className="absolute left-1/2 z-20 flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-full border border-border-default bg-surface-3/95 px-1.5 shadow-pop backdrop-blur"
            style={{ top: barTop }}
            data-testid="sim-controls"
          >
            <Tool label="Home" disabled={!live} onClick={() => sim().button('HOME').catch(fail)}>
              <HomeIcon size={15} />
            </Tool>
            <Tool label="Rotate" disabled={!live} onClick={rotate}>
              <RotateIcon size={15} />
            </Tool>
            <Divider />
            <Tool label="Screenshot" disabled={!live || screenshotBusy} onClick={onScreenshot} data-testid="screenshot-button">
              {screenshotBusy ? <SpinnerIcon size={14} /> : <CameraIcon size={15} />}
            </Tool>
            <Divider />
            <Tool label="Type text" disabled={!live} pressed={panel === 'text'} onClick={() => togglePanel('text')}>
              <KeyboardIcon size={15} />
            </Tool>
            <Tool label="Elements" disabled={!live} pressed={panel === 'elements'} onClick={() => togglePanel('elements')}>
              <LayersIcon size={15} />
            </Tool>
          </div>
        )}
      </div>
    </div>
  )
}

function Divider(): React.JSX.Element {
  return <span className="mx-1 h-4 w-px bg-border-default" />
}

function Tool({
  label,
  pressed,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean }): React.JSX.Element {
  return (
    <button
      {...props}
      data-tip={label}
      data-tip-pos="top"
      aria-pressed={pressed}
      className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-4 hover:text-text-primary active:scale-95 disabled:pointer-events-none disabled:opacity-30 aria-pressed:bg-surface-4 aria-pressed:text-text-primary"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}

/** Xcode's 9-slice frame drawn over the screen. */
function Frame({ chrome, w, h }: { chrome: DeviceChrome; w: number; h: number }): React.JSX.Element {
  const c = chrome.corner
  const p = chrome.parts
  const img = (src: string, style: React.CSSProperties): React.JSX.Element => (
    <img src={src} alt="" draggable={false} className="pointer-events-none absolute select-none" style={style} />
  )
  return (
    <>
      {img(p.topLeft, { left: 0, top: 0, width: c, height: c })}
      {img(p.top, { left: c, top: 0, width: w - 2 * c, height: c })}
      {img(p.topRight, { left: w - c, top: 0, width: c, height: c })}
      {img(p.left, { left: 0, top: c, width: c, height: h - 2 * c })}
      {img(p.right, { left: w - c, top: c, width: c, height: h - 2 * c })}
      {img(p.bottomLeft, { left: 0, top: h - c, width: c, height: c })}
      {img(p.bottom, { left: c, top: h - c, width: w - 2 * c, height: c })}
      {img(p.bottomRight, { left: w - c, top: h - c, width: c, height: c })}
    </>
  )
}

/** Fallback when Xcode's chrome can't be read: a thin dark border. */
function PlainFrame({ w, h }: { w: number; h: number }): React.JSX.Element {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[62px] border-[14px] border-[#0b0b0c]"
      style={{ width: w, height: h, boxShadow: '0 0 0 1.5px #2a2a2e' }}
    />
  )
}
