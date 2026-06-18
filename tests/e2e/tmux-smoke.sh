#!/usr/bin/env bash
set -euo pipefail
scenario="${1:-pet}"
session="pi-sprite-${scenario}-$$"
mkdir -p artifacts/e2e
case "$scenario" in
  pet)
    env_prefix="PI_OFFLINE=1"
    command_arg=""
    ;;
  render)
    env_prefix="PI_OFFLINE=1 PI_SPRITE_HOME=$(printf %q "$PWD/artifacts/e2e/sprite-home")"
    command_arg=""
    ;;
  context)
    env_prefix="PI_OFFLINE=1"
    command_arg="$(printf %q "/context")"
    ;;
  *) echo "unknown scenario: $scenario" >&2; exit 2 ;;
esac
session_dir="$PWD/artifacts/e2e/session-${scenario}-$$"
mkdir -p "$session_dir"
command="cd $(printf %q "$PWD") && $env_prefix pi -e . --no-session --session-dir $(printf %q "$session_dir") $command_arg"
tmux new-session -d -s "$session" "$command"
sleep 12
tmux capture-pane -p -e -t "$session" > "artifacts/e2e/${scenario}.ansi"
tmux capture-pane -p -t "$session" > "artifacts/e2e/${scenario}.txt"
tmux kill-session -t "$session" 2>/dev/null || true
echo "wrote artifacts/e2e/${scenario}.{ansi,txt}"
