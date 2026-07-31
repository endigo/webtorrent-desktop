#!/bin/zsh
set -u
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$HOME/.vite-plus/bin:$HOME/.grok/bin:$PATH"
[[ -f "$HOME/.cargo/env" ]] && . "$HOME/.cargo/env"
cd "$HOME/Project/webtorrent-desktop" || exit 1
mkdir -p logs
echo "=== Grok start $(date -u) ===" | tee -a logs/grok.log
PROMPT_FILE="$HOME/Project/webtorrent-desktop/agent-prompts/W3-W5-GROK.md"

# Try print mode; fall back to positional prompt
if grok -p "$(cat "$PROMPT_FILE")" 2>&1 | tee -a logs/grok.log; then
  code=0
else
  grok "$(cat "$PROMPT_FILE")" 2>&1 | tee -a logs/grok.log
  code=$?
fi

echo "=== Grok exit $code $(date -u) ===" | tee -a logs/grok.log
echo "Grok finished with $code at $(date -u)" >> logs/OVERNIGHT-STATUS.md
exec zsh
