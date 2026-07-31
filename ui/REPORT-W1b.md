# W1b — Frontend shell complete

**Commit:** `14afe24` on `feat/tauri-rewrite` (pushed to `mini-knit`)  
**Task:** `task_617207b65f5f` / dispatch `ctx_6d410d17ad5f`  
**Outcome:** succeeded (filesystem + build)

## What shipped

Dark WebTorrent-like M1 frontend shell under `ui/` only:

- **Theme:** `#282828` family, 38px drag header, content offset matching `static/main.css`
- **Views:** `torrent-list`, `player`, `create-torrent`, `preferences` (zustand history nav)
- **Mock list:** Big Buck Bunny, Sintel, Cosmos Laundromat, Tears of Steel
- **Tauri:** `open_torrent` / `open_files` invoke helpers with graceful fallback when commands are missing
- **Stack:** React 19 + TypeScript strict + zustand; no Electron

## How to run

```bash
npm run dev --prefix ui
# production typecheck + bundle:
npm run build --prefix ui
```

## Key files

| Path | Role |
|------|------|
| `ui/src/App.tsx` | Chrome + view router |
| `ui/src/components/Header.tsx` | Back/forward/add/prefs |
| `ui/src/pages/*` | Page shells |
| `ui/src/store/useAppStore.ts` | Minimal state + mock torrents |
| `ui/src/lib/tauri.ts` | Invoke wrappers |
| `ui/src/styles/global.css` | Dark chrome |

## Orchestration note

`orca orchestration send --type worker_done` repeatedly failed with:

```text
legacy_read_only: This retained legacy coordinator could not prove its original process identity.
```

Launch token + dispatch capability hashes match the dispatch record; terminal/pane identity matches assignee. Coordinator was notified via `orca terminal send` as a fallback.

## What's left (later waves)

- Wire real Rust commands when W1a lands (`open_torrent`, `open_files`, dialogs)
- M3 torrent list progress from engine events
- Persist preferences via Tauri store
