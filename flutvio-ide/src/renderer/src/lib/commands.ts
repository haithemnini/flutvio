/**
 * commands.ts — app commands from the macOS menu (and anywhere else) to the component that
 * handles them: onCommand('save', fn) in the editor, onCommand('toggle-panel', fn) in the app…
 */

import { useEffect, useRef } from 'react'
import type { MenuCommand } from '../../../shared/flutvio-api'

type Id = MenuCommand['id']
type Handler = (cmd: MenuCommand) => void

const handlers = new Map<Id, Set<Handler>>()
let wired = false

export function runCommand(cmd: MenuCommand): void {
  for (const h of handlers.get(cmd.id) ?? []) h(cmd)
}

function wire(): void {
  if (wired) return
  wired = true
  window.flutvio.ui.onMenu(runCommand)
}

/** Subscribes a component to one or more commands for its lifetime. */
export function useCommand(ids: Id | Id[], handler: Handler): void {
  const ref = useRef(handler)
  ref.current = handler
  const key = Array.isArray(ids) ? ids.join(',') : ids
  useEffect(() => {
    wire()
    const list = key.split(',') as Id[]
    const h: Handler = (c) => ref.current(c)
    for (const id of list) {
      if (!handlers.has(id)) handlers.set(id, new Set())
      handlers.get(id)!.add(h)
    }
    return () => {
      for (const id of list) handlers.get(id)?.delete(h)
    }
  }, [key])
}
