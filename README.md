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
/pet size tiny|small|medium|large
/pet label on|off
/pet align left|right
/pet turn-status on|off|clear
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

Codex/Petdex `pet.json + spritesheet.webp` compatibility is supported. `pi-sprite` renders image-backed pets as compact terminal art, cycles multi-frame spritesheets, infers standard Petdex 8x9 atlases for `spritesheet.*`, and uses Pi TUI native images on Kitty/iTerm2-capable terminals with ANSI half-block fallback elsewhere.

By default, the sprite is compact, right-aligned, and label-free so it stays out of the main text flow. The pet/state label lives in Pi's footer status line instead. Use `/pet size ...`, `/pet label on`, or `/pet align left` if you want a larger or more explicit widget.

`/pet turn-status on` enables an opt-in footer recap after each agent turn. When enabled, `pi-sprite` runs a tiny no-tools side classifier over recent session context and mirrors a compact state in the footer, such as `🟢 PR merged` or `🟡 restart Pi to verify`. Use `/pet turn-status off` to disable it or `/pet turn-status clear` to clear the current footer status.

Ghostty exposes the Kitty image protocol, so `pi-sprite` can render native images when Pi runs directly in Ghostty/Kitty/iTerm2-capable terminals.

Inside tmux, Kitty/Ghostty graphics are terminal-level placements, not tmux text cells. `pi-sprite` still enables native images in known Kitty-capable tmux terminals because that is the useful Ghostty workflow, but it treats tmux as managed mode: use a stable per-pane image id and delete that image id before drawing. Make sure tmux allows passthrough:

```tmux
set -g allow-passthrough on
```

If old native placements from earlier versions are still stuck, run `/pet clear-native` once, then `/pet show`. That command intentionally asks the terminal to delete visible Kitty images. If native image passthrough keeps misbehaving, force the ANSI fallback with:

```bash
export PI_SPRITE_NATIVE_IMAGES=0
```

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

Generates a manual structured recap in a higher-contrast speech bubble anchored near the sprite and updates the Pi footer while it is running/ready. Use ↑/↓, j/k, space/d, or u to scroll longer recaps:

```text
Goal: ...
State: ...
Decisions: ...
Files/commands: ...
Next: ...
```

### `/btw`

```text
/btw <message>
/btw
/btw:ask <question>
/btw:new [message]
/btw:clear
/btw:inject
/btw:summarize
```

BTW is a continuing side conversation outside the main thread. Use `/btw <message>` for follow-ups; `/btw` reopens the current side thread. Use `/btw:ask <question>` for a one-off aside that does not append to the thread. The footer shows BTW running/ready state, and answers appear in a compact speech bubble that points toward the sprite. Use ↑/↓, j/k, space/d, or u to scroll longer answers. It injects content back only when you explicitly run `/btw:inject` or `/btw:summarize`.

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
PI_SPRITE_E2E_TUI=1 npm run test:e2e
PI_SPRITE_E2E_MODEL=1 npm run test:e2e
node tests/e2e/package-smoke.mjs --isolated
node tests/e2e/package-smoke.mjs --full-config
```

TUI smoke artifacts are written under:

```text
artifacts/e2e/
```

## Attribution

`pi-sprite` began as a slimmed derivative of [`djdiptayan1/pi-pokepet`](https://github.com/djdiptayan1/pi-pokepet), licensed under MIT. See `NOTICE.md` and `LICENSE`.
