#!/usr/bin/env bash
set -euo pipefail
scenario="${1:-pet}"
session="pi-sprite-${scenario}-$$"
mkdir -p artifacts/e2e
tmux new-session -d -s "$session" "cd '$PWD' && pi -e ."
sleep 4
case "$scenario" in
  pet) tmux send-keys -t "$session" '/pet show' Enter ;;
  context) tmux send-keys -t "$session" '/context' Enter ;;
  *) echo "unknown scenario: $scenario" >&2; tmux kill-session -t "$session"; exit 2 ;;
esac
sleep 2
tmux capture-pane -p -e -t "$session" > "artifacts/e2e/${scenario}.ansi"
tmux capture-pane -p -t "$session" > "artifacts/e2e/${scenario}.txt"
tmux kill-session -t "$session"
echo "wrote artifacts/e2e/${scenario}.{ansi,txt}"
