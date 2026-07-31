# W1b — Frontend shell complete

**Commit:** `14afe24` on `feat/tauri-rewrite` (pushed to `mini-knit`)
**Task:** `task_617207b65f5f` / dispatch `ctx_6d410d17ad5f`
**Outcome:** succeeded (filesystem + build); orchestration `worker_done` blocked by runtime `legacy_read_only`

## What shipped

Dark WebTorrent-like M1 frontend shell under `ui/` only:

- **Theme:** `#282828` family, 38px drag header, content offset matching `static/main.css`
- **Views:** `torrent-list`, `player`, `create-torrent`, `preferences` (zustand history nav)
- **Mock list:** BBB, Sintel, Cosmos, Tears of Steel with status/progress cards
- **Tauri:** `open_torrent` / `open_files` invoke helpers with graceful fallback when commands missing
- **Stack:** React 19 + TS strict + zustand; no Electron

## How to run

```bash
npm run dev --prefix ui
# or production check:
npm run build --prefix ui
```

## Key files

- `ui/src/App.tsx` — chrome + view router
- `ui/src/components/Header.tsx` — back/forward/add/prefs
- `ui/src/pages/*` — page shells
- `ui/src/store/useAppStore.ts` — minimal state + mock torrents
- `ui/src/lib/tauri.ts` — invoke wrappers
- `ui/src/styles/global.css` — dark chrome

## What's left

- Wire real Rust commands when W1a lands (`open_torrent`, `open_files`, dialogs)
- M3 torrent list progress from engine events
- Persist preferences via Tauri store
