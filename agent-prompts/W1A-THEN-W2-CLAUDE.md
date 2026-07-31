# Autonomous overnight task — WebTorrent Desktop → Tauri (mini-knit)

You are Claude Code on **user@mini-knit**. The laptop/Orca coordinator is OFFLINE (sleeping). Work fully autonomously. Do NOT wait for Orca worker_done or orchestration.

## Repo
- Path: ~/Project/webtorrent-desktop
- Branch: feat/tauri-rewrite
- Plan: docs/TAURI_MIGRATION.md
- Handoff: docs/HANDOFF-MINI-KNIT.md

## Environment
```bash
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"
. ~/.cargo/env
cd ~/Project/webtorrent-desktop
```

## Phase 1 — Finish W1a (Rust shell OS integration) — DO THIS FIRST

WIP already committed: modules exist under src-tauri/src/:
- prefs.rs, window.rs, dispatch.rs, dialogs.rs
- Cargo.toml has plugins (dialog, fs, shell, store, notification, single-instance, deep-link, autostart, trash)
- capabilities/default.json and tauri.conf.json partially updated
- **lib.rs still only has greet** — NOT wired to new modules

### Required to finish W1a
1. Wire lib.rs: register all plugins, menus, tray, single-instance, deep-link, autostart; export all commands from modules.
2. Commands needed: open_torrent, open_files, show_item_in_folder, open_path, move_to_trash, set_window_title, set_progress, toggle_fullscreen, prefs_get, prefs_set, and any others defined in the module files.
3. App menu + system tray (Show/Quit).
4. Single-instance + magnet/.torrent handling (best effort).
5. Fix compile errors; keep Electron src/ untouched; only touch ui/ if invoke names must match ui/src/lib/tauri.ts.
6. Build: `cargo tauri build --debug` (DMG bundle failure is OK if binary/app builds).
7. Commit + write docs/REPORT-W1a.md
8. Log: append to logs/w1a.log and logs/OVERNIGHT-STATUS.md

## Phase 2 — W2 Node WebTorrent sidecar + Rust bridge (after W1a builds)

1. Implement engine/ Node sidecar (JSON lines on stdio) using webtorrent: add/remove/list/progress/metadata/stream URL.
2. Rust spawns sidecar, bridges commands/events: torrent_add, torrent_remove, torrent_create, torrent_select_files, stream_start/stop; events torrent://progress, torrent://metadata, torrent://done.
3. npm install in engine/; commit docs/REPORT-W2.md; verify build still works.

## Phase 3 — If time remains: W4 player stream integration
Wire stream URL into player page or document CLI test path.

## Rules
- Small commits with clear messages
- Never delete Electron sources
- Prefer working binary over perfect polish
- When done, write logs/OVERNIGHT-STATUS.md with commits and next steps

Start Phase 1 immediately.
