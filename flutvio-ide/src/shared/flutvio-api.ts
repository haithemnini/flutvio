/**
 * src/shared/flutvio-api.ts
 * Flutvio — Shared IPC contract.
 *
 * Imported by BOTH the preload (implementation) and the renderer (consumer),
 * so the bridge shape is defined in exactly one place.
 */

// ─── Terminal (PTY) ───────────────────────────────────────────────────────────

export interface PtyCreateOptions {
  /** Session id chosen by the renderer (one per terminal tab). Default 'main'. */
  id?: string
  cols: number
  rows: number
  /** Working directory for the shell; defaults to $HOME. */
  cwd?: string
  /** Typed into the new shell, e.g. `claude --resume <id>`. */
  command?: string
}

export interface PtyAPI {
  create: (opts: PtyCreateOptions) => Promise<{ pid: number }>
  write: (id: string, data: string) => void
  resize: (id: string, cols: number, rows: number) => Promise<void>
  kill: (id: string) => Promise<void>
  onData: (cb: (id: string, data: string) => void) => () => void
  onExit: (cb: (id: string, code: number) => void) => () => void
  /** What runs in the foreground of a terminal changed (`zsh`, `claude`, `opencode`, …). */
  onTitle: (cb: (id: string, title: string) => void) => () => void
}

// ─── Flutter ──────────────────────────────────────────────────────────────────

export interface FlutterDevice {
  id: string
  name: string
  /** e.g. 'ios', 'android-arm64', 'darwin', 'web-javascript' */
  platform: string
  emulator: boolean
  sdk: string
  supported: boolean
  canHotReload: boolean
  canScreenshot: boolean
}

export interface FlutterProject {
  /** Absolute path of the folder containing pubspec.yaml. */
  path: string
  /** `name:` from pubspec.yaml (falls back to the folder name). */
  name: string
}

export type FlutterStatus =
  | 'idle' // no app running
  | 'launching' // flutter run started, building/installing
  | 'running' // app.started received
  | 'reloading'
  | 'restarting'
  | 'stopping'

export interface FlutterState {
  status: FlutterStatus
  project: FlutterProject | null
  deviceId: string | null
  /** Device the app is running on (set while launching/running). */
  runningDeviceId: string | null
}

export interface ActionResult {
  durationMs: number
}

export interface ScreenshotResult extends ActionResult {
  path: string
}

export type FlutterEvent =
  | { type: 'state'; state: FlutterState }
  | { type: 'log'; text: string; error: boolean }
  | { type: 'progress'; message: string; finished: boolean }
  | { type: 'exit'; code: number | null }

export interface FlutterAPI {
  getState: () => Promise<FlutterState>
  listDevices: () => Promise<FlutterDevice[]>
  /** Opens a folder picker; resolves null if cancelled. */
  pickProject: () => Promise<FlutterProject | null>
  /** Sets the project by path (validates pubspec.yaml). */
  setProject: (path: string) => Promise<FlutterProject>
  selectDevice: (deviceId: string) => Promise<void>
  /** Starts `flutter run --machine` on the selected device. */
  run: () => Promise<void>
  hotReload: () => Promise<ActionResult>
  hotRestart: () => Promise<ActionResult>
  /** Saves a PNG of the device screen to the Desktop. */
  screenshot: () => Promise<ScreenshotResult>
  stop: () => Promise<void>
  /** Shows a saved screenshot in Finder. */
  revealFile: (path: string) => Promise<void>
  onEvent: (cb: (event: FlutterEvent) => void) => () => void
}

// ─── Embedded simulator ───────────────────────────────────────────────────────

export type SimEvent =
  | { type: 'video'; data: Uint8Array } // H.264 Annex-B access unit(s)
  | { type: 'video-restart' } // a new stream starts; wait for the next key frame
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'stopped'; code: number | null }

export interface SimSize {
  /** Screen size in points — touch coordinates use this space. */
  widthPts: number
  heightPts: number
}

export type SimButton = 'HOME' | 'LOCK' | 'VOLUME_UP' | 'VOLUME_DOWN' | 'SIRI' | 'SIDE_BUTTON'
export type TouchPhase = 'down' | 'move' | 'up'
export type SimOrientation = 'PORTRAIT' | 'LANDSCAPE_LEFT' | 'LANDSCAPE_RIGHT' | 'PORTRAIT_UPSIDE_DOWN'

/** An iOS simulator known to Xcode. */
export interface SimDevice {
  udid: string
  name: string
  runtime: string
  booted: boolean
  deviceType: string
}

