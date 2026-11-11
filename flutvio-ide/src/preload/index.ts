/**
 * src/preload/index.ts
 * Flutvio — contextBridge → window.flutvio
 *
 * The ONLY bridge between renderer (React) and main (Node.js).
 * Never expose raw ipcRenderer. Types live in src/shared/flutvio-api.ts.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent, webFrame } from 'electron'
import type { AgentActivity, AgentMonitorData, FlutvioAPI, FlutterEvent, MenuCommand, SimEvent } from '../shared/flutvio-api'
// (types only — the IPC channels are registered in the main process)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeListener<T>(channel: string) {
  return (cb: (value: T) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, value: T): void => cb(value)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

/**
 * ipcRenderer.invoke wraps errors as "Error invoking remote method 'x': Error: msg".
 * Strip that prefix so the UI can show the real message.
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (err) {
    const message = String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    throw new Error(message)
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

const flutvioAPI: FlutvioAPI = {
  pty: {
    create: (opts) => invoke('pty:create', opts),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => invoke('pty:resize', id, cols, rows),
    kill: (id) => invoke('pty:kill', id),
    onData: (cb) => {
      const h = (_: IpcRendererEvent, id: string, data: string): void => cb(id, data)
      ipcRenderer.on('pty:data', h)
      return () => ipcRenderer.removeListener('pty:data', h)
    },
    onExit: (cb) => {
      const h = (_: IpcRendererEvent, id: string, code: number): void => cb(id, code)
      ipcRenderer.on('pty:exit', h)
      return () => ipcRenderer.removeListener('pty:exit', h)
    },
    onTitle: (cb) => {
      const h = (_: IpcRendererEvent, id: string, title: string): void => cb(id, title)
      ipcRenderer.on('pty:title', h)
      return () => ipcRenderer.removeListener('pty:title', h)
    },
  },

  flutter: {
    getState: () => invoke('flutter:getState'),
    listDevices: () => invoke('flutter:listDevices'),
    pickProject: () => invoke('flutter:pickProject'),
    setProject: (path) => invoke('flutter:setProject', path),
    selectDevice: (id) => invoke('flutter:selectDevice', id),
    run: () => invoke('flutter:run'),
    hotReload: () => invoke('flutter:hotReload'),
    hotRestart: () => invoke('flutter:hotRestart'),
    screenshot: () => invoke('flutter:screenshot'),
    stop: () => invoke('flutter:stop'),
    revealFile: (path) => invoke('flutter:revealFile', path),
    onEvent: makeListener<FlutterEvent>('flutter:event'),
  },

  sim: {
    devices: () => invoke('sim:devices'),
    boot: (udid) => invoke('sim:boot', udid),
    shutdown: (udid) => invoke('sim:shutdown', udid),
    chrome: (udid) => invoke('sim:chrome', udid),
    start: (udid, fps) => invoke('sim:start', udid, fps),
    stop: () => invoke('sim:stop'),
    touch: (phase, x, y) => ipcRenderer.send('sim:touch', phase, x, y),
    tap: (x, y) => invoke('sim:tap', x, y),
    button: (name) => invoke('sim:button', name),
    swipe: (x1, y1, x2, y2) => invoke('sim:swipe', x1, y1, x2, y2),
    typeText: (text) => invoke('sim:text', text),
    key: (code, modifiers) => invoke('sim:key', code, modifiers),
    rotate: (o) => invoke('sim:rotate', o),
    elements: () => invoke('sim:elements'),
    onEvent: makeListener<SimEvent>('sim:event'),
  },

  files: {
    list: (dir) => invoke('files:list', dir),
    read: (path) => invoke('files:read', path),
    write: (path, content) => invoke('files:write', path, content),
  },

  ai: {
    agents: (projectPath) => invoke('ai:agents', projectPath),
  },

  agent: {
    onActivity: (cb) => {
      const h = (_: IpcRendererEvent, id: string, activity: AgentActivity): void => cb(id, activity)
      ipcRenderer.on('agent:activity', h)
      return () => ipcRenderer.removeListener('agent:activity', h)
    },
    watch: (termId) => invoke('agent:watch', termId),
    onData: makeListener<AgentMonitorData>('agent:data'),
    connections: (cwd, refresh) => invoke('agent:connections', cwd, Boolean(refresh)),
  },

  git: {
    info: (path) => invoke('git:info', path),
    createWorktree: (path, branch) => invoke('git:createWorktree', path, branch),
    removeWorktree: (path, force) => invoke('git:removeWorktree', path, force),
  },

  ui: {
    setZoom: (factor) => webFrame.setZoomFactor(Math.min(1.5, Math.max(0.7, factor))),
    setBackground: (color) => ipcRenderer.send('ui:setBackground', color),
    appInfo: () => invoke('ui:appInfo'),
    checkTools: () => invoke('ui:checkTools'),
    openFileDialog: () => invoke('ui:openFileDialog'),
    teachAgents: (p) => invoke('ui:teachAgents', p),
    selectAll: () => ipcRenderer.send('ui:selectAll'),
    pickFolder: (title) => invoke('ui:pickFolder', title),
    createProject: (parent, name) => invoke('ui:createProject', parent, name),
    cloneRepo: (parent, source) => invoke('ui:cloneRepo', parent, source),
    recentProjects: () => invoke('ui:recentProjects'),
    imageThumb: (path) => invoke('ui:imageThumb', path),
    notify: (n) => ipcRenderer.send('ui:notify', n),
    setBadge: (count) => ipcRenderer.send('ui:setBadge', count),
    onMenu: makeListener<MenuCommand>('ui:menu'),
  },

  scm: {
    status: (p) => invoke('scm:status', p),
    stage: (r, paths) => invoke('scm:stage', r, paths),
    unstage: (r, paths) => invoke('scm:unstage', r, paths),
    discard: (r, paths) => invoke('scm:discard', r, paths),
    commit: (r, m, o) => invoke('scm:commit', r, m, o ?? {}),
    fetch: (r) => invoke('scm:fetch', r),
    pull: (r) => invoke('scm:pull', r),
    push: (r) => invoke('scm:push', r),
    fileAt: (r, ref, p) => invoke('scm:fileAt', r, ref, p),
    log: (r, n) => invoke('scm:log', r, n),
    workingDiff: (r) => invoke('scm:workingDiff', r),
    commitFiles: (r, sha) => invoke('scm:commitFiles', r, sha),
    branches: (r) => invoke('scm:branches', r),
    switchBranch: (r, name, create) => invoke('scm:switch', r, name, create),
  },

  gh: {
    status: (r) => invoke('gh:status', r),
    prList: (r, s) => invoke('gh:prList', r, s ?? 'open'),
    prView: (r, n) => invoke('gh:prView', r, n),
    prDiff: (r, n) => invoke('gh:prDiff', r, n),
    prComment: (r, n, b) => invoke('gh:prComment', r, n, b),
    prReview: (r, n, a, b) => invoke('gh:prReview', r, n, a, b),
    prCheckout: (r, n) => invoke('gh:prCheckout', r, n),
    prCreate: (r, o) => invoke('gh:prCreate', r, o),
    prMerge: (r, n, m) => invoke('gh:prMerge', r, n, m),
  },

  lsp: {
    start: (root) => invoke('lsp:start', root),
    request: (method, params) => invoke('lsp:request', method, params),
    notify: (method, params) => ipcRenderer.send('lsp:notify', method, params),
    stop: () => invoke('lsp:stop'),
    onEvent: (cb) => {
      const h = (_: IpcRendererEvent, method: string, params: unknown): void => cb(method, params)
      ipcRenderer.on('lsp:event', h)
      return () => ipcRenderer.removeListener('lsp:event', h)
    },
  },
}

contextBridge.exposeInMainWorld('flutvio', flutvioAPI)
