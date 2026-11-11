# FLUTVIO — Progress Tracker

> This file is updated at the end of every work session.  
> It is the **single source of truth** for where the project stands.

---

## Current Phase: 1 — Foundation + Flutter Daemon MVP

**Phase 0:** ✅ Done (2026-11-09)  
**Phase 1:** ✅ Exit criteria met on iOS Simulator (2026-11-09). Physical iPhone, Android and macOS targets not yet tested.  
**Phase 2:** ✅ (2026-11-10)  
**Phase 3:** iOS done; Android (scrcpy) not started.

---

## Phase 1 Checklist

- [x] `src/main/flutterDaemon.ts` — `flutter run --machine` JSON-RPC wrapper (request timeouts, reload compile errors surfaced, banner lines forwarded as logs, cleaner console events)
- [x] `src/main/flutterService.ts` — project / device / status state machine + `flutter:*` IPC
- [x] `src/main/flutterBin.ts` — finds `flutter` even when the app is opened from Finder (PATH → login shell → common paths)
- [x] `src/main/ptyManager.ts` — single terminal session, opened in the project folder (login shell)
- [x] `src/main/settingsStore.ts` — remembers last project + device
- [x] `src/preload/index.ts` — typed `window.flutvio` bridge; clean error messages
- [x] Renderer: Flutter Control Bar — Open Project, Device selector + refresh, Run/Stop, Hot Reload ⚡, Restart, Screenshot 📸, status pill, last action time
- [x] Renderer: terminal pane (xterm + node-pty, RTL Approach D) + Flutter Console (Arabic logs via `dir="auto"`)
- [x] Fonts bundled locally (`@fontsource/*`) — CSP no longer blocks them
- [x] Phase 0 RTL test kept as the **RTL Lab** tab

### Phase 1 Exit Criteria — results
Tested 2026-11-09 with Flutter 3.47.6, iPhone 17 Pro Simulator (iOS 27), driven through the real UI by `src/main/e2eHarness.ts`.

| Criterion | Result |
|---|---|
| `flutter run` launches on a selected device from the GUI | ✅ 16.8 s (60 s on first build) |
| Hot Reload < 500 ms from button press | ✅ 95 / 37 / 43 ms (avg 58 ms); after a real code edit: 211 ms |
| Code change visible after hot reload | ✅ edited text appeared on the simulator screen |
| Screenshot saves to Desktop | ✅ 605 ms (simctl). Default folder is the Desktop; the test used `FLUTVIO_SCREENSHOT_DIR` to avoid cluttering it |
| Hot Restart | ✅ 565 ms |
| Terminal opens in project folder | ✅ `pwd` shows the project path |
| Stop | ✅ back to Idle in 505 ms |

Evidence: `flutvio-ide/e2e-results/` (report.json + window captures + device screenshot).

### Session 4 — embedded simulator + console toggle
- **Simulator embedded in the window** (`src/main/simulatorBridge.ts`): `idb_companion` + `idb video-stream` (MJPEG, ~12 fps) → IPC → `<img>` in `SimulatorPanel`. Clicks become `idb ui tap` in device points (402×874 for iPhone 17 Pro).
- **Console hidden by default**; the **Console** button in the control bar shows/hides it.
- E2E (`FLUTVIO_E2E`) now also checks: frames arrive and a tap succeeds. Run passed; hot reload avg 54 ms; the running app is visible in the panel (`e2e-results/E2b_running_in_panel.png`).
- Limits: the first frame right after "Running" can be blank for a moment (stream timing). The panel can't type text yet (`idb ui text` not wired). Hiding the Simulator.app window is best-effort (uses AppleScript; may need Accessibility permission). Requires `idb` + `idb_companion` installed (see README).
- Not yet tested on a physical iPhone (the simulator panel is for simulators only).

