# rotmg-desktop (Electron + Vite + React starter)

Quick scaffold that runs a demo packet stream and exposes a small IPC API to the renderer.

Run locally (install deps from inside `desktop`):

```bash
cd desktop
npm install
# Dev (starts Vite and Electron together)
npm run dev:electron
```

Build and package:

```bash
cd desktop
npm install
npm run dist
```

Notes:
- The Electron main process is in `main/index.js` and exposes `tracker:start`, `tracker:stop`, and `tracker:status` handlers.
- `main/preload.js` exposes `window.trackerAPI` in the renderer.
- To integrate your existing tracker code, require your Node modules from `main/index.js` (see commented example).
