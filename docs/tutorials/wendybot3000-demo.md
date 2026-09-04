---
id: wendybot3000-demo
title: WendyBot3000 Demo
description: >
  A reproducible plan for showing pi-sprite authoring, import, context, recap, and BTW with one custom pet.
index:
  - id: goal
  - id: what-the-demo-shows
  - id: build-the-demo-pet
  - id: record-the-terminal-demo
  - id: optional-live-pi-demo
  - id: release-use
---

# WendyBot3000 demo

## Goal

Use **WendyBot3000** to show the parts of `pi-sprite` that matter for a first release:

- author a pet from a character brief
- package the pet as a normal importable folder
- import and select it with `/pet`
- use `/context`, `/btw`, and `/recap` without turning the sprite into a dashboard

The source lives in `demos/wendybot3000`. The release recording is deterministic. It starts Pi's terminal UI in Ghostty, resumes a scrubbed fixture session, loads a local demo provider, and imports the committed source-pet WendyBot3000 dog sprite. The create-demo-pet script is a fallback smoke generator for the manifest.

## What the demo shows

The demo is a product tour, not the full image-generation workflow. It records the Pi UI while it:

1. Starts from a scrubbed session history that already has release-planning context.
2. Imports and selects the committed WendyBot3000 source-pet.
3. Opens `/context` against the fixture session.
4. Runs `/btw` and `/recap` through a deterministic local Pi provider, not an external API.

[Sprite Authoring Guide](authoring-sprites.md) covers the full authoring workflow. This page covers the release demo.

## Build the demo pet

From the repo root:

```bash
node demos/wendybot3000/create-demo-pet.mjs --out /tmp/wendybot3000-sprite
```

The script writes:

```text
/tmp/wendybot3000-sprite/
├── pet.json
├── idle.png
├── thinking.png
├── working.png
├── success.png
└── error.png
```

It uses the five-image shape recommended for first-time authoring. The images are generated placeholders, but the manifest is real and importable.

Import it in Pi:

```text
/pet import /tmp/wendybot3000-sprite
/pet choose wendybot3000
/pet show
/pet status
```

If you are recording in tmux and native images leave old placements behind, clear and redraw:

```text
/pet clear-native
/pet show
```

## Record the terminal demo

Use the VHS source when you have `vhs`:

```bash
vhs demos/wendybot3000/wendybot3000.tape
```

The tape calls the setup-pi-demo script, attaches to its tmux session, and types real slash commands into Pi. It creates:

```text
demos/wendybot3000/wendybot3000.gif
```

The helper files are part of the demo contract:

| File | Role |
|---|---|
| source-pet directory | Committed WendyBot3000 dog sprite used by the recording |
| fixture-session file | Scrubbed Pi session history for `/context` and `/recap` |
| demo-provider script | Local deterministic model for `/btw` and `/recap` |
| setup-pi-demo script | Builds an isolated Pi/tmux environment and copies the source pet into it |
| create-demo-pet script | Fallback generated pet for local smoke tests |

Without `vhs`, the text tour still shows the pet and commands:

```bash
bash demos/wendybot3000/demo.sh
```

## Optional live Pi demo

For manual debugging, source the setup script and attach to the generated tmux session:

```bash
source demos/wendybot3000/setup-pi-demo.sh
tmux -S "$PI_SPRITE_DEMO_SOCKET" attach-session -t "$PI_SPRITE_DEMO_SESSION"
```

The tape runs these commands one at a time:

```text
/pet import /tmp/pi-sprite-wendybot3000-demo/wendybot3000-sprite
/pet choose wendybot3000
/pet align right
/pet label off
/pet size small
/pet show
/pet status
Fix demo sprite
/context
/btw what should we verify before publishing this package?
/recap
```

The demo does not force ANSI fallback. The setup-pi-demo script uses an isolated `PI_CODING_AGENT_DIR`. It disables user skills, themes, prompt templates, and context files. It hides the tmux status bar so Pi's footer stays at the bottom. It enables tmux passthrough for Kitty and Ghostty placeholder rendering. A recorder without Kitty graphics falls back to ANSI and runs the same slash-command flow.

For native-image release media, use the Ghostty capture helper instead of VHS:

```bash
demos/wendybot3000/capture-ghostty-demo.sh
```

The helper opens a large Ghostty window and prefers a second display. It records with `screencapture` and writes ignored media under `/tmp`. It runs Pi directly, without tmux. It closes only stale `pi-sprite ... demo` Ghostty windows. It waits for Pi to mutate the fixture session. Before each input, it checks that the capture window is still Ghostty's front window. This prevents input in an active tab. Use `PI_SPRITE_CAPTURE_DISPLAY=main` or `PI_SPRITE_CAPTURE_SECONDS=40` to override placement. You can also set the separate X, Y, width, and height capture variables.

For README media, convert the native Ghostty MP4 instead of the VHS GIF. Check an extracted GIF frame before you commit. It must show the `/context` overlay, the WendyBot3000 sprite, and Pi's bottom footer/status line. If the footer touches the edge, add dark bottom padding during conversion. Do not crop the terminal.

The same script can record another installed pet while keeping the same `/context`, `/btw`, `/recap`, and footer-status scenes:

```bash
PI_SPRITE_DEMO_PET_SOURCE="$HOME/.pi/agent/pi-sprite/pets/wumpus" \
  demos/wendybot3000/capture-ghostty-demo.sh

PI_SPRITE_DEMO_PET_SOURCE="$HOME/.pi/agent/pi-sprite/pets/cap" \
  demos/wendybot3000/capture-ghostty-demo.sh
```

## Release use

For the 1.0 release, use this demo in three places:

- README: embed the optimized `docs/assets/wendybot3000-demo.gif` and link to the hosted docs or demo source.
- GitHub release notes: include the short GIF or MP4.
- npm/package gallery: use a hosted image or video if the package listing supports it.

Keep the source in the repo even if you host the GIF elsewhere. It is easier to review and regenerate than binary media.
