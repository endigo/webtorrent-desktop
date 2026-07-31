# REPORT-W1a — Rust shell (window, menu, tray, plugins)

**Status:** complete  
**Host:** mini-knit  
**Branch:** `feat/tauri-rewrite`  
**Date:** 2026-07-31  

## What landed

Wired the incomplete W1a modules (`prefs`, `window`, `dispatch`, `dialogs`) into a full Tauri 2 shell:

| Area | Implementation |
|------|----------------|
| Plugins | opener, dialog, fs, shell, notification, store, single-instance (+ deep-link), deep-link, autostart |
| Menu | File / Edit / View / Playback / Transfers / Help (+ macOS App + Window) |
| Tray | Show/Hide + Quit (Windows/Linux; macOS dock-only, matches Electron) |
| Prefs | `config.json` under app config dir; atomic write; get/set/merge |
| Window | show/hide (close hides), title, progress bar, badge, fullscreen, always-on-top |
| Deep links | `magnet:` scheme + `.torrent` file association; argv + `on_open_url` |
| Single instance | Second launch focuses main window and processes argv |
| UI dispatch | `app://dispatch` event with `{ action, args }` (Electron parity) |

### New modules

- `src-tauri/src/commands.rs` — invoke surface for the frontend
- `src-tauri/src/menu.rs` — application menu + check-item state
- `src-tauri/src/tray.rs` — system tray
- `src-tauri/src/lib.rs` — full wiring (replaces greet-only scaffold)

### Commands registered

```
open_torrent, open_files, open_directory,
show_item_in_folder, open_path, move_to_trash,
set_window_title, set_progress, set_badge,
toggle_fullscreen, toggle_always_on_top,
show_window, hide_window, quit_app,
prefs_get, prefs_set, prefs_merge, prefs_path
```

## Build verification

```bash
cargo tauri build --debug
```

**Result:** success

- Binary: `src-tauri/target/debug/webtorrent_desktop`
- Bundle: `src-tauri/target/debug/bundle/macos/WebTorrent.app`
- DMG: `src-tauri/target/debug/bundle/dmg/WebTorrent_0.25.0_aarch64.dmg`

Warnings only: a few intentional unused helpers (`pick_save_path`, `spawn_open_files`, `is_full_screen`) kept for W2/W5.

## Behaviour notes

1. **Close button hides**, does not quit (Electron parity — torrent engine will keep running once W2 lands).
2. **Quit** via menu / tray / `quit_app` dispatches `stateSaveImmediate`, waits 400ms, then exits.
3. **Tray** is Linux/Windows only; macOS uses the dock (Electron parity).
4. **Playback menu items** start disabled; UI will enable them once the player ships (W4).

## Not in W1a (deferred)

- Node WebTorrent sidecar (W2)
- Torrent list / player UI wiring (W3/W4)
- Folder watcher, external player, auto-updater (W5/W6)

## Electron sources

Left intact under `src/`. No deletions.
