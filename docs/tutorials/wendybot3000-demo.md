---
id: wendybot3000-demo
title: WendyBot3000 Demo
description: >
  A reproducible demo plan for showing pi-sprite authoring, import, context, recap, and BTW with one custom pet.
index:
  - id: goal
  - id: what-the-demo-shows
  - id: build-the-demo-pet
  - id: record-the-terminal-demo
  - id: optional-live-pi-demo
  - id: release-use
---

# WendyBot3000 Demo

## Goal

Use one memorable pet, **WendyBot3000**, to show the parts of `pi-sprite` that matter for a first release:

- author a pet from a character brief
- package the pet as a normal importable folder
- import and select it with `/pet`
- use `/context`, `/btw`, and `/recap` without turning the sprite into a dashboard

The demo source lives under `demos/wendybot3000/`. It is intentionally deterministic: the release recording starts a real Pi TUI in Ghostty, resumes a scrubbed fixture session, loads a local demo model provider, and imports the committed `source-pet/` WendyBot3000 dog sprite. `create-demo-pet.mjs` remains as a fallback smoke generator for the manifest shape.

## What the Demo Shows

The demo is a product tour, not the full image-generation workflow. It records the actual Pi UI while it:

1. Starts from a scrubbed session history that already has release-planning context.
2. Imports and selects the committed WendyBot3000 `source-pet/` pet.
3. Opens `/context` against the fixture session.
4. Runs `/btw` and `/recap` through a deterministic local Pi provider, not an external API.

The full authoring workflow is still covered in [Sprite Authoring Guide](authoring-sprites.md). This page is for the release demo artifact.

## Build the Demo Pet

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

It uses the same expanded five-image shape recommended for first-time authoring. The images are simple generated placeholders, but the manifest is real and importable.

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

## Record the Terminal Demo

Use the VHS source when `vhs` is installed:

```bash
vhs demos/wendybot3000/wendybot3000.tape
```

The tape calls `setup-pi-demo.sh`, attaches to the generated tmux session, and types real slash commands into Pi. The intended output is:

```text
demos/wendybot3000/wendybot3000.gif
```

The helper files are part of the demo contract:

| File | Role |
|---|---|
| `source-pet/` | Committed WendyBot3000 dog sprite used by the recording |
| `fixture-session.jsonl` | Scrubbed Pi session history for `/context` and `/recap` |
| `demo-provider.js` | Local deterministic model for `/btw` and `/recap` |
| `setup-pi-demo.sh` | Builds the isolated temp Pi/tmux environment and copies `source-pet/` into it |
| `create-demo-pet.mjs` | Fallback generated pet for local smoke tests |

If `vhs` is not installed, the text tour still shows the pet and commands:

```bash
bash demos/wendybot3000/demo.sh
```

## Optional Live Pi Demo

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

The demo does not force ANSI fallback. `setup-pi-demo.sh` uses an isolated `PI_CODING_AGENT_DIR`, disables user skills/themes/prompt templates/context files, hides the tmux status bar so Pi's own footer is at the bottom, and enables tmux passthrough so Kitty/Ghostty-capable terminals can use native placeholder rendering. If the recorder terminal does not implement Kitty graphics, Pi still falls back to ANSI while running the same real slash-command flow.

For native-image release media, use the Ghostty capture helper instead of VHS:

```bash
demos/wendybot3000/capture-ghostty-demo.sh
```

The helper opens a large Ghostty window, prefers a second display when present, records with `screencapture`, and writes ignored local media under `/tmp`. It runs Pi directly, without tmux. It closes stale `pi-sprite ... demo` Ghostty instances, waits until Pi mutates the fixture session, and checks that the expected capture window is still Ghostty's front window before each input, so it fails early instead of typing into your active tab. It does not kill arbitrary Ghostty windows. Use `PI_SPRITE_CAPTURE_DISPLAY=main`, `PI_SPRITE_CAPTURE_SECONDS=40`, or `PI_SPRITE_CAPTURE_X/Y/W/H` to override placement.

For README media, convert from the native Ghostty MP4 rather than the VHS GIF, and validate an extracted GIF frame before committing. The acceptance check is visual and mechanical: the frame should still show the `/context` overlay, the WendyBot3000 sprite, and Pi's bottom footer/status line. If the footer touches the bottom edge, add dark bottom padding during conversion instead of cropping the terminal.

The same script can record another installed pet while keeping the same `/context`, `/btw`, `/recap`, and footer-status scenes:

```bash
PI_SPRITE_DEMO_PET_SOURCE="$HOME/.pi/agent/pi-sprite/pets/wumpus" \
  demos/wendybot3000/capture-ghostty-demo.sh

PI_SPRITE_DEMO_PET_SOURCE="$HOME/.pi/agent/pi-sprite/pets/cap" \
  demos/wendybot3000/capture-ghostty-demo.sh
```

## Release Use

For the 1.0 release, use this demo in three places:

- README: embed the optimized `docs/assets/wendybot3000-demo.gif` and link to the hosted docs or demo source.
- GitHub release notes: include the short GIF or MP4.
- npm/package gallery: use a hosted image or video if the package listing supports it.

Keep the demo source in the repo even if the rendered GIF is hosted elsewhere. The source is easier to review and regenerate than a binary media file.
