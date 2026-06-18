# pi-sprite

A tiny Codex-style sprite companion for [Pi](https://pi.dev), plus three small workflow commands:

```text
/pet      sprite selection and local import
/context  Claude-style context usage visualizer
/recap    compact session recap
/btw      side question thread
```

`pi-sprite` is intentionally small. It is not a pet simulator, desktop companion, voice assistant, or dashboard suite.

## Install

During development:

```bash
pi -e ~/worktrees/pi-sprite
```

From git once stable:

```bash
pi install git:github.com/safurrier/pi-sprite
```

## Commands

### `/pet`

```text
/pet
/pet list
/pet choose <id>
/pet import <path>
/pet hide
/pet show
```

Pets live under:

```text
~/.pi/agent/pi-sprite/pets/<id>/
```

Current local expanded format:

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

Codex/Petdex `pet.json + spritesheet.webp` compatibility is supported for first-frame rendering. When `frame.width` and `frame.height` are present, `pi-sprite` crops the first spritesheet frame and renders it as compact terminal half-block art.

### `/context`

```text
/context
/context all
/sprite:context
```

Shows a Claude-Code-style TUI overlay with:

- context grid/cells
- active model and context window
- token total and percent
- estimated category breakdown
- free-space row

`/sprite:context` is the same visualizer under a package-specific alias, useful when another Pi command named `/context` is present.

### `/recap`

```text
/recap
```

Generates a manual structured recap:

```text
Goal: ...
State: ...
Decisions: ...
Files/commands: ...
Next: ...
```

### `/btw`

```text
/btw <question>
/btw:new
/btw:clear
/btw:inject
/btw:summarize
```

BTW answers side questions outside the main thread. It injects content back only when you explicitly run `/btw:inject` or `/btw:summarize`.

## Non-features

`pi-sprite` deliberately does not include:

- Electron or native floating windows
- voice, TTS, sounds, songs, or ambient weather
- hunger, feeding, bonding, XP, accessories, treats, or pet economy
- autonomous pet commentary or personality
- 3D/raymarched rendering
- large always-visible dashboards

## Development

```bash
mise run setup
mise run check
mise run verify
```

Equivalent npm commands:

```bash
npm run check
npm run test:e2e
```

TUI smoke artifacts are written under:

```text
artifacts/e2e/
```

## Attribution

`pi-sprite` began as a slimmed derivative of [`djdiptayan1/pi-pokepet`](https://github.com/djdiptayan1/pi-pokepet), licensed under MIT. See `NOTICE.md` and `LICENSE`.
