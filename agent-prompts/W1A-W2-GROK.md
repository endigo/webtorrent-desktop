# Autonomous overnight — finish W1a + W2 on mini-knit (Grok)

Laptop/Orca is OFFLINE. Work fully autonomously with `--always-approve` style autonomy. No Orca orchestration.

## Repo
~/Project/webtorrent-desktop · branch feat/tauri-rewrite
Plan: docs/TAURI_MIGRATION.md · Handoff: docs/HANDOFF-MINI-KNIT.md

```bash
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$HOME/.grok/bin:$PATH"
. ~/.cargo/env
cd ~/Project/webtorrent-desktop
```

## Phase 1 — Finish W1a Rust shell (PRIORITY)

WIP modules already committed (dc5e149):
- src-tauri/src/{prefs,window,dispatch,dialogs}.rs
- plugins in Cargo.toml; capabilities/tauri.conf partially done
- **lib.rs still only has greet** — must wire everything

Finish:
1. Wire lib.rs with all plugins, menus, tray, single-instance, deep-link, autostart, commands from modules
2. Commands: open_torrent, open_files, show_item_in_folder, open_path, move_to_trash, set_window_title, set_progress, toggle_fullscreen, prefs_get, prefs_set (+ any in modules)
3. Menu + tray Show/Quit
4. `cargo tauri build --debug` (DMG fail OK if binary builds)
5. Commit + docs/REPORT-W1a.md

**Do not delete Electron src/.** Another Grok may edit ui/ only — you own src-tauri/ and engine/.

## Phase 2 — W2 engine sidecar

1. engine/ Node webtorrent JSON-lines sidecar
2. Rust spawn + bridge: torrent_add/remove/create/select_files, stream_start/stop; events torrent://progress|metadata|done
3. docs/REPORT-W2.md + build still works

## Phase 3 — W4 player if time

Wire stream URL into player page.

Log to logs/w1a-grok.log and logs/OVERNIGHT-STATUS.md. Small commits. Start Phase 1 now.
