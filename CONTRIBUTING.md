# Contributing to Flutvio

Thanks for your interest. Issues, ideas and pull requests are welcome.

## Setup

Requirements: macOS, Node.js 20+, Xcode command line tools, and a Flutter SDK for anything that runs an app.

```bash
git clone https://github.com/haithemnini/flutvio.git
cd flutvio/flutvio-ide
npm install
npx electron-rebuild -f -w node-pty
npm run dev
```

## Before opening a pull request

```bash
npm run typecheck
npm test
```

Both must pass. If you changed the UI, run it and try the feature — type checks do not prove a feature works.

## End-to-end UI test

Drives the real app against a real Flutter project and a booted iOS Simulator, and writes screenshots and a report:

```bash
FLUTVIO_E2E=./e2e-results \
FLUTVIO_E2E_PROJECT=/absolute/path/to/a/flutter/project \
FLUTVIO_E2E_DEVICE=<simulator udid> \
npm run dev
```

- `FLUTVIO_E2E_ONLY="open project,Flutter tab"` runs only the steps whose names contain one of the parts.
- `FLUTVIO_E2E_CLAUDE=1` adds a real Claude Code turn (uses your signed-in account).
- The test uses its own profile folder, so it never changes your settings.

## Conventions

- **The renderer never uses Node APIs.** Every capability is declared in `src/shared/flutvio-api.ts`, implemented in `src/main/`, and bridged in `src/preload/index.ts`.
- Parsing and logic that can be tested without Electron lives in files with no Electron imports (see `agentBridge.ts`, `agentMonitor.ts`, `ptyTitle.ts`) and has a test in `scripts/`.
- Comments explain *why*, not *what*. Keep them short.
- Nothing is sent off the machine. Features that read an agent's local files read metadata only.

## Building a release

```bash
npm run dist
```

Produces `release/Flutvio-<version>-mac-arm64.dmg` and `.zip`, ad-hoc signed (`scripts/after-pack.cjs`). Notarization is not set up yet.

## Reporting bugs

Please include your macOS version, Flutter version (`flutter --version`), what you did, what you expected and what happened. Screenshots help.
