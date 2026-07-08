#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if ! command -v swift >/dev/null 2>&1; then
  echo "swift is required to detect macOS displays" >&2
  exit 127
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to convert the recording to mp4" >&2
  exit 127
fi

export TERM_PROGRAM=ghostty
export TERMINAL_EMULATOR=ghostty
export GHOSTTY_RESOURCES_DIR="${GHOSTTY_RESOURCES_DIR:-/Applications/Ghostty.app/Contents/Resources}"

source_pet="${PI_SPRITE_DEMO_PET_SOURCE:-$repo_root/demos/wendybot3000/source-pet}"
if [[ ! -f "$source_pet/pet.json" ]]; then
  echo "PI_SPRITE_DEMO_PET_SOURCE must point at a pi-sprite pet directory with pet.json: $source_pet" >&2
  exit 2
fi
pet_id="${PI_SPRITE_DEMO_PET_ID:-$(node -e 'const fs=require("fs"); const pet=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(pet.id);' "$source_pet/pet.json")}"
pet_label="${PI_SPRITE_DEMO_PET_LABEL:-$(node -e 'const fs=require("fs"); const pet=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(pet.name || pet.id);' "$source_pet/pet.json")}"

safe_pet_id="${pet_id//[^A-Za-z0-9_.-]/-}"
demo_root="${PI_SPRITE_DEMO_ROOT:-/tmp/pi-sprite-${safe_pet_id}-ghostty-demo}"
pet_dir="$demo_root/${safe_pet_id}-sprite"
sprite_home="$demo_root/sprite-home"
agent_dir="$demo_root/agent"
session_dir="$demo_root/sessions"
session_file="$session_dir/${safe_pet_id}-demo.jsonl"
run_script="$demo_root/run-pi-demo.sh"
pi_bin="${PI_BIN:-$(command -v pi)}"

rm -rf "$demo_root"
mkdir -p "$pet_dir" "$sprite_home" "$agent_dir" "$session_dir"
cp -R "$source_pet/." "$pet_dir/"
sed "s#__PI_SPRITE_DEMO_CWD__#$repo_root#g" \
  "$repo_root/demos/wendybot3000/fixture-session.jsonl" > "$session_file"
initial_session_lines="$(wc -l < "$session_file" | tr -d ' ')"

cat > "$run_script" <<SH
#!/usr/bin/env bash
set -euo pipefail
cd "$repo_root"
export TERM_PROGRAM=ghostty
export TERMINAL_EMULATOR=ghostty
export GHOSTTY_RESOURCES_DIR="$GHOSTTY_RESOURCES_DIR"
export PI_OFFLINE=1
export PI_CODING_AGENT_DIR="$agent_dir"
export PI_SPRITE_HOME="$sprite_home"
exec "$pi_bin" --offline --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files \
  -e . \
  -e demos/wendybot3000/demo-provider.js \
  --model pi-sprite-demo/wendybot3000 \
  --session "$session_file" \
  --session-dir "$session_dir"
SH
chmod +x "$run_script"

# Prefer a second display when present. Override with:
#   PI_SPRITE_CAPTURE_DISPLAY=main|secondary
#   PI_SPRITE_CAPTURE_X=... PI_SPRITE_CAPTURE_Y=... PI_SPRITE_CAPTURE_W=... PI_SPRITE_CAPTURE_H=...
display_choice="${PI_SPRITE_CAPTURE_DISPLAY:-secondary}"
display_rect="$(swift - "$display_choice" <<'SWIFT'
import AppKit
let choice = CommandLine.arguments.dropFirst().first ?? "secondary"
let screens = NSScreen.screens
let selected: NSScreen
if choice == "main" {
  selected = NSScreen.main ?? screens[0]
} else if screens.count > 1 {
  selected = screens.first(where: { $0 != NSScreen.main }) ?? screens[0]
} else {
  selected = screens[0]
}
let frame = selected.visibleFrame
let margin: CGFloat = 40
let x = Int(frame.minX + margin)
let y = Int(frame.minY + margin)
let w = Int(max(900, frame.width - margin * 2))
let h = Int(max(700, frame.height - margin * 2))
print("\(x) \(y) \(w) \(h) \(screens.count)")
SWIFT
)"
read -r detected_x detected_y detected_w detected_h detected_count <<<"$display_rect"

x="${PI_SPRITE_CAPTURE_X:-$detected_x}"
y="${PI_SPRITE_CAPTURE_Y:-$detected_y}"
w="${PI_SPRITE_CAPTURE_W:-$detected_w}"
h="${PI_SPRITE_CAPTURE_H:-$detected_h}"
duration="${PI_SPRITE_CAPTURE_SECONDS:-40}"
out="${PI_SPRITE_CAPTURE_MOV:-/tmp/pi-sprite-${safe_pet_id}-ghostty.mov}"
mp4="${PI_SPRITE_CAPTURE_MP4:-/tmp/pi-sprite-${safe_pet_id}-ghostty.mp4}"
frame="${PI_SPRITE_CAPTURE_FRAME:-/tmp/pi-sprite-${safe_pet_id}-ghostty-frame.png}"