/** Xcode's device frame (DeviceKit chrome): 9-slice parts around the screen + hardware buttons. */
export interface DeviceChrome {
  id: string
  /** How far the frame extends beyond the screen on each side, in points. */
  bezel: { left: number; right: number; top: number; bottom: number }
  /** Size of the square corner pieces (edges are as thick), in points. */
  corner: number
  cornerRadius: number
  parts: Record<'topLeft' | 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left', string>
  inputs: Array<{
    name: string
    title: string
    anchor: 'left' | 'right'
    /** Offset from the anchored edge (x) and from the top (y), in points. */
    x: number
    y: number
    hoverX: number
    width: number
    height: number
    image: string
    imageDown: string
    button: SimButton
  }>
}

/** An on-screen accessibility element (frame in device points). */
export interface SimElement {
  label: string
  role: string
  x: number
  y: number
  width: number
  height: number
}

export interface SimAPI {
  /** iOS simulators known to Xcode, booted first. */
  devices: () => Promise<SimDevice[]>
  /** Boots a simulator and opens it in Simulator.app. */
  boot: (udid: string) => Promise<void>
  /** Shuts a simulator down (frees its memory); stops mirroring it first. */
  shutdown: (udid: string) => Promise<void>
  /** Xcode's frame for this simulator, or null if not available. */
  chrome: (udid: string) => Promise<DeviceChrome | null>
  /** Attaches to a booted simulator. Resolves null if a newer start/stop replaced this one. */
  start: (udid: string, fps?: number) => Promise<SimSize | null>
  stop: () => Promise<void>
  /** Live finger: down, then moves, then up (fire-and-forget). */
  touch: (phase: TouchPhase, x: number, y: number) => void
  tap: (x: number, y: number) => Promise<void>
  button: (name: SimButton) => Promise<void>
  swipe: (x1: number, y1: number, x2: number, y2: number) => Promise<void>
  /** US-keyboard text is typed; other text (Arabic, emoji) is pasted. */
  typeText: (text: string) => Promise<void>
  /** Presses one HID key code (42 Backspace, 40 Return, 43 Tab) with optional modifier key codes. */
  key: (code: number, modifiers?: number[]) => Promise<void>
  rotate: (orientation: SimOrientation) => Promise<void>
  elements: () => Promise<SimElement[]>
  onEvent: (cb: (event: SimEvent) => void) => () => void
}

// ─── Project files ────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

export interface FileReadResult {
  path: string
  content: string
  binary: boolean
  truncated: boolean
  size: number
}

export interface FilesAPI {
  list: (dir: string) => Promise<FileEntry[]>
  read: (path: string) => Promise<FileReadResult>
  write: (path: string, content: string) => Promise<void>
}

// ─── Coding agents ────────────────────────────────────────────────────────────

export type AgentId = 'claude' | 'opencode' | 'codex' | 'gemini'

export interface AgentInfo {
  id: AgentId
  name: string
  installed: boolean
  /** Shell command that starts a new session. */
  newCommand: string
}

export interface AgentSession {
  agent: AgentId
  id: string
  title: string
  /** Epoch ms of the last activity. */
  updatedAt: number
  messages: number
  /** Shell command that resumes this session. */
  resumeCommand: string
}

export interface AgentsResult {
  agents: AgentInfo[]
  sessions: AgentSession[]
}

export interface AiAPI {
  /** Installed agents and their sessions recorded for this project folder (newest first). */
  agents: (projectPath: string) => Promise<AgentsResult>
}

/** What the agent in a terminal is doing: working on a turn, or waiting for the user. */
export type AgentActivity = 'working' | 'idle'

/** Live view of the agent running in one terminal (Agent tab of the side panel). */
export interface AgentMonitorData {
  termId: string
  /** Foreground program of the terminal (`claude`, `opencode`, …). */
  agent: string
  activity: AgentActivity
  /** Session details — read from Claude Code's own local files; absent for other agents. */
  session?: {
    id: string
    name: string
    model: string
    startedAt: number
    /** Tokens in the context of the latest request. */
    contextTokens: number
    /** Context window of the model (estimated: 200K, or 1M once the session went past 200K). */
    contextWindow: number
    /** Times the conversation was compacted. */
    compactions: number
    /** Prompts sent by the user. */
    turns: number
    outputTokens: number
    /** MCP servers / connectors whose tools were called in this session. */
    toolsUsed: string[]
    /** Set while a usage limit is in force. */
    limit: { type: string; resetsAt: number } | null
  }
  /** Subscription, e.g. "Pro" (from the local Claude Code profile). */
  plan?: string
}

