---
name: pi-sprite-authoring
description: Create custom pi-sprite pets from AI-generated or hand-drawn sprites. Use when making Wumpus sprites, preparing pet.json manifests, converting image-generation outputs into /pet import folders, or collecting Petdex-style reference sprites for pi-sprite.
---

# Pi Sprite Authoring

Create importable `pi-sprite` pet folders from generated or hand-drawn sprites.

## Workflow

1. Read `references/wumpus-sprite-prompts.md` when the user wants Wumpus or mascot-style image generation prompts.
2. Create a pet folder containing `pet.json` plus image files.
3. Prefer 64x64 or 128x128 transparent PNG/WebP pixel art with bold outlines.
4. Validate paths are relative and assets are `.png`, `.webp`, `.gif`, `.jpg`, or `.jpeg`.
5. Import with `/pet import <folder>` and iterate with `/pet clear-native` plus `/pet show`.

## Create a starter pet folder

Run from the pi-sprite repo or installed package root:

```bash
node skills/pi-sprite-authoring/scripts/create-pet-template.mjs \
  --id wumpus \
  --name Wumpus \
  --out /tmp/wumpus-sprite
```

Add generated images to the output folder as:

```text
idle.png
thinking.png
working.png
success.png
error.png
```

Then import:

```text
/pet import /tmp/wumpus-sprite
/pet choose wumpus
/pet show
```

## Use reference sprites safely

Do not commit copyrighted or unclear-license third-party sprite assets to the repo. For temporary visual references, run:

```bash
node skills/pi-sprite-authoring/scripts/download-petdex-examples.mjs --limit 12 --out examples/petdex-downloads
```

Use downloaded examples only as local reference unless the asset license is verified. The script writes provenance notes next to the downloads.

## Output requirements

For generated Wumpus sprites, produce:

```text
wumpus-sprite/
├── pet.json
├── idle.png
├── thinking.png
├── working.png
├── success.png
└── error.png
```

Use this manifest shape:

```json
{
  "id": "wumpus",
  "name": "Wumpus",
  "author": "Alex",
  "description": "A tiny Wumpus companion for pi-sprite.",
  "sprites": {
    "idle": "idle.png",
    "thinking": "thinking.png",
    "working": "working.png",
    "success": "success.png",
    "error": "error.png"
  }
}
```

## Quality checklist

- Keep the character readable at `small` size.
- Use transparent backgrounds.
- Keep each state visually consistent: same pose scale, outline, palette, and canvas size.
- Avoid text, shadows, busy props, and tiny facial details.
- Test in native and ANSI fallback modes when possible:

```text
/pet size small
/pet label off
/pet show
```

```bash
PI_SPRITE_NATIVE_IMAGES=0 pi -e . -p "/pet show" --no-session
```
