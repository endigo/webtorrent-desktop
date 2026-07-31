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
| W1a Rust shell | **IN PROGRESS** — modules prefs/window/dispatch added; lib.rs wiring incomplete |
| W2 Engine sidecar | not started (needs W1a) |
| W3–W5 | not started |

## Latest commits

See `git log --oneline -8`.

## Toolchain on mini-knit

- rustc/cargo via `~/.cargo/env`
- `cargo tauri` installed
- node/npm, claude, grok
- use `screen` for detached agent sessions (tmux may need brew install)

## Agent sessions (screen)

```bash
screen -ls
screen -r wt-w1a-claude   # W1a completion
screen -r wt-w2-claude    # engine after W1a
screen -r wt-coord-grok   # coordinator / UI follow-ups
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
