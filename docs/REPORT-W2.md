# REPORT-W2 — WebTorrent engine sidecar + Rust bridge

**Status:** complete  
**Host:** mini-knit  
**Branch:** `feat/tauri-rewrite`  
**Date:** 2026-07-31  

## What landed

### Node sidecar (`engine/`)

- `engine/index.js` — JSON-lines protocol over stdin/stdout
- `engine/package.json` — depends on `webtorrent@1.9.7` + `network-address`
- `engine/README.md` — protocol docs + smoke test

Methods:

| Method | Role |
|--------|------|
| `ping` | Health / version |
| `torrent_add` | Add magnet / .torrent / info-hash |
| `torrent_remove` | Destroy by infoHash or torrentKey |
| `torrent_create` | Seed files (`client.seed`) |
| `torrent_select_files` | Per-file select/deselect |
| `stream_start` / `stream_stop` | HTTP stream server (`createServer`) |
| `set_global_trackers` | Announce list |

Events emitted to stdout (forwarded by Rust as Tauri events):

- `engine://ready`
- `torrent://progress` (1 Hz when changed)
- `torrent://metadata` / `torrent://ready` / `torrent://done`
- `torrent://parsed` / `torrent://error` / `torrent://server`

### Rust bridge (`src-tauri/src/engine.rs`)

- Spawns `node engine/index.js` (resolves path from resource dir, CARGO_MANIFEST_DIR, cwd, exe)
- Request/response matching by numeric `id` with 120s timeout
- Background stdout reader → `app.emit(event, payload)`
- Warm-start on app setup when engine script is present

### Tauri commands

```
torrent_add, torrent_remove, torrent_create, torrent_select_files,
stream_start, stream_stop, engine_ping
```

## Verification

```bash
# Protocol smoke
printf '%s\n' '{"id":1,"method":"ping","params":{}}' | node engine/index.js
# → engine://ready + {"id":1,"ok":true,"result":{"pong":true,…}}

cargo tauri build --debug
# → binary + WebTorrent.app + DMG OK
```

## Setup note

```bash
cd engine && npm install
```

`engine/node_modules/` is gitignored. The shell logs a clear error if the script is missing.

## Packaging (deferred to W6)

Dev resolves `engine/` next to the repo. Production should copy `engine/index.js` + production `node_modules` (or a bundled node) into resources — not done yet.

## Not in W2

- Poster generation / audio metadata (later polish)
- UI list wiring to these commands (W3)
- Player consuming `stream_start` URL (W4)