export interface AgentConnection {
  name: string
  /** Connector from the claude.ai account, a plugin's server, or one configured by hand. */
  source: 'connector' | 'plugin' | 'mcp'
  status: 'connected' | 'needs-auth' | 'failed' | 'off'
  detail: string
}

export interface AgentAPI {
  /** An agent started or finished a turn in a terminal. */
  onActivity: (cb: (termId: string, activity: AgentActivity) => void) => () => void
  /** Which terminal the Agent panel follows (null = none). */
  watch: (termId: string | null) => Promise<AgentMonitorData | null>
  onData: (cb: (data: AgentMonitorData) => void) => () => void
  /** MCP servers and connectors as Claude Code reports them for this folder (`claude mcp list`). */
  connections: (cwd: string, refresh?: boolean) => Promise<AgentConnection[]>
}

// ─── Git worktrees ────────────────────────────────────────────────────────────

export interface Worktree {
  path: string
  /** Branch name ('' when detached). */
  branch: string
  head: string
  bare: boolean
  detached: boolean
  locked: boolean
  /** The repository's main checkout. */
  main: boolean
}

export interface GitInfo {
  /** Top folder of the current worktree. */
  root: string
  /** Sub-folder of the repository that holds the open project ('' = root). */
  subdir: string
  branch: string
  /** Uncommitted changes in the current worktree. */
  dirty: boolean
  worktrees: Worktree[]
}

export interface GitAPI {
  /** Repository info for a folder, or null when it isn't in a git repository. */
  info: (path: string) => Promise<GitInfo | null>
  /** New worktree on a new (or existing) branch, next to the main checkout. */
  createWorktree: (path: string, branch: string) => Promise<Worktree>
  /** Removes a worktree folder; the branch is kept. */
  removeWorktree: (path: string, force?: boolean) => Promise<void>
}

// ─── Source control (git) + GitHub (gh) ───────────────────────────────────────

export interface ScmFile {
  /** Path relative to the repository root. */
  path: string
  /** Original path of a rename. */
  orig?: string
  /** Index (staged) status: M A D R C U or '.' (none). */
  index: string
  /** Working-tree status: M D U ? or '.' (none). */
  work: string
  conflict?: boolean
}

export interface ScmStatus {
  root: string
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  files: ScmFile[]
}

export interface ScmCommit {
  sha: string
  parents: string[]
  author: string
  email: string
  /** Epoch ms. */
  date: number
  subject: string
  /** e.g. "HEAD -> main", "origin/main", "tag: v1.0" */
  refs: string[]
}

export interface ScmAPI {
  /** null when the folder is not in a git repository. */
  status: (path: string) => Promise<ScmStatus | null>
  stage: (root: string, paths: string[]) => Promise<void>
  unstage: (root: string, paths: string[]) => Promise<void>
  /** Throws away working-tree changes (untracked files are deleted). */
  discard: (root: string, paths: string[]) => Promise<void>
  /** Returns the new short sha. */
  commit: (root: string, message: string, opts?: { all?: boolean; amend?: boolean }) => Promise<string>
  fetch: (root: string) => Promise<void>
  pull: (root: string) => Promise<void>
  push: (root: string) => Promise<void>
  /** ref: 'HEAD', ':' (index), a sha, or 'WORKTREE'. '' when the file doesn't exist there. */
  fileAt: (root: string, ref: string, path: string) => Promise<string>
  log: (root: string, limit?: number) => Promise<ScmCommit[]>
  /** All uncommitted changes (incl. untracked files) as one unified diff against HEAD. */
  workingDiff: (root: string) => Promise<string>
  commitFiles: (root: string, sha: string) => Promise<Array<{ path: string; status: string }>>
  branches: (root: string) => Promise<Array<{ name: string; current: boolean; remote: boolean }>>
  switchBranch: (root: string, name: string, create?: boolean) => Promise<void>
}

export interface GhStatus {
  installed: boolean
  authed: boolean
  user: string | null
  /** owner/name of the GitHub repository, if the project has one. */
  repo: string | null
  url: string | null
}

export interface PrSummary {
  number: number
  title: string
  author: string
  head: string
  base: string
  draft: boolean
  updatedAt: number
  reviewDecision: string | null
  url: string
  additions: number
  deletions: number
  state: string
}

export interface PrDetail extends Omit<PrSummary, 'updatedAt'> {
  body: string
  mergeable: string | null
  createdAt: number
  files: Array<{ path: string; additions: number; deletions: number }>
  checks: Array<{ name: string; status: string }>
  timeline: Array<{ kind: 'comment' | 'review'; author: string; body: string; at: number; state?: string }>
}