# This capture script can close stale pi-sprite demo Ghostty instances first;
# set PI_SPRITE_CAPTURE_KEEP_GHOSTTY=1 if you want to manage them manually.
# It intentionally does not kill arbitrary Ghostty windows.
if [[ "${PI_SPRITE_CAPTURE_KEEP_GHOSTTY:-0}" != "1" ]]; then
  RTK_DISABLED=1 pkill -f '/Applications/Ghostty.app/Contents/MacOS/ghostty .*--title=pi-sprite .* demo' 2>/dev/null || true
  sleep 1
fi
open -na Ghostty.app --args \
  --title="pi-sprite ${pet_label} demo" \
  --font-family=Menlo \
  --font-size="${PI_SPRITE_CAPTURE_FONT_SIZE:-16}" \
  --window-padding-x=8 \
  --window-padding-y=8 \
  --window-save-state=never

osascript - "$run_script" "$x" "$y" "$w" "$h" <<'OSA'
on run argv
  set runScript to item 1 of argv
  set x to item 2 of argv as integer
  set y to item 3 of argv as integer
  set w to item 4 of argv as integer
  set h to item 5 of argv as integer
  tell application "Ghostty" to activate
  delay 1.0
  tell application "System Events"
    tell process "Ghostty"
      set position of front window to {x, y}
      set size of front window to {w, h}
      set the clipboard to runScript
      keystroke "v" using command down
      key code 36
    end tell
  end tell
end run
OSA

abs_diff() {
  local a="$1"
  local b="$2"
  local diff=$((a - b))
  if ((diff < 0)); then diff=$((-diff)); fi
  printf '%s' "$diff"
}

assert_capture_window_front() {
  local rect
  rect="$(osascript <<'OSA'
tell application "System Events"
  tell process "Ghostty"
    set p to position of front window
    set s to size of front window
    return ((item 1 of p) as text) & "," & ((item 2 of p) as text) & "," & ((item 1 of s) as text) & "," & ((item 2 of s) as text)
  end tell
end tell
OSA
)"
  IFS=',' read -r actual_x actual_y actual_w actual_h <<<"$rect"
  local tolerance=40
  if (( $(abs_diff "$actual_x" "$x") > tolerance || $(abs_diff "$actual_y" "$y") > tolerance || $(abs_diff "$actual_w" "$w") > tolerance || $(abs_diff "$actual_h" "$h") > tolerance )); then
    echo "Ghostty front window is not the demo capture window." >&2
    echo "Expected approximately: ${x},${y},${w},${h}; got: $rect" >&2
    echo "Aborting before sending demo input, so we do not type into your active Ghostty tab." >&2
    exit 4
  fi
}

assert_demo_ready() {
  assert_capture_window_front
}

wait_for_pi_session_append() {
  for _ in {1..120}; do
    local current_lines
    current_lines="$(wc -l < "$session_file" | tr -d ' ')"
    if (( current_lines > initial_session_lines )); then
      return 0
    fi
    sleep 0.25
  done
  echo "Pi did not appear to load: session file was not updated after launch." >&2
  echo "Aborting before sending demo input." >&2
  exit 5
}

sleep 4
assert_demo_ready
wait_for_pi_session_append

rm -f "$out" "$mp4" "$frame"
echo "Recording direct Ghostty demo: pet=$pet_id displays=$detected_count rect=${x},${y},${w},${h} duration=${duration}s"
screencapture -v -V "$duration" -R"${x},${y},${w},${h}" "$out" &
rec_pid=$!
sleep 2

send_text() {
  assert_demo_ready
  osascript - "$1" <<'OSA'
on run argv
  tell application "Ghostty" to activate
  tell application "System Events" to tell process "Ghostty"
    key code 32 using control down -- ctrl-u clears any partially typed input first.
    set the clipboard to (item 1 of argv)
    keystroke "v" using command down
    key code 36
  end tell
end run
OSA
}
press_escape() {
  assert_demo_ready
  osascript <<'OSA'
tell application "Ghostty" to activate
tell application "System Events" to tell process "Ghostty" to key code 53
OSA
}

send_text "/pet import $pet_dir"; sleep 1.6
send_text "/pet choose $pet_id"; sleep 1.2
send_text "/pet align right"; sleep 0.9
send_text "/pet label off"; sleep 0.9
send_text "/pet size small"; sleep 0.9
send_text "/pet show"; sleep 1.3
send_text "/pet status"; sleep 1.8
send_text "Look at the footer status line"; sleep 5.5
send_text "/context"; sleep 4.2
press_escape; sleep 0.9
send_text "/btw what should we verify before publishing this package?"; sleep 5.2
press_escape; sleep 0.9
send_text "/recap"; sleep 5.2
press_escape; sleep 1.0

wait "$rec_pid"
# Stop only the Pi process in this Ghostty tab. No tmux is involved.
osascript <<'OSA'
tell application "Ghostty" to activate
tell application "System Events" to tell process "Ghostty" to key code 8 using control down
OSA

ffmpeg -hide_banner -loglevel error -y -i "$out" \
  -vf "scale=1800:-2:flags=lanczos" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$mp4"
ffmpeg -hide_banner -loglevel error -y -ss 14 -i "$out" -frames:v 1 "$frame"

printf 'pet: %s (%s)\n' "$pet_label" "$pet_id"
ls -lh "$out" "$mp4" "$frame"
