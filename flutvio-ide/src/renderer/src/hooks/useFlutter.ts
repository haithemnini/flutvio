/**
 * useFlutter.ts — renderer-side view of the Flutter service.
 *
 * Mirrors FlutterState from the main process (pushed via 'state' events),
 * collects console output, and wraps every action with error reporting.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FlutterDevice, FlutterEvent, FlutterState } from '../../../shared/flutvio-api'
import { pushToast } from '../lib/toastStore'

export interface LogLine {
  id: number
  text: string
  error: boolean
}

/** `seq` increases on every completed action (lets tests detect a new result). */
export type LastAction = { kind: 'reload' | 'restart' | 'screenshot'; durationMs: number; seq: number } | null

const MAX_LOG_LINES = 3000
let nextId = 1

const INITIAL: FlutterState = { status: 'idle', project: null, deviceId: null, runningDeviceId: null }

export function useFlutter() {
  const api = window.flutvio.flutter
  const [state, setState] = useState<FlutterState>(INITIAL)
  const [devices, setDevices] = useState<FlutterDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [progress, setProgress] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<LastAction>(null)
  const [screenshotBusy, setScreenshotBusy] = useState(false)
  const pendingLog = useRef<LogLine[]>([])

  const notify = useCallback((kind: 'ok' | 'error', text: string, path?: string, title?: string) => {
    pushToast({ kind, text, path, title })
  }, [])

  // Batch log lines into one render per animation frame (flutter can be chatty).
  const flushScheduled = useRef(false)
  const appendLog = useCallback((text: string, error: boolean) => {
    for (const line of text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')) {
      pendingLog.current.push({ id: nextId++, text: line, error })
    }
    if (flushScheduled.current) return
    flushScheduled.current = true
    requestAnimationFrame(() => {
      flushScheduled.current = false
      const batch = pendingLog.current
      pendingLog.current = []
      setLogs((prev) => {
        const next = prev.concat(batch)
        return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next
      })
    })
  }, [])

  const refreshDevices = useCallback(async () => {
    setDevicesLoading(true)
    try {
      setDevices(await api.listDevices())
    } catch (err) {
      notify('error', (err as Error).message)
    } finally {
      setDevicesLoading(false)
    }
  }, [api, notify])

  useEffect(() => {
    void api.getState().then(setState)
    void refreshDevices()
    return api.onEvent((event: FlutterEvent) => {
      switch (event.type) {
        case 'state':
          setState(event.state)
          if (event.state.status !== 'launching') setProgress(null)
          break
        case 'log':
          appendLog(event.text, event.error)
          break
        case 'progress':
          setProgress(event.finished ? null : event.message)
          if (event.message && !event.finished) appendLog(event.message, false)
          break
        case 'exit':
          appendLog(`Application finished${event.code ? ` (exit code ${event.code})` : ''}.`, Boolean(event.code))
          break
      }
    })
  }, [api, appendLog, refreshDevices])

  /** Runs an action, turning failures into an error notice. */
  const guard = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn()
      } catch (err) {
        const message = (err as Error).message
        notify('error', message)
        appendLog(message, true)
        return undefined
      }
    },
    [notify, appendLog],
  )

  const actions = {
    refreshDevices,
    pickProject: () => guard(() => api.pickProject()),
    /** Opens a project folder directly (e.g. another git worktree). */
    openProject: (path: string) => guard(() => api.setProject(path)),
    /** Shows a message in the toast. */
    notify: (kind: 'ok' | 'error', text: string) => notify(kind, text),
    selectDevice: (id: string) => guard(() => api.selectDevice(id)),
    run: () => guard(() => api.run()),
    stop: () => guard(() => api.stop()),
    clearLogs: () => setLogs([]),
    hotReload: () =>
      guard(async () => {
        const r = await api.hotReload()
        setLastAction({ kind: 'reload', durationMs: r.durationMs, seq: nextId++ })
        appendLog(`⚡ Hot reload done in ${r.durationMs} ms`, false)
      }),
    hotRestart: () =>
      guard(async () => {
        const r = await api.hotRestart()
        setLastAction({ kind: 'restart', durationMs: r.durationMs, seq: nextId++ })
        appendLog(`↻ Hot restart done in ${r.durationMs} ms`, false)
      }),
    screenshot: () =>
      guard(async () => {
        setScreenshotBusy(true)
        try {
          const r = await api.screenshot()
          setLastAction({ kind: 'screenshot', durationMs: r.durationMs, seq: nextId++ })
          const file = r.path.split('/').pop()
          notify('ok', file ?? r.path, r.path, 'Screenshot saved')
          appendLog(`📸 Screenshot saved to ${r.path}`, false)
        } finally {
          setScreenshotBusy(false)
        }
      }),
  }

  return { state, devices, devicesLoading, logs, progress, lastAction, screenshotBusy, actions }
}

export type FlutterController = ReturnType<typeof useFlutter>