export interface GhAPI {
  status: (root: string) => Promise<GhStatus>
  prList: (root: string, state?: 'open' | 'closed' | 'merged' | 'all') => Promise<PrSummary[]>
  prView: (root: string, number: number) => Promise<PrDetail>
  /** Unified diff of the pull request. */
  prDiff: (root: string, number: number) => Promise<string>
  prComment: (root: string, number: number, body: string) => Promise<void>
  prReview: (root: string, number: number, action: 'approve' | 'request-changes' | 'comment', body: string) => Promise<void>
  prCheckout: (root: string, number: number) => Promise<void>
  /** Returns the new PR's URL. */
  prCreate: (root: string, opts: { title: string; body: string; base?: string; draft?: boolean }) => Promise<string>
  prMerge: (root: string, number: number, method: 'merge' | 'squash' | 'rebase') => Promise<void>
}

// ─── Dart language server ─────────────────────────────────────────────────────

export interface LspAPI {
  /** Starts the Dart analysis server for a project; resolves with its capabilities. */
  start: (root: string) => Promise<unknown>
  request: (method: string, params: unknown) => Promise<unknown>
  notify: (method: string, params: unknown) => void
  stop: () => Promise<void>
  /** Server notifications (publishDiagnostics, $/analyzerStatus, $/flutvio/status …). */
  onEvent: (cb: (method: string, params: unknown) => void) => () => void
}

// ─── App UI (menu, onboarding, settings) ──────────────────────────────────────

export type MenuCommand =
  | { id: 'open-project' | 'open-file' | 'new-terminal' | 'save' | 'close-tab' | 'settings' | 'whats-new' | 'onboarding' }
  | { id: 'toggle-sidebar' | 'toggle-panel' | 'toggle-simulator' | 'toggle-browser' | 'toggle-logs' }
  | { id: 'split-terminal' | 'clear-terminal' | 'next-tab' | 'prev-tab' | 'shortcuts' }
  | { id: 'select-tab'; index: number }
  | { id: 'flutter-terminal' | 'toggle-agent' }
  | { id: 'focus-terminal'; term: string }
  | { id: 'select-all' }
  | { id: 'zoom-in' | 'zoom-out' | 'zoom-reset' }
  | { id: 'run' | 'stop' | 'hot-reload' | 'hot-restart' | 'screenshot' }
  | { id: 'open-recent'; path: string }

export interface ToolCheck {
  id: string
  name: string
  required: boolean
  ok: boolean
  detail: string
  /** How to install / fix it. */
  hint: string
}

export interface UiAPI {
  /** Whole-window zoom factor (interface size). */
  setZoom: (factor: number) => void
  /** Window background (shown while resizing / loading). */
  setBackground: (color: string) => void
  appInfo: () => Promise<{ version: string; electron: string; name: string }>
  /** Flutter, Xcode, idb, git, adb, agents — for onboarding and Settings. */
  checkTools: () => Promise<ToolCheck[]>
  /** File › Open File… — returns the chosen path (allowed for reading/writing) or null. */
  openFileDialog: () => Promise<string | null>
  /** Standard Select All for the focused field / editor. */
  selectAll: () => void
  /** Adds a section about the `flutvio` command to the project's AGENTS.md (once). */
  teachAgents: (projectPath: string) => Promise<'added' | 'already'>
  /** Folder picker (null = cancelled). */
  pickFolder: (title: string) => Promise<string | null>
  /** `flutter create <name>` in `parent`; resolves with the new project folder. */
  createProject: (parent: string, name: string) => Promise<string>
  /** git clone (URL) or gh repo clone (owner/repo) into `parent`; resolves with the Flutter folder. */
  cloneRepo: (parent: string, source: string) => Promise<string>
  recentProjects: () => Promise<string[]>
  /** Small preview of an image file as a data URL (toasts). */
  imageThumb: (path: string) => Promise<string | null>
  /** macOS notification (only shown while the window is in the background). Clicking it returns to `term`. */
  notify: (n: { title: string; body: string; term?: string }) => void
  /** Number on the Dock icon (0 clears it). */
  setBadge: (count: number) => void
  onMenu: (cb: (command: MenuCommand) => void) => () => void
}

export interface FlutvioAPI {
  pty: PtyAPI
  flutter: FlutterAPI
  sim: SimAPI
  files: FilesAPI
  ai: AiAPI
  agent: AgentAPI
  lsp: LspAPI
  git: GitAPI
  ui: UiAPI
  scm: ScmAPI
  gh: GhAPI
}
