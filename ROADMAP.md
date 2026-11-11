# FLUTVIO — Roadmap

> Updated: 2026-11-11  
> Strategy: **Risk-first** — validate the hardest assumption before building.

---

## Phase 0 · RTL/Bidi Proof of Concept ✅
**Duration:** ~1 week  
**Goal:** Prove that Arabic ↔ English mixed text renders cleanly inside `xterm.js` / `node-pty` within Electron.

### Why first?
This is the **highest-risk technical assumption** in the entire project.  
If xterm.js cannot handle bidirectional text at acceptable quality → the RTL feature must be re-scoped *before* we build anything else around it.

### Tasks
- [x] Create `flutvio-ide/` project scaffold (electron-vite + React + TS)
- [x] Install `xterm`, `xterm-addon-fit`, `node-pty`
- [x] Build `Phase0RTLTest` component: a single terminal pane that runs a shell
- [x] Send Arabic + English mixed commands through the PTY
- [x] Test rendering with: (a) default xterm, (b) `xterm-addon-unicode11`, (c) server-side bidi pre-processing via `bidi-js`
- [x] Document result in `PROGRESS.md` with screenshots

### Exit Criteria (choose one)
| Outcome | Decision |
|---------|----------|
| Arabic renders cleanly ✅ | Proceed to Phase 1 as planned |
| Arabic renders with minor issues ⚠️ | Scope RTL as "best-effort", add disclaimer, proceed |
| Arabic is broken ❌ | Reframe RTL as future roadmap item, pivot Phase 1 focus |

---

## Phase 1 · Foundation + Flutter Daemon MVP ✅ (iOS Simulator verified)
**Duration:** 2–3 weeks  
**Requires:** Phase 0 decision logged in PROGRESS.md

### Tasks
- [x] `src/main/flutterDaemon.ts` — full `flutter run --machine` JSON-RPC wrapper
- [x] `src/main/ptyManager.ts` — single terminal session (no worktrees yet)
- [x] `src/preload/index.ts` — typed `window.flutvio` contextBridge
- [x] `src/renderer/` — Flutter Control Bar (Device Selector, Hot Reload ⚡, Hot Restart 🔄, Screenshot 📸)
- [x] `src/renderer/` — Single terminal pane (xterm.js + node-pty)
- [x] IPC wiring: renderer → preload → main → flutterDaemon

### Exit Criteria
- `flutter run` launches on a selected device from the GUI
- Hot Reload triggers in < 500ms from button press
- Screenshot saves to Desktop

---

## Phase 2 · Multi-Terminal + Git Worktrees + Monaco Editor ✅
**Duration:** 2–3 weeks

### Tasks
- [x] `src/main/worktreeService.ts` — `git worktree add/remove/list` (+ branch menu in the title bar)
- [x] Multi-pane terminal layout (up to 4 panes, plus tabs)
- [x] Monaco editor with Dart grammar + Dart language server (completion, errors, hover, definition, format)
- [x] Auto Hot Reload on `Cmd+S` save (toggle in ⋯ menu)
- [x] Full RTL integration (using Phase 0 findings) — terminal (Approach D), console, sessions, simulator text

---

## Phase 3 · Simulator Embedding
**Duration:** 3–4 weeks  
**Risk level:** HIGH (most technically complex)

### Tasks
- [x] iOS Simulator: mirror of Xcode's simulator (idb_companion H.264 + HID over gRPC, Xcode device frame)
- [ ] Android: `scrcpy` integration via child_process
- [x] Docked/pinned simulator pane beside code + terminal

---

## Phase 3.5 · Agent workspace (terminal first)
- [x] Terminal-first layout, side panel (Files · Changes · Git · Sessions), Logs drawer
- [x] Tabs named after the running agent; `flutvio` command (agent ↔ simulator)
- [ ] Several projects open at once: workspace cards on the left with agent status (cmux style)
- [x] Agent panel (context, limits, MCP servers), notifications, Flutter tab
- [ ] MCP server on top of the agent bridge

---

## Phase 4 · Website + Launch
**Duration:** 1–2 weeks

- [x] Open source on GitHub (MIT), README, first downloadable build (0.1.0, Apple Silicon, not notarized)
- [ ] Landing page with a direct download
- [ ] Apple notarization, universal build, auto-update
- [ ] Demo video + launch

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-11-09 | Phase 0 RTL-first strategy adopted | Highest risk assumption must be validated first |
| 2026-11-09 | Electron 31 → 45.2.3 | macOS 27 XProtect blocks Electron 31.7.7; 31 is also end-of-life |
| 2026-11-09 | RTL = Approach D (unicode11 + RTL line ordering), drop C | Chromium joins Arabic letters itself; we only reorder runs for Arabic-first lines |
