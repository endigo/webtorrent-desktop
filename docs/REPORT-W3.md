# REPORT-W3 — Torrent list + create-torrent wired to engine

**Status:** complete (UI side)  
**Host:** mini-knit  
**Branch:** `feat/tauri-rewrite`  
**Date:** 2026-07-31  
**Depends on:** W1a shell, W2 engine (`docs/REPORT-W2.md`)

## What landed

The React UI now talks to real Tauri commands and events from the W2 bridge.

### List page

| Action | Backend |
|--------|---------|
| Open `.torrent` | `open_torrent` → `torrent_add` |
| Paste / type magnet | `torrent_add` (`torrent_key`, `torrent_id`, `path?`) |
| Native file drop | Tauri `onDragDropEvent` → add or create |
| Remove | `torrent_remove` |
| Progress | event `torrent://progress` bulk `{ torrents: [...] }` |
| Metadata / ready / done | `torrent://metadata`, `torrent://ready`, `torrent://done` |
| Errors | `torrent://error` → status toast |

### Create torrent

| Action | Backend |
|--------|---------|
| Choose files | `open_files` |
| Choose folder | `open_directory` |
| Create | `torrent_create` (`torrent_key`, `files`, `options`) |
| Menu/dispatch | `showCreateTorrent` / `onOpen` via `app://dispatch` |

### Resilience

- Browser Vite dev still works: missing commands fall back to optimistic mock rows.
- On `engine_ping` / `engine://ready`, sample mock torrents are cleared.
- Mock seed data remains only when the engine is unavailable.

### Key files

| Path | Role |
|------|------|
| `ui/src/lib/tauri.ts` | Invoke + event helpers (snake_case args) |
| `ui/src/store/useAppStore.ts` | Add/create/remove + progress merge |
| `ui/src/pages/TorrentListPage.tsx` | Magnet field, drop zone, list |
| `ui/src/pages/CreateTorrentPage.tsx` | Form → `torrent_create` |
| `ui/src/App.tsx` | Event subscriptions + keyboard shortcuts |
| `docs/UI-COMMAND-CONTRACT.md` | Contract reference |

## Build

```bash
npm run build --prefix ui
```

**Result:** success

## Manual verify (when running Tauri app)

```bash
cd engine && npm install && cd ..
cargo tauri dev
# Open torrent / paste magnet / Create torrent…
```

## Out of scope (later waves)

- Player stream URL (W4)
- Poster gradients from real artwork
- File selection UI (`torrent_select_files`)
EOF