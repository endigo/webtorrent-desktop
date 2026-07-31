# WebTorrent Desktop → Tauri 2 Migration Plan

**Source:** Electron 27 + React 17 + Material-UI 0.20 + WebTorrent 1.9 (~9.4k LOC JS)  
**Target:** Tauri 2 + Rust core + modern React (Vite) frontend  
**Primary build host:** `user@mini-knit` (`~/Project/webtorrent-desktop`, branch `feat/tauri-rewrite`)  
**Git remote:** `https://github.com/endigo/webtorrent-desktop`

## Why a near-full rewrite

| Electron area | Problem under Tauri |
|---|---|
| Main process (`src/main/*`) | Becomes Rust (`src-tauri/`) — menus, tray, dialogs, shell, auto-start, protocol handlers |
| Hidden WebTorrent window | Separate Chromium process → Rust torrent engine **or** sidecar Node process |
| `ipcMain` / `ipcRenderer` | Tauri commands + events |
| `nodeIntegration: true` | Removed; frontend is browser-like only |
| Material-UI 0.20 + React 17 | Must modernize (React 18/19 + current UI kit) |
| Spectron screenshot tests | Replace with Tauri/WebDriver or Playwright webview tests |

## Current architecture (Electron)

```
┌─────────────────────┐     IPC      ┌──────────────────────────┐
│  Main process       │◄────────────►│  Main BrowserWindow      │
│  menus, tray, dock  │              │  React UI (renderer)     │
│  dialogs, shortcuts │              │  pages: list/player/prefs│
└──────────┬──────────┘              └────────────▲─────────────┘
           │ wt-* relay IPC                       │
           ▼                                      │
┌─────────────────────┐                           │
│  Hidden WT window   │── torrent events ─────────┘
│  webtorrent client  │
│  HTTP stream server │
└─────────────────────┘
```

### Key modules to re-home

**Rust / system (was `src/main/`):**
- Window lifecycle, title bar, fullscreen, progress, badge
- Application menu + context menus
- Tray, dock badge/progress, power-save blocker
- File/folder dialogs, open-path, trash, show-in-folder
- Protocol / file association handlers (`.torrent`, magnet)
- Auto-launch on login
- Auto-updater (use `tauri-plugin-updater`)
- External player (VLC) spawn
- Folder watcher (use `notify` crate or plugin)
- Single-instance lock

**Torrent engine (was `src/renderer/webtorrent.js`):**
- Hybrid WebTorrent/BitTorrent client
- Add/remove/create torrent, file selection, progress
- Local HTTP server for media streaming
- Poster generation, audio metadata
- Global trackers

**Frontend (was `src/renderer/`):**
- Pages: torrent list, player, create torrent, preferences, about
- Controllers: torrent-list, torrent, playback, media, subtitles, prefs, cast, update
- State: `state.saved` JSON config + ephemeral play state
- Cast: Chromecast / AirPlay / DLNA (phase 2)

## Target architecture (Tauri 2)

```
┌────────────────────────────────────────────────────────────┐
│  Tauri shell (Rust)                                        │
│  - window/menu/tray/dialog/fs/shell plugins                │
│  - commands: torrent_*, prefs_*, system_*                  │
│  - events: torrent://progress, torrent://metadata, ...     │
│  - optional: node-webtorrent sidecar OR pure Rust engine   │
└─────────────────────────────┬──────────────────────────────┘
                              │ invoke / listen
                              ▼
┌────────────────────────────────────────────────────────────┐
│  Webview frontend (Vite + React 19 + TypeScript)           │
│  - torrent list / player / create / preferences            │
│  - media element points at local stream URL from engine    │
└────────────────────────────────────────────────────────────┘
```

### Torrent engine decision (default for v1)

**Sidecar Node WebTorrent process** (pragmatic path):

- Keeps hybrid WebTorrent protocol compatibility with less risk
- Rust spawns `webtorrent-engine` Node script; JSON-RPC or stdin/stdout protocol
- Later swap for pure Rust (`librqbit` / `lava_torrent` + custom) without UI rewrite

Alternative pure-Rust is phase 3 if sidecar proves fragile.

### Frontend stack

