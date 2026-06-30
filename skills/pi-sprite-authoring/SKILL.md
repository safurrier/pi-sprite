---
name: pi-sprite-authoring
description: Create custom pi-sprite pets from AI-generated, reference-driven, or hand-drawn sprites. Use when making Wumpus or Petdex-inspired sprites, preparing pet.json manifests, generating GPT Image prompts or images, converting outputs into /pet import folders, or dogfooding custom pi-sprite pets.
---

# Pi Sprite Authoring

Create importable `pi-sprite` pet folders from generated, reference-driven, or hand-drawn sprites.

## Default workflow

1. Prefer the expanded five-image format for first-time authoring:
   `idle.png`, `thinking.png`, `working.png`, `success.png`, `error.png`, and `pet.json`.
2. Gather the character brief and any local reference images before generating. Ask for user choice when the character direction is still open.
3. If the user mentions Boba, Petdex, Sprite Mart, or another existing pet as inspiration, read `references/petdex-reference-to-custom-pet.md`.
4. If the user wants GPT/OpenAI image generation or copy-paste image prompts, read `references/gpt-image-sprite-workflow.md`.
5. If the user wants Wumpus-specific mascot prompts, read `references/wumpus-sprite-prompts.md`.
6. Bind each reference image to an explicit role and instruction. Use references for style, scale, outline, palette, or mood; do not copy unclear-license third-party character identity.
7. Present 3-5 direction cards before locking the character, unless the user already supplied a precise design.
8. After the user chooses a direction, write a stable character lock and generate or select a canonical `idle` anchor before making the remaining states.
9. Use the canonical anchor as the primary `character_reference` for `thinking`, `working`, `success`, and `error`; use Petdex or other third-party references only as secondary style/scale references.
10. Run a character-cohesion review against the canonical anchor before packaging. Regenerate states with major drift. Read `references/character-cohesion-review.md` when a reusable review prompt would help.
11. If generated outputs lack alpha, run local background cleanup before packaging; keep the original generated files and metadata.
12. Ask whether the user wants an animated version. If yes, create subtle per-state frame strips and add `frame.width`/`frame.height` to `pet.json`.
13. Create a pet folder containing `pet.json` plus accepted image files or strips.
14. Import with a single slash command, `/pet import <folder>`, then run follow-up commands separately: `/pet clear-native`, `/pet show`, `/pet size small`, and `/pet label off`.

## Direction-card format

Use this format before image generation when the user is still choosing a character direction:

```markdown
## Direction options

1. **Short name**
   - Character: concrete subject and silhouette
   - Mood: emotional target
   - Visual lock: palette, outline, scale, one or two immutable traits
   - Why it fits: why this works as a terminal pet
   - Risk: what may become generic or hard to read
```

Ask the user to pick one direction, combine directions, or revise the brief. Do not silently pick a final design unless the user asks for speed/autonomy.

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

Then import. Run each slash command separately; do not paste the import plus follow-up commands as one multi-line command.

```text
/pet import /tmp/wumpus-sprite
/pet choose wumpus
/pet show
```

## Canonical anchor gate

For generated pets, avoid generating all five states independently. First generate or choose a canonical `idle` image. Treat it as the ground-truth identity for the pet.

Use this acceptance gate before final packaging:

```markdown
## Character cohesion review

Canonical anchor: path/to/idle.png

| State | Identity | Silhouette | Face | Ears/props | Palette/outline | State readability | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| thinking | same/minor drift/major drift | ... | ... | ... | ... | clear/unclear | accept/regenerate |
```

Regenerate any state with major drift in identity, silhouette, face, signature props, palette, or outline thickness. Pose and expression should change; the character design should not. For a reusable human/vision-model review prompt, use `references/character-cohesion-review.md`.

## Optional animation pass

After the static five-state pet works, ask whether the user wants an animated version. Offer two levels:

1. **Simple motion** — no image API needed. Reuse one accepted image per state and create subtle bob/shift strips. This is safest for character consistency.
2. **Expressive keyframes** — generate or draw per-frame differences, such as eye shifts, head tilts, prop twinkles, or sprite-specific details. This is higher quality but must pass the cohesion review because identity drift is easier.

Keep animation subtle; terminal pets read best when the character identity stays fixed and only a few pixels, the whole body, or one sprite-specific feature changes. Do not blindly use feature examples like leaf bob or tail wag unless that character actually has the feature.

Recommended frame counts:

```text
idle:      4 frames — blink, breathing, or leaf/ear bob
thinking:  4 frames — slight head tilt or eye shift
working:   6 frames — paw/key tap loop
success:   5 frames — bounce or sparkle twinkle
error:     4 frames — worried blink or small droop
```

`pi-sprite` supports per-state horizontal strips when `pet.json` includes a frame size:

