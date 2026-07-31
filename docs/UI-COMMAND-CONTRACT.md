# UI ↔ Tauri command contract

Frontend source of truth: `ui/src/lib/tauri.ts`  
Rust shell (W1a): `src-tauri/src/commands.rs`  
Plan map: `docs/TAURI_MIGRATION.md`

All UI invokes use **graceful fallbacks** — browser Vite dev and partially-wired shells stay usable with mock data.

## Shell dialogs (W1a)

| UI helper | Primary command | Returns |
|-----------|-----------------|---------|
| `openTorrent()` | `open_torrent` | `string[]` paths |
| `openFiles()` | `open_files` | `string[]` paths |
| `openFolder()` | `open_directory` | `string[]` paths |

Also registered on Rust: `show_item_in_folder`, `open_path`, `move_to_trash`,
`set_window_title`, `set_progress`, `set_badge`, `toggle_fullscreen`,
`toggle_always_on_top`, `show_window`, `hide_window`, `quit_app`.

## Preferences (W1a / W5)

| UI helper | Primary command | Args |
|-----------|-----------------|------|
| `prefsGet()` | `prefs_get` | — → JSON object |
| `prefsSet(doc)` | `prefs_set` | `{ value }` full document |
| `prefsMerge(patch)` | `prefs_merge` | `{ patch }` shallow merge → document |

Prefs shape (UI defaults in `ui/src/types/prefs.ts`): `downloadPath`,
`openExternalPlayer`, `startup`, `soundNotifications`, etc.

## Engine (W2 / W3) — expected

| UI helper | Primary command | Notes |
|-----------|-----------------|-------|
| `torrentAdd({ id })` | `torrent_add` | magnet / path / infohash |
| `torrentRemove(hash)` | `torrent_remove` | optional `deleteData` |
| `torrentCreate(opts)` | `torrent_create` | paths + metadata |
| `torrentSelectFiles` | `torrent_select_files` | |
| `torrentList()` | `torrent_list` | full list snapshot |
| `streamStart` / `streamStop` | `stream_start` / `stream_stop` | M4 player |

## Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `app://ready` | shell → UI | `()` |
| `app://dispatch` | shell → UI | `{ action, args }` (legacy Electron shape) |
| `torrent://progress` | engine → UI | progress fields + `infoHash` |
| `torrent://metadata` | engine → UI | name / files / `infoHash` |
| `torrent://done` | engine → UI | `infoHash` |

### Dispatch actions handled by UI

| Action | Behavior |
|--------|----------|
| `addTorrent` | `torrent_add` / optimistic queue |
| `onOpen` | add torrent or open create-torrent |
| `showCreateTorrent` | navigate create-torrent with paths |
| `openTorrentAddress` | focus list + magnet hint |
| `backToList` | navigate torrent-list |
| `stateSaveImmediate` | `prefs_merge` |

## Drag-drop

Tauri `onDragDropEvent` → `.torrent`/`magnet:` add; other paths open create-torrent.
