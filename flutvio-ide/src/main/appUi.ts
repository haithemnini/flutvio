/**
 * src/main/appUi.ts
 * Flutvio — the macOS app menu, app info, the tool check shown during onboarding,
 * File › Open File…, recent projects (IPC: ui:*).
 *
 * Menu items that act on the UI send a command to the renderer (`ui:menu`), which runs it
 * (src/renderer/src/lib/commands.ts).
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItemConstructorOptions, nativeImage, Notification, shell } from 'electron'
import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { MenuCommand, ToolCheck } from '../shared/flutvio-api'
import { resolveFlutterBin } from './flutterBin'
import { allowFile } from './projectFiles'
import { loadSettings } from './settingsStore'
import { companionPath, idbPath } from './simulatorBridge'
import { AGENTS_MD_SECTION } from './agentBridge'

function run(cmd: string, args: string[], timeout = 20_000): Promise<string | null> {
  return new Promise((resolve) =>
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, out, stderr) => resolve(err ? null : `${out}${stderr}`)),
  )
}

let loginPath: Promise<string> | null = null
function shellPath(): Promise<string> {
  loginPath ??= new Promise((resolve) =>
    execFile(process.env.SHELL || '/bin/zsh', ['-lc', 'echo $PATH'], { timeout: 5000 }, (err, out) =>
      resolve(err ? process.env.PATH ?? '' : out.trim()),
    ),
  )
  return loginPath
}

async function which(bin: string, extra: string[] = []): Promise<string | null> {
  const dirs = (await shellPath()).split(':')
  return [...dirs.map((d) => join(d, bin)), ...extra].find((p) => existsSync(p)) ?? null
}

/**
 * Flutter + Dart versions read from the SDK's own files (instant, no `flutter` process, so it
 * never waits on Flutter's startup lock). Falls back to `flutter --version --machine`.
 */
async function flutterVersion(flutter: string): Promise<string> {
  try {
    const root = dirname(dirname(realpathSync(flutter)))
    const fw = JSON.parse(readFileSync(join(root, 'bin/cache/flutter.version.json'), 'utf8')) as { frameworkVersion?: string; channel?: string }
    const dart = readFileSync(join(root, 'bin/cache/dart-sdk/version'), 'utf8').trim()
    if (fw.frameworkVersion) return `Flutter ${fw.frameworkVersion} (${fw.channel ?? 'stable'}) · Dart ${dart}`
  } catch {
    /* fall back to the command */
  }
  const out = await run(flutter, ['--version', '--machine'], 90_000)
  try {
    const j = JSON.parse(out?.slice(out.indexOf('{'), out.lastIndexOf('}') + 1) ?? '') as { frameworkVersion?: string; dartSdkVersion?: string }
    return j.frameworkVersion ? `Flutter ${j.frameworkVersion} · Dart ${j.dartSdkVersion?.split(' ')[0]}` : ''
  } catch {
    return ''
  }
}

