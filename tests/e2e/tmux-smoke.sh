#!/usr/bin/env bash
set -euo pipefail
scenario="${1:-pet}"
session="pi-sprite-${scenario}-$$"
mkdir -p artifacts/e2e
case "$scenario" in
  pet) slash='/pet show'; expected='pi-sprite' ;;
  render)
    slash='/pet show'
    expected='▀'
    ;;
  context)
    slash='/sprite:context'
    expected='Context Usage'
    ;;
  petdex)
    slash='/pet install e2e-petdex-pet'
    expected='▀'
    ;;
  btw)
    slash='/btw answer with exactly three words'
    expected='BTW side thread'
    ;;
  recap)
    slash='/recap'
    expected='Session Recap'
    ;;
  *) echo "unknown scenario: $scenario" >&2; exit 2 ;;
esac
session_dir="$PWD/artifacts/e2e/session-${scenario}-$$"
mkdir -p "$session_dir"
if [[ "$scenario" == "render" ]]; then
  env_prefix="PI_OFFLINE=1 PI_SPRITE_NATIVE_IMAGES=0 PI_SPRITE_HOME=$(printf %q "$PWD/artifacts/e2e/sprite-home")"
elif [[ "$scenario" == "petdex" ]]; then
  env_prefix="PI_OFFLINE=1 PI_SPRITE_NATIVE_IMAGES=0 PI_SPRITE_HOME=$(printf %q "$PWD/artifacts/e2e/petdex-home")"
else
  env_prefix="PI_OFFLINE=1"
fi
if [[ -n "${PI_SPRITE_PETDEX_MANIFEST_URL:-}" ]]; then
  env_prefix="$env_prefix PI_SPRITE_PETDEX_MANIFEST_URL=$(printf %q "$PI_SPRITE_PETDEX_MANIFEST_URL")"
fi
command="cd $(printf %q "$PWD") && $env_prefix pi -e . --no-session --session-dir $(printf %q "$session_dir")"
tmux new-session -d -s "$session" "$command"
cleanup() { tmux kill-session -t "$session" 2>/dev/null || true; }
trap cleanup EXIT

wait_for() {
  local needle="$1"
  local loops="${2:-60}"
  for _ in $(seq 1 "$loops"); do
    tmux capture-pane -p -e -t "$session" > "artifacts/e2e/${scenario}.ansi" || true
    tmux capture-pane -p -t "$session" > "artifacts/e2e/${scenario}.txt" || true
    if grep -q "$needle" "artifacts/e2e/${scenario}.txt"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if ! wait_for 'INSERT' 50; then
  echo "Pi did not become ready for $scenario" >&2
  exit 1
fi
sleep 2

if [[ "$scenario" == "recap" ]]; then
  tmux send-keys -t "$session" -l 'Say OK in one word.'
  tmux send-keys -t "$session" Enter
  wait_for 'OK' 120 || true
  sleep 1
fi

if [[ "$slash" == *" "* ]]; then
  tmux send-keys -t "$session" -l "${slash%% *}"
  tmux send-keys -t "$session" Tab
  tmux send-keys -t "$session" -l " ${slash#* }"
else
  tmux send-keys -t "$session" -l "$slash"
  tmux send-keys -t "$session" Tab
fi
tmux send-keys -t "$session" Enter
if ! wait_for "$expected" 120; then
  echo "Expected ${scenario} capture to contain: $expected" >&2
  exit 1
fi

echo "wrote artifacts/e2e/${scenario}.{ansi,txt}"
