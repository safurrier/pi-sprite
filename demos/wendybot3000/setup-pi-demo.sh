#!/usr/bin/env bash
set -euo pipefail

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "source this script so it can export PI_SPRITE_DEMO_* variables" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
demo_root="${PI_SPRITE_DEMO_ROOT:-/tmp/pi-sprite-wendybot3000-demo}"
socket="$demo_root/tmux.sock"
pet_dir="$demo_root/wendybot3000-sprite"
sprite_home="$demo_root/sprite-home"
agent_dir="$demo_root/agent"
session_dir="$demo_root/sessions"
session_file="$session_dir/wendybot3000-demo.jsonl"
operator_rc="$demo_root/demo-bashrc"

if [[ -S "$socket" ]]; then
  tmux -S "$socket" kill-server 2>/dev/null || true
fi
rm -rf "$demo_root"
mkdir -p "$demo_root" "$sprite_home" "$agent_dir" "$session_dir"

cp -R "$repo_root/demos/wendybot3000/source-pet" "$pet_dir"
sed "s#__PI_SPRITE_DEMO_CWD__#$repo_root#g" \
  "$repo_root/demos/wendybot3000/fixture-session.jsonl" > "$session_file"

cat > "$operator_rc" <<'SH'
export PS1='$ '
clear
SH

shell_quote() {
  printf "%q" "$1"
}

tmux -f /dev/null -S "$socket" new-session -d -s __pi_sprite_demo_setup -n setup "sleep 3600"
tmux -S "$socket" set-option -g default-terminal "screen-256color"
tmux -S "$socket" set-option -ga terminal-overrides ",xterm*:Tc,*256col*:Tc"
tmux -S "$socket" set-option -g status off
tmux -S "$socket" set-option -g extended-keys on
tmux -S "$socket" set-option -g allow-passthrough on
tmux -S "$socket" set-environment -g PI_OFFLINE 1
tmux -S "$socket" set-environment -g PI_CODING_AGENT_DIR "$agent_dir"
tmux -S "$socket" set-environment -g PI_SPRITE_HOME "$sprite_home"

tmux -S "$socket" new-session -d -s pi-sprite-demo -n pi -c "$repo_root" \
  "env BASH_SILENCE_DEPRECATION_WARNING=1 bash --noprofile --rcfile '$operator_rc' -lc 'PI_OFFLINE=1 PI_CODING_AGENT_DIR=$(shell_quote "$agent_dir") PI_SPRITE_HOME=$(shell_quote "$sprite_home") pi --offline --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files -e . -e demos/wendybot3000/demo-provider.js --model pi-sprite-demo/wendybot3000 --session $(shell_quote "$session_file") --session-dir $(shell_quote "$session_dir")'"

tmux -S "$socket" kill-session -t __pi_sprite_demo_setup

export PI_SPRITE_DEMO_ROOT="$demo_root"
export PI_SPRITE_DEMO_SOCKET="$socket"
export PI_SPRITE_DEMO_SESSION="pi-sprite-demo"
export PI_SPRITE_DEMO_PET_DIR="$pet_dir"
export PI_SPRITE_DEMO_SESSION_FILE="$session_file"
