# pi-sprite

`pi-sprite` is a small Pi package that adds a terminal sprite, a context visualizer, a recap bubble, and a side-question thread to [Pi](https://pi.dev).

It is intentionally not a pet simulator or desktop companion. The sprite is there to make agent state easier to read without adding another dashboard.

## Quick start from this checkout

Run Pi with the local extension while developing:

```bash
cd /path/to/pi-sprite
pi -e .
```

In Pi, check the sprite and available pets:

```text
/pet
/pet list
```

If native images ever get stuck after changing renderers or restarting tmux, clean the terminal image layer and redraw:

```text
/pet clear-native
/pet show
```

For a git install after this branch is stable:

```bash
pi install git:github.com/safurrier/pi-sprite
```

## What you get

| Command | Use it for |
| --- | --- |
| `/pet` | Show, hide, choose, import, and configure the sprite. |
| `/context` | Open a Claude-style context usage visualizer. |
| `/recap` | Generate a compact recap of the current session in a speech bubble. |
| `/btw` | Ask side questions without adding normal messages to the main thread. |

The extension also updates the sprite automatically during agent turns:

- `thinking` while the agent is reasoning
- `working` while tools run
- `success` or `error` after turn/tool outcomes
- compact footer status after turns, with provisional live status during long-running turns

## Sprite behavior

By default the sprite is compact, right-aligned, and label-free. The pet/state label lives in Pi's footer status line instead of taking more space in the widget.

Useful `/pet` commands:

```text
/pet status
/pet list
/pet choose <id>
/pet hide
/pet show
/pet size tiny|small|medium|large
/pet label on|off
/pet align left|right
/pet turn-status on|off|clear
/pet live-status on|off|clear
/pet clear-native
```

Pets live under:

```text
~/.pi/agent/pi-sprite/pets/<id>/
```

`turn-status` and `live-status` are both on by default. Turn status is final and replaces provisional live status when the agent turn ends. Live status waits five minutes into a long-running turn before showing a compact in-progress footer such as `🟣 running tests…`.

## Native image rendering

In Kitty/Ghostty-capable terminals, `pi-sprite` uses Kitty Unicode placeholders by default. Frames are uploaded quietly, while the visible sprite is rendered as placeholder text cells. That keeps tmux in charge of moving and clearing the pane grid, which avoids the ghosted native image placements caused by direct Kitty/Ghostty passthrough.

For tmux, allow passthrough:

```tmux
set -g allow-passthrough on
```

To force the ANSI half-block fallback:

```bash
PI_SPRITE_NATIVE_IMAGES=0 pi
```

## Custom pets

The simplest local pet has one image per state:

```text
pet.json
idle.png
thinking.png
working.png
success.png
error.png
```

Minimal `pet.json`:

```json
{
	"id": "boba",
	"name": "Boba",
	"sprites": {
		"idle": "idle.png",
		"thinking": "thinking.png",
		"working": "working.png",
		"success": "success.png",
		"error": "error.png"
	}
}
```

Optional `personality` text gives the selected pet a bounded voice in explicit `/btw` side conversations:

```json
{
	"id": "boba",
	"name": "Boba",
	"personality": "Warm, concise, lightly mischievous, and practical. Keep answers short.",
	"sprites": {
		"idle": "idle.png"
	}
}
```

The personality is not injected into normal main-agent turns. It only guides `/btw` and `/btw:ask` answers.

Import and select a local pet folder:

```text
/pet import /path/to/pet-folder
```

Codex/Petdex `pet.json + spritesheet.webp` compatibility is also supported. `pi-sprite` cycles multi-frame spritesheets and infers standard Petdex 8x9 atlases for `spritesheet.*`.

### Author a sprite effectively

This package ships the `pi-sprite-authoring` skill. Use it when you want an agent to turn references, generated art, or hand-drawn frames into an importable pet without losing character consistency across states:

```text
/skill:pi-sprite-authoring
```

The skill walks through reference gathering, a canonical idle-frame anchor, state-frame review, optional personality metadata for explicit `/btw` replies, and final import validation. It is the recommended path for making polished custom sprites instead of hand-assembling `pet.json` from scratch.

Create a starter folder:

```bash
node skills/pi-sprite-authoring/scripts/create-pet-template.mjs --id desk-cat --name "Desk Cat" --out /tmp/desk-cat-sprite
```

Add bounded BTW-only personality metadata when desired:

```bash
node skills/pi-sprite-authoring/scripts/create-pet-template.mjs \
  --id desk-cat \
  --name "Desk Cat" \
  --personality "Warm, concise, lightly mischievous, and practical. Keep BTW answers short." \
  --out /tmp/desk-cat-sprite
```

Third-party reference sprites should stay local unless their licenses are verified. This helper downloads Petdex examples into a gitignored folder with provenance notes:

```bash
node skills/pi-sprite-authoring/scripts/download-petdex-examples.mjs --limit 12 --out examples/petdex-downloads
```

## `/context`

```text
/context
/context all
/sprite:context
```

`/context` opens a TUI overlay with the active model, context window, token total, estimated category breakdown, and remaining free space. `/sprite:context` is the package-specific alias for setups that already have another `/context` command.

## `/recap`

```text
/recap
```

`/recap` generates a short executive-summary recap near the sprite:

```text
TL;DR: ...
Recent work: ...
Current status: ...
Next: ...
```

Recap generation first uses an isolated, no-tools Pi side session with the current model, so it does not add messages to the main thread. Direct API-key completion is only a fallback. Use arrow keys, `j/k`, `space/d`, or `u` to scroll longer recaps.

## `/btw`

```text
/btw <message>
/btw
/btw:ask <question>
/btw:new [message]
/btw:clear
/btw:inject
/btw:summarize
```

`/btw` is a continuing side conversation outside the main thread. Use `/btw <message>` for follow-ups and `/btw` to reopen the current side thread. Use `/btw:ask <question>` for a one-off aside that does not append to the thread.

Answers appear in an interactive speech bubble that points toward the sprite. Nothing is injected back into the main conversation unless you explicitly run `/btw:inject` or `/btw:summarize`.

## Development

Install dependencies:

```bash
mise run setup
```

Run the usual local gate:

```bash
mise run check
```

Run the full verification path, including e2e smoke helpers:

```bash
mise run verify
```

Equivalent npm commands:

```bash
npm run check
npm run test:e2e
```

Optional e2e variants:

```bash
PI_SPRITE_E2E_TUI=1 npm run test:e2e
PI_SPRITE_E2E_MODEL=1 npm run test:e2e
node tests/e2e/package-smoke.mjs --isolated
node tests/e2e/package-smoke.mjs --full-config
```

TUI smoke artifacts are written under:

```text
artifacts/e2e/
```

## Non-features

`pi-sprite` deliberately does not include:

- Electron or native floating windows
- voice, TTS, sounds, songs, or ambient weather
- hunger, feeding, bonding, XP, accessories, treats, or pet economy
- autonomous pet commentary or main-thread personality injection
- 3D/raymarched rendering
- large always-visible dashboards

## Attribution

`pi-sprite` began as a slimmed derivative of [`djdiptayan1/pi-pokepet`](https://github.com/djdiptayan1/pi-pokepet), licensed under MIT. See `NOTICE.md` and `LICENSE`.
