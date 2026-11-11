# Changelog

## 0.1.0 — 2026-11-11 · first public preview

The first downloadable build (macOS, Apple Silicon), signed with a Developer ID and notarized by Apple.

### Workspace
- Terminal-first layout: terminals fill the window; simulator, side panel and editor open on demand.
- Terminal tabs, split panes (up to 4), tabs named after the running program, Mac editing keys, right-to-left (Arabic) rendering.
- Side panel: Files · Changes (live diffs) · Git · Sessions · Agent.
- Five themes, interface scale, searchable shortcut list, welcome guide.

### Agents
- `flutvio` command in every terminal: status, screenshot, elements, tap, swipe, type, button, run, stop, reload, restart, logs.
- Agent panel for Claude Code: context usage, model, plan, limit reached / reset time, MCP servers and connectors.
- Notifications when an agent finishes or needs attention in the background (tab dot, bell, toast, macOS notification, Dock badge).
- Browse and resume Claude Code, OpenCode, Codex and Gemini sessions.

### Flutter
- Run / stop / hot reload / hot restart, hot reload on save, device picker, screenshots.
- Embedded iOS Simulator (idb_companion: H.264 video, touch, keyboard, hardware buttons, rotation).
- Flutter tab: pub get / upgrade / outdated / clean / analyze / test / doctor / builds / add package, and the app's output.

### Code
- Monaco editor with the Dart language server (completion, diagnostics, hover, definition, format on save).
- Git: stage, commit, push, pull, branches, history graph, worktrees; GitHub pull requests through `gh`.

### Known limitations
See "Status and limitations" in the README.