### Session 5 — IDE layout, file browser, Claude sessions, simulator controls
- **Layout:** sidebar (Files / Claude) · editor above terminal · simulator with controls · console on demand.
- **Files** (`src/main/projectFiles.ts`): lazy project tree (hides `.git`, `build`, `.dart_tool`, …), text editor with line numbers, ⌘S save, read-only for binary or >2 MB files. Access is limited to the open project folder.
- **Claude sessions** (`src/main/aiSessions.ts`): reads `~/.claude/projects/<project>/*.jsonl` (title, message count, last activity). "Resume" types `claude --resume <id>` into the terminal in the project folder. Only metadata is read.
- **Simulator controls** (`src/main/simulatorBridge.ts`, via `idb ui`): Home, Lock, volume, Back (edge swipe), scroll up/down, drag-to-swipe, click-to-tap, type text, and a list of on-screen accessibility elements (tap by name).
- **e2e:** project tree + editor, Claude sessions list, simulator tap + HOME all pass; hot reload avg 55 ms.
- **Not done:** the visual redesign to match the editor design (waiting for the design file); Monaco editor; several terminal tabs; Claude session list is empty for projects without Claude history (the test project has none).

### Session 6 — visual redesign (2026-11-10)
- **Title bar = toolbar:** project · device on the left, Run/Stop + Hot Reload + Restart + Screenshot as one group in the middle, status pill, layout toggles (sidebar / panel / simulator) and Workspace / RTL Lab on the right. New **status bar** (project path, device, last action time, error count).
- **Resizable panes** (drag dividers, double-click resets); sizes and toggles are remembered (`lib/usePersisted.ts`, `components/Splitter.tsx`).
- **Files:** file-type glyphs, indent guides, open/closed folders. **Editor:** tabs (unsaved dot, middle-click close), breadcrumb, Ln/Col, current-line highlight; open tabs keep their unsaved edits.
- **Bottom panel:** Terminal and Flutter Console are tabs (console no longer a side pane). The terminal stays mounted when hidden.
- **Simulator:** drawn iPhone frame scaled to the panel; side buttons work (volume, lock, action). Frames are sent as raw bytes and drawn on a canvas (no base64, no React render per frame); stream raised to 30 fps. Tap ripple, wheel/trackpad scroll, click the screen and type (Backspace/Return/Tab via `idb ui key`), floating toolbar, element search with on-screen highlight, reconnect button. Commands run in order.
- e2e: all 11 steps pass (hot reload avg 57 ms).

### Session 7 — real-simulator mirror, quiet UI, VS Code–grade editor, agents (2026-11-10)
- **Simulator = mirror of Xcode's simulator** (nothing re-created). One gRPC connection to `idb_companion`
  (`@grpc/grpc-js`, descriptor in `resources/idb.desc` exported from fb-idb): `video_stream` H.264 → WebCodecs
  hardware decode on a canvas (`lib/h264.ts`); a persistent `hid` stream for live touch down/move/up, buttons,
  keys, rotation. Text: US keys as HID, other languages pasted (`simctl pbcopy` + ⌘V). Device menu lists Xcode's
  simulators (booted → attach, others → boot). Simulator.app is no longer hidden.
- **Real device frame**: `src/main/deviceChrome.ts` reads DeviceKit chrome (`chromeIdentifier` → `chrome.json` +
  PDFs rasterised with `sips`, cached in userData); side buttons work. Chrome is drawn under the screen.
- **Measured (e2e)**: stream 59–60 fps; tap → visible change on the Flutter counter 14–303 ms across two runs
  (includes the debug app redraw + encode); before: a Python `idb` process per tap.
- **UI**: one quiet theme (new tokens), 36px flat title bar (project ▾ / device ▾, ▶ ⚡ ↻, status, panel toggles,
  ⋯ menu with RTL Lab), 22px status bar (analyzer, problems, Ln/Col, language), small icons everywhere.
- **Editor**: Monaco (bundled, workers via Vite), `flutvio-dark` theme, Dart Monarch grammar (`lib/dartGrammar.ts`),
  one model per tab, minimap, sticky scroll, bracket colours. **Dart LSP** (`src/main/dartLsp.ts` + `lib/lsp.ts`):
  completion (+resolve, snippets, auto-imports), hover, signature help, diagnostics, ⌘-click definition, format on save.
  e2e: `Text` suggestions after 2.1 s (first analysis), error markers shown.
