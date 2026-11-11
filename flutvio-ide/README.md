# flutvio-ide

The Flutvio desktop app (Electron + React + TypeScript).

See the [main README](../README.md) for what it is and how to install it, and
[CONTRIBUTING.md](../CONTRIBUTING.md) for development, tests and release builds.

```bash
npm install
npx electron-rebuild -f -w node-pty
npm run dev
```

Environment overrides: `FLUTVIO_FLUTTER` (flutter binary), `FLUTVIO_IDB_COMPANION`, `FLUTVIO_IDB`.