- Vite + React 19 + TypeScript
- Lightweight styling (CSS modules or Tailwind) — avoid Material-UI 0.x
- Zustand or similar for UI state; persisted prefs via Tauri store plugin
- Keep visual language close to current dark WebTorrent UI

## Milestone DAG

### M0 — Scaffold (blocking)
- Tauri 2 project beside legacy Electron sources
- `src-tauri/` + `ui/` (Vite React TS)
- Dev scripts: `npm run tauri dev`, CI build on mini-knit
- Doc: this file + command surface map

### M1 — Shell parity
- Window, menu, tray, dialogs, open file/folder, drag-drop
- Config path + prefs load/save
- Single instance, deep links (`magnet:`, `.torrent`)

### M2 — Torrent engine sidecar
- Node sidecar with WebTorrent API covering wt-* surface
- Rust bridge commands + events
- Add magnet/file, list, progress, remove, file selection

### M3 — Torrent list UI
- Port list page + create-torrent flow
- Poster, progress bars, start/stop/delete

### M4 — Player
- Stream URL from engine → `<video>` / `<audio>`
- Playback controls, subtitles (.vtt), audio tracks
- Fullscreen, keyboard shortcuts, power-save

### M5 — Preferences & OS integration
- Download path, startup, file handlers, external player
- Folder watcher, sounds (optional)

### M6 — Packaging
- macOS arm64 (mini-knit), notarization hooks later
- Drop Electron packaging scripts

### Later / optional
- Chromecast/AirPlay/DLNA cast
- Windows/Linux packaging
- Telemetry/crash reporter parity

## IPC → Tauri command map (core)

| Electron | Tauri |
|---|---|
| `wt-start-torrenting` | `torrent_add` |
| `wt-stop-torrenting` | `torrent_remove` |
| `wt-create-torrent` | `torrent_create` |
| `wt-select-files` | `torrent_select_files` |
| `wt-start-server` / `wt-stop-server` | `stream_start` / `stream_stop` |
| `wt-progress` (event) | event `torrent://progress` |
| `wt-metadata` / `wt-done` | events `torrent://metadata`, `torrent://done` |
| `openTorrentFile` / `openFiles` | dialog plugin + `torrent_add` |
| `setTitle` / `setProgress` / `setBadge` | window/app APIs |
| `toggleFullScreen` | window plugin |
| `setStartup` | autostart plugin |
| `moveItemToTrash` / `showItemInFolder` | shell/fs plugins |

## Directory layout (target)

```
webtorrent-desktop/
  docs/TAURI_MIGRATION.md          # this file
  legacy/                          # optional: move electron src later
  src/                             # keep electron temporarily for reference
  ui/                              # NEW Vite React TS frontend
  src-tauri/                       # NEW Rust + Tauri
  engine/                          # NEW Node WebTorrent sidecar
  package.json                     # workspace scripts for tauri
```

## Working agreements for agents

1. **Primary checkout:** `user@mini-knit:~/Project/webtorrent-desktop` on `feat/tauri-rewrite`
2. **Do not delete Electron sources** until M4 player works end-to-end
3. Prefer small commits; keep `docs/TAURI_MIGRATION.md` updated with decisions
4. After each milestone: `cargo tauri build` (or `dev`) must succeed on mini-knit
5. Use TypeScript strict mode for new UI; clippy-clean Rust
6. Coordinate file ownership: never two agents edit the same path in one wave

## Wave ownership (orchestration)

| Wave | Owner agent | Scope |
|---|---|---|
| W0 | Claude | Scaffold Tauri 2 + Vite React TS + migration doc commit |
| W1a | Claude | Rust shell: window, menu, tray, dialogs, plugins |
| W1b | Grok | Frontend shell: app chrome, routing, theme, empty pages |
| W2 | Claude | Node sidecar + Rust bridge for torrent core |
| W3 | Grok | Torrent list + create torrent UI wired to commands |
| W4 | Claude | Player + stream server integration |
| W5 | Grok | Preferences + OS integration polish |
| W6 | Claude | Packaging scripts + README for Tauri |

## Success criteria (MVP)

- Open app on macOS arm64 (mini-knit)
- Add magnet or `.torrent`, see progress
- Play video/audio via local stream
- Remove torrent; set download path in prefs
- No Electron process required