```json
{
  "sprites": {
    "idle": "idle-strip.png",
    "thinking": "thinking-strip.png",
    "working": "working-strip.png",
    "success": "success-strip.png",
    "error": "error-strip.png"
  },
  "frame": { "width": 128, "height": 128 }
}
```

For simple motion, create a strip from one accepted state image:

```bash
uv run --with pillow python skills/pi-sprite-authoring/scripts/create_motion_strip.py \
  --input /tmp/wumpus/clean/thinking.png \
  --output /tmp/wumpus/pet/thinking-strip.png \
  --metadata /tmp/wumpus/pet/thinking-strip.metadata.json \
  --preset thinking-bob \
  --frame-width 128 \
  --frame-height 128
```

Useful simple presets:

```text
bob
thinking-bob
working-tap
success-bounce
error-droop
```

For expressive keyframes, generate or draw cleaned frames first, then assemble them into a strip:

```bash
uv run --with pillow python skills/pi-sprite-authoring/scripts/assemble_sprite_strip.py \
  --frame /tmp/wumpus/frames/idle-0.png \
  --frame /tmp/wumpus/frames/idle-1.png \
  --frame /tmp/wumpus/frames/idle-2.png \
  --frame /tmp/wumpus/frames/idle-3.png \
  --output /tmp/wumpus/pet/idle-strip.png \
  --metadata /tmp/wumpus/pet/idle-strip.metadata.json \
  --frame-width 128 \
  --frame-height 128
```

## Background cleanup

If the image model returns a non-alpha PNG, use the local cleanup helper before packaging. It removes only edge-connected background pixels, which is safer than deleting every near-white pixel inside the sprite.

```bash
uv run --with pillow python skills/pi-sprite-authoring/scripts/remove_sprite_background.py \
  --input /tmp/boba-sprite/generated/thinking.png \
  --output /tmp/boba-sprite/clean/thinking.png \
  --metadata /tmp/boba-sprite/clean/thinking.metadata.json \
  --target-size 128 \
  --padding 10
```

Use the cleaned images in the importable pet folder, but keep original generation outputs, prompts, and metadata for provenance.

## Optional OpenAI image generation

Use prompt-only mode when no image API is available. When `OPENAI_API_KEY` is available and the user approves API calls, use the bundled helper:

```bash
uv run --with openai python skills/pi-sprite-authoring/scripts/openai_sprite_image.py \
  --prompt-file /tmp/boba-sprite/prompts/idle.txt \
  --reference-image /tmp/boba-ref.png \
  --reference-instruction "Use for pixel-art scale, outline thickness, and terminal readability only. Do not copy character identity." \
  --output-dir /tmp/boba-sprite/generated \
  --prefix idle
```

Use `--dry-run` first to validate prompt/reference wiring without making API calls:

```bash
uv run --with openai python skills/pi-sprite-authoring/scripts/openai_sprite_image.py \
  --dry-run \
  --prompt "Create a tiny transparent pixel-art idle sprite." \
  --reference-image /tmp/boba-ref.png \
  --reference-instruction "Use for silhouette scale only; do not copy identity." \
  --output-dir /tmp/boba-sprite/generated \
  --prefix idle
```

## Use reference sprites safely

Do not commit copyrighted or unclear-license third-party sprite assets to the repo. For temporary visual references, run:

```bash
node skills/pi-sprite-authoring/scripts/download-petdex-examples.mjs --limit 12 --out examples/petdex-downloads
```

Use downloaded examples only as local reference unless the asset license is verified. The script writes provenance notes next to the downloads.

## Output requirements

For generated Wumpus or custom sprites, produce:

```text
custom-sprite/
├── pet.json
├── idle.png
├── thinking.png
├── working.png
├── success.png
└── error.png
```

Keep contact sheets, raw generations, prompts, and metadata next to the working directory, not inside the final import folder unless you intentionally want those files copied into the installed pet.

```text
working-dir/
├── anchor/
├── generated/
├── prompts/
├── clean/
├── contact-sheet.png
└── custom-sprite/
    ├── pet.json
    ├── idle.png
    ├── thinking.png
    ├── working.png
    ├── success.png
    └── error.png
```

For animated pets, use strips and record the frame size:

```text
custom-sprite/
├── pet.json
├── idle-strip.png
├── thinking-strip.png
├── working-strip.png
├── success-strip.png
└── error-strip.png
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
- Use transparent backgrounds, or run local background cleanup when the model returns non-alpha images.
- Keep each state visually consistent: same pose scale, outline, palette, and canvas size.
- Avoid text, shadows, busy props, and tiny facial details.
- Record prompt files and reference instructions next to generated assets.
- For animated strips, keep frame size consistent and verify `pet.json` has `frame.width` and `frame.height`.
- Test in native and ANSI fallback modes when possible:

```text
/pet size small
/pet label off
/pet show
```

```bash
PI_SPRITE_NATIVE_IMAGES=0 pi -e . -p "/pet show" --no-session
```
