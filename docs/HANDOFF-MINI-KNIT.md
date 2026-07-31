# Handoff — work continues on mini-knit

**When:** laptop sleeping; Orca on laptop offline  
**Host:** `user@mini-knit`  
**Repo:** `~/Project/webtorrent-desktop`  
**Branch:** `feat/tauri-rewrite`

## State

| Item | Status |
|------|--------|
| Scaffold Tauri 2 + React UI | done |
| W1b Frontend shell | **done** (14afe24, report ui/REPORT-W1b.md) |
| W1a Rust shell | **done** (4267ea0, docs/REPORT-W1a.md) |
| W2 Engine sidecar | **done** (f1b3cf5, docs/REPORT-W2.md) |
| W3 Torrent list + create | **done** (44549ba, docs/REPORT-W3.md) |
| W4 Player | **partial** (4ea1137 — stream_start → video; polish remaining) |
| W5 Preferences | **done** (c0c092f, docs/REPORT-W5.md) |
| W6 Packaging | not started |

## Latest commits

See `git log --oneline -12`.

## Toolchain on mini-knit

- rustc/cargo via `~/.cargo/env`
- `cargo tauri` installed
- node/npm, claude, grok
- use `screen` for detached agent sessions

## Agent sessions (screen)

```bash
screen -ls
screen -r wt-w1a-grok     # finished W1a+W2; may do W4 polish
screen -r wt-grok         # UI waves W3/W5
```

## Verify build

```bash
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"
. ~/.cargo/env
cd ~/Project/webtorrent-desktop
cd ui && npm i && npm run build && cd ..
cargo tauri build --debug
```

## Important

- Do not delete Electron `src/` until player MVP works
- Prefer small commits; push only to mini-knit remote (GitHub push may need auth)
- worker_done/Orca orchestration is offline while laptop sleeps — agents work autonomously and write REPORT-*.md
