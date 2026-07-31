# Autonomous overnight task — WebTorrent UI waves (mini-knit)

You are Grok on **user@mini-knit**. Laptop/Orca is OFFLINE. Work autonomously. No Orca worker_done.

## Repo
~/Project/webtorrent-desktop on feat/tauri-rewrite
Plan: docs/TAURI_MIGRATION.md
Handoff: docs/HANDOFF-MINI-KNIT.md
W1b UI shell already done (commit 14afe24 area).

## Environment
```bash
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$HOME/.grok/bin:$PATH"
. ~/.cargo/env 2>/dev/null || true
cd ~/Project/webtorrent-desktop
```

## Coordination with Claude
Claude is finishing W1a (src-tauri) then W2 (engine/).
- **Do NOT edit src-tauri/** while Claude is on W1a/W2 unless clearly abandoned for a long time.
- Prefer ui/** and docs/** until docs/REPORT-W2.md exists.

## Phase A — While W1a/W2 in progress
1. Read ui/src and ensure invoke names in ui/src/lib/tauri.ts match intended commands (open_torrent, open_files, prefs_get, prefs_set, etc.).
2. Polish UI shells; keep `npm run build --prefix ui` green.
3. Commit incremental UI improvements.

## Phase B — When docs/REPORT-W2.md exists (or engine commands work)
Implement W3: wire torrent list + create-torrent to real Tauri commands/events.
Commit docs/REPORT-W3.md

## Phase C — W5 Preferences
Wire preferences page to prefs_get/prefs_set, download path dialog, autostart toggle if commands exist.
docs/REPORT-W5.md

## Rules
- TypeScript strict; dark WebTorrent aesthetic
- Small commits; `npm run build --prefix ui` must pass after each phase
- Append status to logs/OVERNIGHT-STATUS.md
- Log to logs/grok.log

Start Phase A immediately.