/** What Flutvio needs (and can use) on this Mac. */
export async function checkTools(): Promise<ToolCheck[]> {
  const flutter = await resolveFlutterBin()
  const [flutterVer, xcodeOut, git, adb, claude, opencode, codex, gemini] = await Promise.all([
    flutterVersion(flutter),
    run('xcodebuild', ['-version']),
    which('git'),
    which('adb', [join(homedir(), 'Library/Android/sdk/platform-tools/adb')]),
    which('claude', [join(homedir(), '.local/bin/claude')]),
    which('opencode', [join(homedir(), '.opencode/bin/opencode')]),
    which('codex'),
    which('gemini'),
  ])
  const companion = companionPath()
  const idb = idbPath()
  const xcode = xcodeOut?.split('\n')[0]?.trim() ?? ''
  return [
    {
      id: 'flutter', name: 'Flutter SDK', required: true, ok: Boolean(flutterVer),
      detail: flutterVer || 'Not found', hint: 'Install from flutter.dev, or set FLUTVIO_FLUTTER to the flutter binary.',
    },
    {
      id: 'xcode', name: 'Xcode', required: true, ok: Boolean(xcode),
      detail: xcode || 'Not found', hint: 'Install Xcode from the App Store, then run: sudo xcode-select -s /Applications/Xcode.app',
    },
    {
      id: 'idb_companion', name: 'idb_companion', required: true, ok: existsSync(companion),
      detail: existsSync(companion) ? companion : 'Not found', hint: 'brew install facebook/fb/idb-companion',
    },
    {
      id: 'idb', name: 'idb client', required: false, ok: existsSync(idb),
      detail: existsSync(idb) ? idb : 'Not found (only needed for "On-screen elements")',
      hint: 'python3 -m venv ~/.flutvio-idb && ~/.flutvio-idb/bin/pip install fb-idb',
    },
    { id: 'git', name: 'Git', required: false, ok: Boolean(git), detail: git ?? 'Not found', hint: 'xcode-select --install' },
    {
      id: 'adb', name: 'Android tools (adb)', required: false, ok: Boolean(adb), detail: adb ?? 'Not found',
      hint: 'Install Android Studio, or: brew install android-platform-tools',
    },
    {
      id: 'agents', name: 'Coding agents', required: false, ok: Boolean(claude || opencode || codex || gemini),
      detail: [claude && 'Claude Code', opencode && 'OpenCode', codex && 'Codex', gemini && 'Gemini'].filter(Boolean).join(', ') || 'None found',
      hint: 'Optional: install Claude Code, OpenCode, Codex or Gemini CLI.',
    },
  ]
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export function buildMenu(win: BrowserWindow): void {
  const send = (command: MenuCommand): void => {
    if (!win.isDestroyed()) win.webContents.send('ui:menu', command)
  }
  const item = (label: string, command: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => send(command),
  })
  const recents = loadSettings().recentProjects ?? []

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        item("What's New", { id: 'whats-new' }),
        { type: 'separator' },
        item('Settings…', { id: 'settings' }, 'CmdOrCtrl+,'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        item('Open Project…', { id: 'open-project' }, 'CmdOrCtrl+O'),
        item('Open File…', { id: 'open-file' }, 'CmdOrCtrl+Shift+O'),
        {
          label: 'Open Recent',
          enabled: recents.length > 0,
          submenu: recents.length
            ? [
                ...recents.map((p) => ({ label: `${basename(p)}  —  ${p.replace(homedir(), '~')}`, click: () => send({ id: 'open-recent', path: p }) })),
              ]
            : [{ label: 'No recent projects', enabled: false }],
        },
        { type: 'separator' },
        item('Save', { id: 'save' }, 'CmdOrCtrl+S'),
        item('Close Tab', { id: 'close-tab' }, 'CmdOrCtrl+W'),
        { type: 'separator' },
        { role: 'close', label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        // Routed through the renderer: in a terminal it selects the terminal's text, elsewhere the usual.
        item('Select All', { id: 'select-all' }, 'CmdOrCtrl+A'),
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        item('New Terminal', { id: 'new-terminal' }, 'CmdOrCtrl+T'),
        item('Flutter Terminal', { id: 'flutter-terminal' }, 'CmdOrCtrl+Shift+F'),
        // ⌘D and ⌘K are handled by the terminal itself (so the editor keeps its own ⌘D / ⌘K).
        item('Split Terminal  (⌘D in the terminal)', { id: 'split-terminal' }),
        item('Clear  (⌘K in the terminal)', { id: 'clear-terminal' }),
        { type: 'separator' },
        item('Next Tab', { id: 'next-tab' }, 'Ctrl+Tab'),
        item('Previous Tab', { id: 'prev-tab' }, 'Ctrl+Shift+Tab'),
        {
          label: 'Go to Tab',
          submenu: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => item(`Tab ${n}`, { id: 'select-tab', index: n - 1 }, `CmdOrCtrl+${n}`)),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Side Panel', { id: 'toggle-sidebar' }, 'CmdOrCtrl+B'),
        item('Changes', { id: 'toggle-panel' }, 'CmdOrCtrl+J'),
        item('Agent', { id: 'toggle-agent' }, 'CmdOrCtrl+Shift+A'),
        item('Simulator', { id: 'toggle-simulator' }, 'CmdOrCtrl+Shift+M'),
        item('Browser', { id: 'toggle-browser' }, 'CmdOrCtrl+Shift+B'),
        item('Flutter Logs', { id: 'toggle-logs' }, 'CmdOrCtrl+Shift+L'),
        { type: 'separator' },
        item('Zoom In', { id: 'zoom-in' }, 'CmdOrCtrl+='),
        item('Zoom Out', { id: 'zoom-out' }, 'CmdOrCtrl+-'),
        item('Actual Size', { id: 'zoom-reset' }, 'CmdOrCtrl+0'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : ([{ type: 'separator' }, { role: 'toggleDevTools' }, { role: 'forceReload' }] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: 'Run',
      submenu: [
        item('Run', { id: 'run' }, 'CmdOrCtrl+R'),
        item('Stop', { id: 'stop' }, 'CmdOrCtrl+.'),
        { type: 'separator' },
        item('Hot Reload', { id: 'hot-reload' }, 'CmdOrCtrl+\\'),
        item('Hot Restart', { id: 'hot-restart' }, 'CmdOrCtrl+Shift+\\'),
        { type: 'separator' },
        item('Screenshot', { id: 'screenshot' }, 'CmdOrCtrl+Shift+5'),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        item('Welcome Guide', { id: 'onboarding' }),
        item('Keyboard Shortcuts', { id: 'shortcuts' }, 'CmdOrCtrl+/'),
        { label: 'Flutter Documentation', click: () => void shell.openExternal('https://docs.flutter.dev') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── New project / clone ──────────────────────────────────────────────────────

/** Valid Dart package name (what `flutter create` accepts). */
export function validProjectName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name) && name.length <= 64
}

/** Parent folder chosen by the user (null = cancelled). */
async function pickFolder(win: BrowserWindow, title: string): Promise<string | null> {
  const res = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Choose' })
  return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
}

/** `flutter create <name>` inside `parent`; returns the new project folder. */
export async function createProject(parent: string, name: string): Promise<string> {
  if (!validProjectName(name)) throw new Error('Use lowercase letters, numbers and _ (start with a letter), e.g. my_app.')
  const target = join(parent, name)
  if (existsSync(target)) throw new Error(`A folder named "${name}" already exists there.`)
  const flutter = await resolveFlutterBin()
  await new Promise<void>((resolve, reject) =>
    execFile(flutter, ['create', '--project-name', name, target], { timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) =>
      err ? reject(new Error((stderr || err.message).trim().split('\n').slice(-3).join(' '))) : resolve(),
    ),
  )
  return target
}

/** Clones a repository (URL, or owner/name via gh) into `parent`; returns the folder holding pubspec.yaml. */
export async function cloneRepo(parent: string, source: string): Promise<string> {
  const src = source.trim()
  const short = /^[\w.-]+\/[\w.-]+$/.test(src)
  if (!short && !/^(https:\/\/|git@|ssh:\/\/)/.test(src)) throw new Error('Enter a git URL (https://… or git@…) or owner/repo.')
  const name = src.replace(/\.git$/, '').split(/[/:]/).pop()!
  const target = join(parent, name)
  if (existsSync(target)) throw new Error(`A folder named "${name}" already exists there.`)
  const [cmd, args] = short
    ? [existsSync('/opt/homebrew/bin/gh') ? '/opt/homebrew/bin/gh' : 'gh', ['repo', 'clone', src, target]]
    : ['git', ['clone', src, target]]
  await new Promise<void>((resolve, reject) =>
    execFile(cmd, args, { timeout: 600_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, _out, stderr) =>
      err ? reject(new Error((stderr || err.message).trim().split('\n').slice(-2).join(' '))) : resolve(),
    ),
  )
  // The Flutter app may be in a sub-folder (monorepos): look one level down.
  if (existsSync(join(target, 'pubspec.yaml'))) return target
  const { readdirSync, statSync } = await import('node:fs')
  for (const d of readdirSync(target)) {
    const p = join(target, d)
    if (!d.startsWith('.') && statSync(p).isDirectory() && existsSync(join(p, 'pubspec.yaml'))) return p
  }
  throw new Error(`Cloned to ${target}, but no pubspec.yaml was found there. Open the Flutter folder with Open Project.`)
}

/**
 * Adds a short "Flutvio" section to the project's AGENTS.md so coding agents know the
 * `flutvio` command (simulator + hot reload). Only on the user's request; never twice.
 */
export function teachAgents(projectPath: string): 'added' | 'already' {
  if (typeof projectPath !== 'string' || !existsSync(join(projectPath, 'pubspec.yaml'))) throw new Error('Open a Flutter project first.')
  const file = join(projectPath, 'AGENTS.md')
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (current.includes('## Flutvio')) return 'already'
  appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}${current ? '\n' : ''}${AGENTS_MD_SECTION}`)
  return 'added'
}

export function registerUiIPC(win: BrowserWindow): void {
  ipcMain.removeAllListeners('ui:selectAll')
  ipcMain.on('ui:selectAll', () => win.webContents.selectAll())
  ipcMain.removeHandler('ui:teachAgents')
  ipcMain.handle('ui:teachAgents', (_e, projectPath: string) => teachAgents(projectPath))
  for (const ch of ['ui:appInfo', 'ui:checkTools', 'ui:openFileDialog', 'ui:recentProjects', 'ui:pickFolder', 'ui:createProject', 'ui:cloneRepo'])
    ipcMain.removeHandler(ch)
  ipcMain.handle('ui:pickFolder', (_e, title: string) => pickFolder(win, title))
  ipcMain.handle('ui:createProject', (_e, parent: string, name: string) => createProject(parent, name))
  ipcMain.handle('ui:cloneRepo', (_e, parent: string, source: string) => cloneRepo(parent, source))
  ipcMain.removeAllListeners('ui:setBackground')
  ipcMain.handle('ui:appInfo', () => ({ version: app.getVersion(), electron: process.versions.electron, name: app.name }))
  ipcMain.handle('ui:checkTools', () => checkTools())
  ipcMain.handle('ui:recentProjects', () => loadSettings().recentProjects ?? [])
  ipcMain.handle('ui:openFileDialog', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], title: 'Open File' })
    if (res.canceled || !res.filePaths[0]) return null
    allowFile(res.filePaths[0])
    return res.filePaths[0]
  })
  ipcMain.removeHandler('ui:imageThumb')
  ipcMain.handle('ui:imageThumb', (_e, path: string) => {
    if (!/\.(png|jpe?g)$/i.test(path) || !existsSync(path)) return null
    const img = nativeImage.createFromPath(path)
    return img.isEmpty() ? null : img.resize({ height: 96 }).toDataURL()
  })
  ipcMain.removeAllListeners('ui:notify')
  ipcMain.on('ui:notify', (_e, n: { title: string; body: string; term?: string }) => {
    // Only while the user is somewhere else: inside the app the toast and the bell say it.
    if (win.isDestroyed() || win.isFocused() || !Notification.isSupported()) return
    const note = new Notification({ title: String(n.title).slice(0, 120), body: String(n.body).slice(0, 300) })
    note.on('click', () => {
      if (win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      if (n.term) win.webContents.send('ui:menu', { id: 'focus-terminal', term: n.term } satisfies MenuCommand)
    })
    note.show()
  })
  ipcMain.removeAllListeners('ui:setBadge')
  ipcMain.on('ui:setBadge', (_e, count: number) => {
    if (process.platform === 'darwin') app.dock?.setBadge(count > 0 ? String(Math.min(99, Math.round(count))) : '')
  })
  ipcMain.on('ui:setBackground', (_e, color: string) => {
    if (/^#[0-9a-f]{6}$/i.test(color) && !win.isDestroyed()) win.setBackgroundColor(color)
  })
  buildMenu(win)
}
