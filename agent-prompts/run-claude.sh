#!/bin/zsh
set -u
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$HOME/.vite-plus/bin:$HOME/.local/bin:$PATH"
[[ -f "$HOME/.cargo/env" ]] && . "$HOME/.cargo/env"
cd "$HOME/Project/webtorrent-desktop" || exit 1
mkdir -p logs
echo "=== Claude start $(date -u) ===" | tee -a logs/w1a.log
PROMPT_FILE="$HOME/Project/webtorrent-desktop/agent-prompts/W1A-THEN-W2-CLAUDE.md"

# Unattended print mode (Claude Code)
claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" 2>&1 | tee -a logs/w1a.log
code=${pipestatus[1]:-$?}

echo "=== Claude exit $code $(date -u) ===" | tee -a logs/w1a.log
echo "Claude finished with $code at $(date -u)" >> logs/OVERNIGHT-STATUS.md
# Keep screen alive for inspection after exit
exec zsh
