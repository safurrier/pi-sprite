# WendyBot3000 demo

This folder contains the source for a deterministic release demo. The primary release capture starts a real Pi TUI in Ghostty, loads `pi-sprite`, imports the committed WendyBot3000 pet from `source-pet/`, and runs `/context`, `/btw`, and `/recap` against a scrubbed fixture session plus a local demo model. The VHS/tmux path remains as a portable fallback.

Render the real Pi GIF when VHS is installed:

```bash
vhs demos/wendybot3000/wendybot3000.tape
```

The tape uses:

- `setup-pi-demo.sh` to create the isolated temp tmux/Pi/session environment
- `fixture-session.jsonl` as the scrubbed conversation history
- `demo-provider.js` as the deterministic local model provider
- `source-pet/` as the committed WendyBot3000 pet used in recordings
- `create-demo-pet.mjs` as a fallback generator for local smoke tests

For a text-only walkthrough of the pet and commands:

```bash
bash demos/wendybot3000/demo.sh
```

The generated GIF is intentionally not required for tests. Keep the tape, fixture, source pet, and helper scripts as the reviewable source of truth.

For native image media, record from a Ghostty/Kitty/WezTerm window instead of VHS. The demo tmux session hides tmux's own status bar so Pi's footer is the bottom status line.

```bash
demos/wendybot3000/capture-ghostty-demo.sh
```

The Ghostty capture script runs Pi directly, without tmux, and prefers a second display when one is connected. It closes stale `pi-sprite ... demo` Ghostty instances, opens a separate Ghostty app instance, waits until Pi mutates the fixture session, and checks that the expected capture window is still Ghostty's front window before sending each demo input. It does not kill arbitrary Ghostty windows. That makes it fail early instead of typing into your active tab. Override placement with `PI_SPRITE_CAPTURE_DISPLAY=main`, `PI_SPRITE_CAPTURE_SECONDS=40`, or explicit `PI_SPRITE_CAPTURE_X/Y/W/H` values.

To record another installed pet with the same demo flow:

```bash
PI_SPRITE_DEMO_PET_SOURCE="$HOME/.pi/agent/pi-sprite/pets/wumpus" \
  demos/wendybot3000/capture-ghostty-demo.sh

PI_SPRITE_DEMO_PET_SOURCE="$HOME/.pi/agent/pi-sprite/pets/cap" \
  demos/wendybot3000/capture-ghostty-demo.sh
```
