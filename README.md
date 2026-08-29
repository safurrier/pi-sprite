# pi-sprite

`pi-sprite` is a small [Pi](https://pi.dev) package. It adds a terminal sprite, a context view, a recap bubble, and a side-question thread.

It is not a pet simulator or desktop companion. The sprite makes agent state easier to read without adding a dashboard.

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

`/pet install` also selects the Petdex sprite. For an imported pet, use `/pet list`, then `/pet choose <id>`.

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

Both status modes are on by default. Turn status is final. It replaces live status when a turn ends. Live status starts after five minutes and can show `🟣 running tests…`.

## Native image rendering

In Kitty and Ghostty, `pi-sprite` uses Kitty Unicode placeholders by default. It uploads frames quietly and draws the sprite as text cells. Tmux can then move and clear the pane grid. This avoids ghosted images from direct Kitty or Ghostty passthrough.

For tmux, allow passthrough:

```tmux
set -g allow-passthrough on
```

To force the ANSI half-block fallback:

```bash
PI_SPRITE_NATIVE_IMAGES=0 pi
```

## Custom pets

A local pet can use one image for each state:

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

Optional `personality` text gives the selected pet a bounded voice for explicit `/btw` side conversations:

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

Pi does not inject personality into normal turns. It only guides `/btw` and `/btw:ask` answers.

Import and select a local pet folder:

```text
/pet import /path/to/pet-folder
```

`pi-sprite` also supports Codex and Petdex `pet.json + spritesheet.webp` pets. It cycles multi-frame sheets and infers standard Petdex 8x9 atlases for `spritesheet.*`.

### Author a sprite effectively

This package ships the `pi-sprite-authoring` skill. It helps an agent turn references, generated art, or hand-drawn frames into an importable pet with consistent states.

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

Keep third-party reference sprites local until you verify their licenses. This helper downloads Petdex examples to a gitignored folder with provenance notes:

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

`/context` opens a terminal overlay. It shows the active model, context window, token total, estimated categories, and free space. `/sprite:context` is the package alias when another package owns `/context`.

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

Recap first uses an isolated, no-tools Pi side session with the current model. It does not add messages to the main thread. Direct API-key completion is only a fallback. Use arrow keys, `j/k`, `space/d`, or `u` to scroll longer recaps.

## `/btw`

```text
/btw <message>
/btw
/btw:ask <question>
/btw:new [message]
/btw:status
/btw:refresh
/btw:clear
/btw:recap
/btw recap
/btw:inject
/btw:summarize
```

`/btw` is a continuing side conversation outside the main thread. Its first contextual question creates a persistent child Pi SDK session. The model follows the selected parent path at the current leaf. The child file can retain copied sibling history, but that history is not in the active model context.

The child inherits the model and provider, thinking level, cwd, AGENTS context, skill metadata, and normal `read`, `bash`, `edit`, and `write` tools. It does not recursively load arbitrary parent extensions. Follow-ups stay in this transcript. `/btw:ask` is contextless and disposable. Use `/btw:recap` or `/btw recap` for a session recap in the BTW thread.

Pi does not sync parent progress automatically. `/btw:status` shows the parent, fork point, last refresh, and child identity. It changes neither conversation. `/btw:refresh` adds a bounded, read-only parent snapshot to the child. The speech bubble streams thinking, tools, and text. It waits for Pi's full prompt lifecycle, including tools and retries, before accepting an answer.

Both agents share the cwd. A BTW file edit can race a main-agent edit. BTW changes files only on an explicit request and reports the change. Nothing returns to the main conversation until you run `/btw:inject` or `/btw:summarize`. `/btw:new`, `/btw:clear`, branch or session changes, and shutdown cancel or dispose of the child runtime. Pi can restore visible BTW entries from hidden parent-session entries. The design uses the persistent side-session and branch-seeding approach from [dbachelder/pi-btw](https://github.com/dbachelder/pi-btw).

## Documentation

Start with the hosted docs. These links work on GitHub, npm, and installed package readers:

- [Command Reference](https://safurrier.github.io/pi-sprite/reference/commands/) for slash-command lookup and side-thread boundaries
- [Project Evolution](https://safurrier.github.io/pi-sprite/project-evolution/) for durable architectural decisions

- [Docs home](https://safurrier.github.io/pi-sprite/) for the user and contributor index
- [Sprite Authoring Guide](https://safurrier.github.io/pi-sprite/tutorials/authoring-sprites/) for custom pet authoring
- [Configuration Reference](https://safurrier.github.io/pi-sprite/reference/configuration/) for default pet state and sprite home setup

Source docs live in `docs/`. MkDocs Material publishes them through GitHub Pages. Build them locally with:

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
