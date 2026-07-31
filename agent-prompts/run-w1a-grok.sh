#!/bin/zsh
set -u
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$HOME/.vite-plus/bin:$HOME/.grok/bin:$PATH"
[[ -f "$HOME/.cargo/env" ]] && . "$HOME/.cargo/env"
cd "$HOME/Project/webtorrent-desktop" || exit 1
mkdir -p logs
echo "=== W1A Grok start $(date -u) ===" | tee -a logs/w1a-grok.log
PROMPT_FILE="$HOME/Project/webtorrent-desktop/agent-prompts/W1A-W2-GROK.md"
grok --always-approve -p "$(cat "$PROMPT_FILE")" 2>&1 | tee -a logs/w1a-grok.log
code=${pipestatus[1]:-$?}
echo "=== W1A Grok exit $code $(date -u) ===" | tee -a logs/w1a-grok.log
echo "W1A-Grok finished with $code at $(date -u)" >> logs/OVERNIGHT-STATUS.md
exec zsh
