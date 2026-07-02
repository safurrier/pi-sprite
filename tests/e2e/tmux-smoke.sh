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
  btw-empty)
    slash='/btw'
    expected='side thread'
    ;;
  turn-status)
    slash='/pet status'
    expected='turn-status=on'
    ;;
  petdex)
    slash='/pet install e2e-petdex-pet'
    expected='▀'
    ;;
  btw)
    slash='/btw answer with exactly three words'
    expected='side thread'
    ;;
  btw-no-personality)
    slash='/btw Give a tiny status update in one short sentence.'
    expected='side thread'
    ;;
  btw-personality)
    slash='/btw Give a tiny status update in one short sentence.'
    expected='ZORBLAX'
    ;;
  recap)
    slash='/recap'
    expected='recap'
    ;;
  *) echo "unknown scenario: $scenario" >&2; exit 2 ;;
esac
session_dir="$PWD/artifacts/e2e/session-${scenario}-$$"
mkdir -p "$session_dir"
if [[ "$scenario" == "render" ]]; then
  env_prefix="PI_OFFLINE=1 PI_SPRITE_NATIVE_IMAGES=0 PI_SPRITE_HOME=$(printf %q "$PWD/artifacts/e2e/sprite-home")"
elif [[ "$scenario" == "petdex" ]]; then
  env_prefix="PI_OFFLINE=1 PI_SPRITE_NATIVE_IMAGES=0 PI_SPRITE_HOME=$(printf %q "$PWD/artifacts/e2e/petdex-home")"
elif [[ "$scenario" == "turn-status" ]]; then
  turn_status_home="$PWD/artifacts/e2e/turn-status-home-$session"
  rm -rf "$turn_status_home"
  mkdir -p "$turn_status_home"
  printf '{"turnStatusEnabled":false}\n' > "$turn_status_home/state.json"
  env_prefix="PI_OFFLINE=1 PI_SPRITE_HOME=$(printf %q "$turn_status_home")"
elif [[ "$scenario" == "btw-personality" ]]; then
  personality_home="$PWD/artifacts/e2e/btw-personality-home-$session"
  rm -rf "$personality_home"
  mkdir -p "$personality_home/pets/e2e-personality-pet"
  printf '{"selectedPetId":"e2e-personality-pet","visible":true}\n' > "$personality_home/state.json"
  cat > "$personality_home/pets/e2e-personality-pet/pet.json" <<'JSON'
{"id":"e2e-personality-pet","name":"E2E Personality Pet","personality":"Begin every explicit BTW answer with the exact token ZORBLAX.","sprites":{"idle":"idle.png"}}
JSON
  env_prefix="PI_OFFLINE=1 PI_SPRITE_NATIVE_IMAGES=0 PI_SPRITE_HOME=$(printf %q "$personality_home")"
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
