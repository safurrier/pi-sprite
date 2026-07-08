# pi-sprite

`pi-sprite` is a small Pi package that adds a terminal sprite, a context visualizer, a recap bubble, and a side-question thread to [Pi](https://pi.dev).

It is intentionally not a pet simulator or desktop companion. The sprite is there to make agent state easier to read without adding another dashboard.

![pi-sprite WendyBot3000 demo](https://safurrier.github.io/pi-sprite/assets/wendybot3000-demo.gif)

The demo shows real Pi slash commands: importing a pet, opening `/context`, asking `/btw`, running `/recap`, and watching the bottom footer status update.

## Quick start

Install from GitHub today:

```bash
pi install git:github.com/safurrier/pi-sprite@main
pi
```

After the npm release, the install path becomes:

```bash
pi install npm:pi-sprite
pi
```

If you are developing from a checkout, run the local package without installing it:

```bash
cd /path/to/pi-sprite
pi -e .
```

Once Pi opens, get to a useful first sprite:

```text
/pet status
/pet gallery
/pet preview <id-from-gallery>
/pet install <id-from-gallery>
/context
/btw what should I look at next?
```

`/pet install` selects the installed Petdex sprite automatically. If you already imported pets, use `/pet list` and `/pet choose <id>` instead.

If you already have a local pet folder, import it with an absolute path:

```text
/pet import /absolute/path/to/my-pet
/pet choose my-pet
```

To author a new sprite with agent help, start the guided workflow:

```text
/pet create tiny desk cat with cozy pixel-art vibes
```

For deeper custom-pet guidance, read the hosted [Sprite Authoring Guide](https://safurrier.github.io/pi-sprite/tutorials/authoring-sprites/).

If native images ever get stuck after changing renderers or restarting tmux, clean the terminal image layer and redraw:

```text
/pet clear-native
/pet show
```

## What you get

| Command | Use it for |
| --- | --- |
| `/pet` | Show, hide, choose, import, author, and configure the sprite. |
| `/sprite` | Package-specific alias for `/pet`, useful when another package also owns pet-like commands. |
| `/context` | Open a Claude-style context usage visualizer. |
| `/recap` | Generate a compact recap of the current session in a speech bubble. |
| `/btw` | Ask side questions without adding normal messages to the main thread, or generate a recap into the side thread. |

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
/pet import <path>
/pet import-url <url>
/pet create [brief]
/pet author [brief]
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

This package ships the `pi-sprite-authoring` skill. Use it when you want an agent to turn references, generated art, or hand-drawn frames into an importable pet without losing character consistency across states.

Start the guided flow from Pi:

```text
/pet create tiny desk cat with cozy pixel-art vibes
```

You can also invoke the skill directly:

```text
/skill:pi-sprite-authoring
```

The recommended authoring loop is:

1. Write a short character brief and gather any local references.
2. Pick a direction card before generating images.
3. Create or choose one canonical `idle` image as the identity anchor.
4. Generate `thinking`, `working`, `success`, and `error` from that anchor.
5. Review all states for shared silhouette, face, palette, outline, canvas size, and scale.
6. Add optional simple motion strips only after the static states work.
7. Add bounded BTW-only `personality` metadata if the pet should affect explicit side replies.
8. Import the expanded folder with `/pet import <path>`.

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
node skills/pi-sprite-authoring/scripts/download-petdex-examples.mjs --limit 12 --out /tmp/petdex-downloads
```

For the full workflow, read the hosted [Sprite Authoring Guide](https://safurrier.github.io/pi-sprite/tutorials/authoring-sprites/). For a deterministic release-demo pet, see the [WendyBot3000 demo guide](https://safurrier.github.io/pi-sprite/tutorials/wendybot3000-demo/) and the repo-only [demo source](https://github.com/safurrier/pi-sprite/tree/main/demos/wendybot3000).

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
/btw:recap
/btw recap
/btw:inject
/btw:summarize
```

`/btw` is a continuing side conversation outside the main thread. Use `/btw <message>` for follow-ups and `/btw` to reopen the current side thread. Use `/btw:ask <question>` for a one-off aside that does not append to the thread. Use `/btw:recap` or `/btw recap` to generate the normal session recap inside the BTW thread.

Answers appear in an interactive speech bubble that points toward the sprite. Nothing is injected back into the main conversation unless you explicitly run `/btw:inject` or `/btw:summarize`.

## Documentation

Start with the hosted docs; these links work from GitHub, npm, and installed package readers:

- [Docs home](https://safurrier.github.io/pi-sprite/) for the user and contributor index
- [Sprite Authoring Guide](https://safurrier.github.io/pi-sprite/tutorials/authoring-sprites/) for custom pet authoring
- [Configuration Reference](https://safurrier.github.io/pi-sprite/reference/configuration/) for default pet state and sprite home setup

From a source checkout, durable docs live under `docs/` and are published with MkDocs Material through GitHub Pages. Build them locally with:

```bash
uvx --with mkdocs-material mkdocs build --strict
```

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

Release publishing uses the hosted [Release Checklist](https://safurrier.github.io/pi-sprite/reference/release/).

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
