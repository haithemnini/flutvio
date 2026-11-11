/**
 * src/main/index.ts
 * Flutvio — Electron Main Process
 *
 * Responsibilities:
 *  - Create the BrowserWindow
 *  - Register IPC services: terminal (ptyManager) and Flutter (flutterService)
 *  - Dev-only automated tests (no-op unless their env vars are set)
 */

import { app, BrowserWindow, shell, systemPreferences } from 'electron'
import { join, resolve } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'
import { registerPtyIPC } from './ptyManager'
import { registerFlutterIPC } from './flutterService'
import { registerSimulatorIPC } from './simulatorBridge'
import { registerAiIPC } from './aiSessions'
import { registerFilesIPC } from './projectFiles'
import { registerLspIPC } from './dartLsp'
import { registerGitIPC } from './worktreeService'
import { buildMenu, registerUiIPC } from './appUi'
import { registerScmIPC } from './gitService'
import { runRtlSnapshot } from './rtlSnapshot'
import { runE2E } from './e2eHarness'
import { startAgentBridge } from './agentBridge'
import { registerAgentIPC } from './agentIpc'

// Automated tests use a fresh profile so they never change the user's settings.
if (process.env['FLUTVIO_E2E']) app.setPath('userData', join(resolve(process.env['FLUTVIO_E2E']), 'profile'))

// Holding a key repeats it (like every terminal) instead of opening macOS's accent popup, which
// also swallowed the next keys (e.g. Delete right after typing). Stored in Flutvio's own defaults.
if (process.platform === 'darwin') {
  try {
    systemPreferences.setUserDefault('ApplePressAndHoldEnabled', 'boolean', false)
  } catch {
    /* not critical */
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    backgroundColor: '#141416',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 11 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Built-in browser panel (<webview>); every guest is locked down in will-attach-webview.
      webviewTag: true,
    },
  })

  win.webContents.on('will-attach-webview', (_e, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.nodeIntegrationInSubFrames = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    prefs.webSecurity = true
    // Only web pages (no file://, no app internals).
    if (!/^https?:\/\//.test(params.src) && params.src !== 'about:blank') params.src = 'about:blank'
  })
  // Links that open new windows from the browser panel go to the default browser.
  win.webContents.on('did-attach-webview', (_e, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const ptys = registerPtyIPC(win)
  registerAgentIPC(win, ptys)
  const flutter = registerFlutterIPC(win)
  flutter.onProjectChanged = () => buildMenu(win)
  const simulator = registerSimulatorIPC(win)
  // The `flutvio` command in every terminal: lets agents see and drive the simulator and the app.
  const binDir = app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'resources', 'bin')
  void startAgentBridge(flutter, simulator, binDir)
    .then((bridge) => {
      ptys.setEnv(bridge.env)
      win.on('closed', () => bridge.close())
    })
    .catch((err: Error) => console.error('[flutvio] agent bridge failed to start:', err.message))
  registerFilesIPC()
  registerAiIPC()
  registerLspIPC(win)
  registerGitIPC()
  registerUiIPC(win)
  registerScmIPC()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Dev-only automated tests (no-op unless FLUTVIO_RTL_SNAPSHOT / FLUTVIO_E2E is set)
  runRtlSnapshot(win)
  runE2E(win)

  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('app.flutvio')
  // Dev: show the Flutvio icon in the Dock (packaged builds use resources/icon.icns).
  if (!app.isPackaged && process.platform === 'darwin') app.dock?.setIcon(join(app.getAppPath(), 'resources', 'icon.png'))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