- **Agents sidebar**: Claude Code, OpenCode, Gemini, Codex sessions for the project (`src/main/aiSessions.ts`);
  resume / new session opens its own terminal tab. PTY is now multi-session (`ptyManager.ts`, ids).
- e2e: 13/13 pass (hot reload avg 73 ms, restart 383 ms).
- Follow-up: one flat background (#141416) for the whole app, editor, terminal and simulator; panels separated by thin lines only. Simulator controls moved into a pill right under the device (grouped: Home · Rotate | Screenshot | Type · Elements); fit-to-panel keeps room for it. e2e 13/13 again.
- Limits: Codex/Gemini/OpenCode readers were written from their file formats but only Claude/Gemini had local data
  here; OpenCode list is empty on this machine. Go-to-definition only opens files inside the project (SDK files are
  outside the allowed folder). Renderer bundle is ~9 MB (all Monaco languages). Rotation maps touches but wasn't e2e-tested.

### Session 8 — Phase 2 finished: worktrees, reload on save, split terminals (2026-11-10)
- **Git worktrees** (`src/main/worktreeService.ts`, IPC `git:*`): branch menu in the title bar (project / ⑂ branch ▾ / device).
  New worktree → new branch from HEAD in `<repo>.worktrees/<branch>`, `flutter pub get`, then opened as the project
  (files, terminals, analyzer, agents, Run follow). Projects in a repo sub-folder map to the same sub-folder.
  Remove → back to the main checkout, folder removed, branch kept; asks before discarding uncommitted changes.
  Only while the app is stopped. Unit tests: `scripts/test-worktrees.ts` (7/7).
- **Hot reload on save**: ⌘S on a .dart file while running → hot reload (on by default; ⋯ menu → "Hot reload on save").
- **Split terminals**: split button in the panel header, up to 4 shells side by side; tabs still work.
- **Dart analyzer**: restarts itself (up to 3×) if the server exits, re-opening files; exit reason logged as `[dart-lsp]`.
  Seen once in a run (status "Dart analyzer stopped"); not reproduced since, cause unknown. Problem counts reset per project.
- e2e (on a git copy of the sample): 16/16 — incl. reload on save 193–521 ms, 2 split panes, worktree create → open → remove.

### Session 9 — settings, themes, menus, browser, onboarding (2026-11-10)
- **Themes** (`lib/themes.ts`, `lib/appearance.ts`): Dark, Midnight, Light, Paper, or System (follows macOS).
  Tailwind tokens are CSS variables; each theme also sets the Monaco theme and terminal colours. Switches live.
- **Settings ⌘,** (`components/settings/`): Appearance (theme cards, interface size 0.9–1.2 = window zoom),
  Editor (font, size, line height, ligatures, tab size, format on save, word wrap, cursor, minimap, sticky scroll,
  whitespace), Terminal (size, cursor, blink), Flutter (hot reload on save), Simulator (30/60 fps, device frame),
  Tools (installed tools, app version, show welcome guide). Stored in `lib/settings.ts` (localStorage).
- **App menu** (`src/main/appUi.ts`): File (Open Project ⌘O, Open File ⇧⌘O — files picked here may be outside the
  project, Open Recent, New Terminal, Save ⌘S, Close Tab ⌘W), Edit, View (Sidebar ⌘B, Panel ⌘J, Simulator ⇧⌘M,
  Browser ⇧⌘B, zoom ⌘= ⌘− ⌘0), Run (Run ⌘R, Stop ⌘., Hot Reload ⌘\, Hot Restart ⇧⌘\, Screenshot ⇧⌘5), Help.
  Menu items reach components through `lib/commands.ts`. Recent projects kept in settings.json.
- **Browser** (`components/Browser/BrowserPanel.tsx`): right column switches Simulator ↔ Browser. `<webview>` in its
  own sandboxed process (no preload/Node, http/https only, new windows → default browser). Address bar
  (localhost:port, hosts, search), back/forward/reload, phone width, page dev tools, open externally.
- **Onboarding** (first launch): welcome → theme → tools check (Flutter/Xcode/idb/git/adb/agents with install hints)
  → open project / recent. **What's new** shows once per version. Tool check reads Flutter's version files (no lock wait).
- e2e runs in its own profile (`<out>/profile`) so tests never change the user's settings.
- e2e: 19/19 (new: onboarding, theme light → midnight → dark verified via CSS variables, browser loads a localhost page).

### Session 10 — Source Control + GitHub, new logo, Black theme (2026-11-10)
- **Source Control** (sidebar ⑂, badge = changed files; `src/main/gitService.ts`, `components/Scm/`):
  Changes (commit box ⌘↵, Commit / Commit all / Commit & Push / Amend; staged + unstaged lists with stage, unstage,
  discard, open), branch with ↑ahead ↓behind, Fetch / Pull (ff-only) / Push (sets upstream).
  Click a file → **diff tab** (Monaco diff, side-by-side or inline, unchanged regions folded): working tree,
  staged, or a commit. **Graph**: history with branch lanes (`lib/graph.ts`), refs, click a commit → its files → diff.
- **GitHub pull requests** via `gh` with the user's own login (no tokens in Flutvio): list (open / merged / closed),
  PR tab with conversation, files changed (`lib/unifiedDiff.ts`), checks; comment, approve, request changes,
  check out, merge (squash / merge / rebase, confirmed), create PR (pushes the branch first).
- **Logo**: Flutter's diagonal bar + a "run" triangle on a blue→violet squircle (`resources/icon.svg|png|icns`,
  `FlutvioAppIcon` / `FlutvioMark`); Dock icon in dev. **Welcome area** rebuilt (icon, project, Start actions with
  shortcuts, recent projects). **Toggles** no longer look pressed: "on" = brighter icon; layout icons fill the
  visible pane. **Black theme** (#000) added.
- Fixes: Dart analyzer no longer stops in dev (a superseded start gave the server two `initialize`s — now each start
  is generation-checked); right column blank with a layout saved by the previous version; diff load into a disposed
  editor; soft theme-aware diff colours.
- Tests: `npm test` 54/54 (+ git 12 incl. read-only gh on flutter/flutter, graph/diff 3). e2e 21/21 incl. change →
  diff → stage → commit → graph. PR write actions (comment/review/merge/create) not exercised against GitHub.
- Not reproduced: one e2e run found the sidebar on Source Control during a build; a trace run showed no stray switch.
- Follow-up: app icon re-rendered with real transparency (AppKit; corners were white). Onboarding's last step is now
  "Get started": Open folder / New project (`flutter create`, name validated) / Clone repository (URL or owner/repo
  via gh; finds pubspec one level down) + recent projects. Browser address bar keeps focus while typing (the page
  finishing its load had stolen it). e2e 21/21.

### Session 11 — terminal-first layout, cmux style (2026-11-10)
- **Terminal is the main pane** (centre, full height). The bottom panel is gone; Console is a tab beside the shells.
  A new project always opens on its shell (it could be left hidden under the Console before).
- **Agent buttons** above the terminal (installed only: Claude Code, OpenCode, Codex, Gemini) + the ＋ menu:
  one click starts the agent in a new tab (coloured dot on the tab). Sessions sidebar still resumes old ones.
- **Changes column** beside the terminal (`components/Scm/ChangesPanel.tsx`, `scm:workingDiff`): every uncommitted
  change incl. new files, GitHub style (+green / −red), refreshed every 2 s; just-changed files are highlighted and
  move to the top; "Open" jumps to the Editor tab. Editor (Monaco) is the second tab of that column. ⌘J toggles it.
  `DiffFileCard` is shared with PR "Files changed".
- Layout key is now `flutvio.layout.v2` (old saved layouts reset once).
- e2e: 22/22 incl. new step "terminal is the main pane; agent edits show live in Changes".
- Limits: on a 1400px window with sidebar + Changes + simulator open the terminal is ~380px wide — hide a column
  (⌘B / ⌘J) or drag the dividers. Projects that aren't git repositories show a hint instead of changes.
  Backup of the source before this session: `FLUTVIO/backup-before-terminal-layout/`.

### Session 12 — terminal-first, cmux style: any agent, side panel, `flutvio` command (2026-11-10)
- **A project opens as terminal + simulator, nothing else.** The left sidebar is gone. Centre = terminal tabs
  (flat strip, accent line under the active tab, ＋ opens a plain terminal, split up to 4).
- **Any agent, no presets:** the fixed Claude/OpenCode/Gemini buttons are removed. A tab is named after what runs in
  it (`main/ptyTitle.ts`: foreground process, scripts under node/bun/python resolved by `ps`): zsh → claude → zsh.
  Known agents get a coloured dot, anything else a neutral one. A bell in a background tab shows an orange dot.
- **Side panel on the right** (`components/SidePanel.tsx`, hidden by default, ⌘B; ⌘J opens it on Changes):
  Files · Changes (live diff) · Git (commit / push / graph / PRs) · Sessions.
- **Sessions redesigned** (`Sidebar/AgentSessions.tsx`): search, agent chips, grouped by day, two-line rows, Resume.
- **Editor** is a centre tab that exists only while files are open (opening a file from Files/Changes/Git selects it).
- **Flutter output left the terminal area:** a Logs drawer under the simulator (one line when closed: last line,
  build progress, error count).
- **`flutvio` command in every terminal** (`main/agentBridge.ts`, `resources/bin/flutvio`; 127.0.0.1 + per-launch
  token): status, screenshot, elements, tap, swipe, type, button, run, stop, reload, restart, logs. Settings › Tools
  can add a short section about it to the project's AGENTS.md (on click only).
- Fix: Escape closes Settings even when the terminal has the keyboard.
- Layout keys: `flutvio.layout.v3`, `flutvio.sizes.v3`.
- Tests: `npm test` + agent bridge 8/8. e2e 25/25 (new: side panel closed on open, tab named after process,
  `flutvio` status/screenshot/reload/elements/tap typed in the terminal, Logs drawer).
- Not checked: Sessions list with real sessions (the sample project has none); tab naming with real agents
  (tested with `sleep`, and by unit tests on command lines); `flutvio` in a packaged build (dev only so far).
- Backup of the source before this session: `FLUTVIO/backup-before-cmux-layout/`.

### Session 13 — optional simulator, terminal keys, shortcuts page, icon tabs (2026-11-10)
- **Simulator is off until asked for** (title-bar phone button / ⇧⌘M; ✕ in its header closes it). Closed = nothing
  mirrored (idb companion stopped). The device menu can **shut the simulator down** (frees its memory).
  Browser and simulator are no longer both kept alive. Logs can open without the simulator (status bar "Logs", ⇧⌘L).
- **Terminal keys** (`lib/shortcuts.ts` → `terminalKey`, iTerm "natural editing" set): hold ⌫ repeats, ⌥⌫ word (^W),
  ⌥⌦, ⌘⌫ line, ⌥←/→, ⌘←/→, ⇧↩ newline; ⌘K clear, ⌘D split, ⌘T, ⌘W, ⌃⇥, ⌘1–9, ⌘A selects terminal text.
  New **Terminal** menu. Key repeat instead of the macOS accent popup (`ApplePressAndHoldEnabled=false`, app's own defaults).
- **Root cause of "can't delete":** `npm run dev` puts `EDITOR=vi` in the environment, the terminal inherited it and
  zsh started in vi mode. Shells now start from a cleaned environment (`shellEnv` in `ptyManager.ts`: no npm_*,
  ELECTRON_*, VITE_*, npm's EDITOR). A user whose own EDITOR is vi/vim still gets zsh's vi mode (their setting).
- **Settings › Shortcuts** (⌘/): every shortcut, grouped and searchable.
- **Side panel tabs are icons** (Files · Changes · Git · Sessions) with tooltips; the open tab's name beside them.
- **Fix:** false "Dart analyzer stopped" / `lsp:start: initialize timed out` — a start replaced by a newer one never
  had its pending request settled; it timed out later and marked the (working) analyzer as stopped.
- Black terminal background in the Dark and Black themes. Layout key `flutvio.layout.v4` (simulator off by default).
- e2e: 27/27 (`FLUTVIO_E2E_ONLY="a,b"` runs only matching steps; `FLUTVIO_PTY_DEBUG=1` logs bytes sent to shells).
  `npm test`: + shortcuts 10/10.
- Not checked: ⌘C copy from the terminal (the test skips it when the clipboard holds non-text data — it did);
  the accent-popup change with a physical keyboard; real agents; Sessions with real data; a packaged build.
- One e2e run failed once in "browser panel loads a page" (a typed character was lost); it passed in 4 other runs.

### Tests
- `npm test` — RTL preprocessor 21/21 + Flutter daemon (fake CLI) 11/11 + worktrees 7/7 + git 12/12 + graph/diff 3/3
- `npm run typecheck` — main/preload **and** renderer. ⚠️ Before this session `tsc --noEmit` at the root checked **nothing** (root tsconfig has `"files": []`), so earlier "no type errors" claims were not real checks. Fixed; the code was clean apart from one expected error.
- RTL Lab regression (`FLUTVIO_RTL_SNAPSHOT`) — still passes, incl. Arabic typing test

### Not yet done / known limits
- Not tested on: physical iPhone (its `flutter devices` entry reports `screenshot: false`), Android, macOS desktop target.
- Screenshot is disabled for devices that don't support it (macOS, physical iPhone).
- No keyboard shortcuts for reload/restart yet (⌘R is taken by Electron's dev reload). Auto reload on save is Phase 2.
- The console shows everything Flutter forwards, including iOS system log noise.

---

### Session 14 — agent monitor, notifications, Flutter tab, toasts, Get started (2026-11-11)
- **Agent tab** (side panel, ⇧⌘A; `main/agentMonitor.ts`): for Claude Code — context % and tokens, model, plan,
  prompts, compactions, "limit reached · resets at", read from Claude Code's own files (`~/.claude/sessions/<pid>.json`,
  the session transcript, `~/.claude.json`); MCP servers and connectors with their real status from `claude mcp list`.
  A small **context meter** sits in the tab strip while Claude runs. Other agents: state only (they publish no usage).
  Not available locally: the *percentage* of the 5-hour / weekly limits — the panel has `/usage`, `/context`, `/mcp` buttons instead.
  Context window is estimated (200K; 1M once a session passes 200K).
- **Notifications**: an agent finishing its turn / ringing the bell, or a command that ran ≥ 20 s ending, while you are
  in another tab or app → dot on the tab, bell with a count in the title bar (list, click goes to the terminal), toast,
  macOS notification (only when the window is in the background) and a Dock badge. "Finished" comes from Claude Code's
  status file; for other agents from the terminal output going quiet (`ActivityMeter`, heuristic).
- **Flutter tab** (⇧⌘F): its own shell with Pub get / Upgrade / Outdated / Clean / Analyze / Test / Doctor / Build ▾ /
  Build runner (when in pubspec) / Add package, a Stop button, and "Run output" (the app's logs, visible without the simulator).
- **Toasts** redesigned: bottom centre, stacked, icon by kind, action button, screenshot preview, pause on hover.
- **Get started** step redesigned (Open / New / Clone, live name check, location row, recent list); steps slide.
- **Fixes found while running real Claude Code inside the app:** the tab was named `2.1.321` (Claude's binary is stored
  under its version) → now `claude`; shells no longer inherit Claude Code session markers when Flutvio is started from a Claude session.
- e2e: 30/30 on a sample project without git (+ toasts, agent finished → bell, Flutter tab pub get, Agent panel; `FLUTVIO_E2E_CLAUDE=1` adds a real
  Claude Code turn: passed, context 26%, Sonnet 5.5, Pro). `npm test`: + agent monitor 12/12.
- Not checked: the macOS notification banner and Dock badge by eye; OpenCode / Codex / Gemini for real (only a stand-in
  agent script); "limit reached" with a live limit (unit-tested from a recorded record); the 1M-window estimate.
- Out of scope by decision: multi-project cards. GitHub push / PRs already exist in the Git tab (via `git` and `gh`).

### Session 15 — open source release (2026-11-11)
- Toast restyled and moved to the bottom left.
- Packaging: `npm run dist` (electron-builder; arm64 dmg + zip; ad-hoc signed in `scripts/after-pack.cjs`; node-pty unpacked from the asar).
- **The installed app was tested** (copied out of the DMG): 17 UI steps pass, including the terminal, `flutvio` command,
  embedded simulator, run + hot reload, Flutter tab and Agent panel — also when started with a Finder-like minimal `PATH`.
  Steps that need dev-only hooks (editor completion, terminal key checks, toasts) were not run on the packaged build.
- Gatekeeper rejects the quarantined app as expected (not notarized); `xattr -dr com.apple.quarantine` clears it.
  The "Open Anyway" dialog path was not clicked through by hand.
- Repository files: README, LICENSE (MIT), CHANGELOG, CONTRIBUTING, `docs/screenshots`.

## Phase 0 — RTL/Bidi Proof of Concept ✅

### Phase 0 Verdict
```
Date tested:    2026-11-09 (macOS 27.0.1, Apple Silicon)
Electron:       45.2.3 (31.7.7 is blocked by macOS XProtect as "malware" on macOS 27)
xterm.js:       @xterm/xterm 5.5 (DOM renderer)
Approach used:  D — xterm + unicode11 + RTL line ordering (createRtlStream) + inline row spans
Result:         PASS ✅ (display + typing/editing Arabic; mouse selection not yet tested)
Decision:       Proceed to Phase 1 with Approach D.
                Drop Approach C — Chromium already applies bidi, so reversing again breaks text.
Screenshots:    flutvio-ide/rtl-results/{A_default,B_unicode11,C_bidi_preprocess,D_rtl_lines,T1–T4}.png
```

| Approach | Result |
|---|---|
| A: default xterm | Arabic joined and readable, but mixed lines read left-to-right |
| B: + unicode11 | Same as A, emoji width handled better |
| C: reverse Arabic text | ❌ letters reversed and disconnected |
| D: B + RTL line ordering | ✅ Arabic-first lines read right-to-left; colors, numbers, punctuation in place; typing/editing works |

**How D works:** a line whose first letter is Arabic is treated as RTL. Text runs are re-ordered right-to-left; Arabic letters are never reversed (Chromium joins them). xterm row spans are set to `display: inline` (`.rtl-inline`) so the browser orders the whole row across color and cursor spans. Lines starting with Latin (prompts, commands, logs) are untouched.

**Known limits:**
- Only lines that arrive complete in one PTY chunk are reordered.
- RTL lines are left-aligned (not pushed to the right edge).
- Lines with cursor-movement escapes (progress bars) are not reordered.
- Arabic letters look slightly spread out (monospace cells).
- Mouse selection inside Arabic text not tested; typing tested with simulated key events.
- The cursor block is slightly shorter than the line (side effect of inline spans).

---

## Session Log

### Session 1 — 2026-11-09
- Project structure created; Phase 0 RTL test component implemented

### Session 2 — 2026-11-09
- macOS 27 blocked Electron 31.7.7 as malware (download hash matched official — XProtect false positive). Upgraded to Electron 45.2.3 + node-pty 1.1.0.
- Fixed PTY bug (StrictMode double-mount); added automated RTL screenshots
- Built Approach D (RTL line ordering) + Arabic typing test; Phase 0 PASS

### Session 3 — 2026-11-09
- Phase 1 built: Flutter service, control bar, terminal + console, typed IPC, settings, bundled fonts
- Declared React 19 in package.json (it was only installed as a peer dependency)
- Fixed the `typecheck` script (it checked nothing before)
- End-to-end test on iPhone 17 Pro Simulator: all exit criteria met
- **Next action:** test on a physical iPhone / Android, then Phase 2 (multi-terminal, worktrees, Monaco, auto reload on save)

---

## Blocked / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| xterm.js RTL broken | ~~HIGH~~ resolved | Approach D |
| macOS XProtect flags Electron builds | MEDIUM | Stay on current Electron; sign + notarize release builds |
| scrcpy Android embedding | MEDIUM | Deferred to Phase 3 |
| `flutter run --machine` protocol changes | LOW | Pin Flutter SDK version; daemon tests use a fake CLI |
