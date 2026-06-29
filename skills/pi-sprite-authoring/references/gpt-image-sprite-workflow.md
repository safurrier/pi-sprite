# GPT Image Sprite Workflow

Use this workflow when generating `pi-sprite` pet images with ChatGPT, GPT Image, or the bundled OpenAI helper.

## Contents

- First choice: five separate images
- Prompt structure
- Canonical anchor workflow
- Five-state prompt set
- OpenAI helper
- Iteration prompts
- Final packaging

## First choice: five separate images

For first-time authoring, generate five separate transparent PNGs instead of a spritesheet:

```text
idle.png
thinking.png
working.png
success.png
error.png
```

Spritesheets are useful later, but five files are easier to inspect, rename, regenerate, and import.

## Prompt structure

Use a character lock plus a state-specific delta.

```text
Create one transparent PNG pixel-art sprite for a terminal companion.

CANONICAL CHARACTER:
[stable character lock]

STATE:
[idle/thinking/working/success/error plus pose]

STYLE AND CANVAS:
- 128x128 square transparent canvas
- centered with consistent feet/baseline and 6-10px padding
- crisp pixel-art look, bold dark outline, limited palette
- readable at small terminal size
- no text, letters, logo, watermark, background, drop shadow, or busy props

REFERENCE IMAGES:
[explicit role/instruction for each reference]
```

## Canonical anchor workflow

For better character consistency, use a ground-truth anchor image:

1. Generate 3-6 `idle` candidates from the character lock and style references.
2. Ask the user to pick the canonical anchor.
3. Save it as `anchor/canonical-idle.png`.
4. Generate `thinking`, `working`, `success`, and `error` with `anchor/canonical-idle.png` as the first reference and role `character_reference`.
5. Keep Petdex or other third-party images as secondary `style_reference` or `scale_reference` only.
6. Run the character-cohesion review before packaging. Use `character-cohesion-review.md` when you need a reusable review prompt.
7. If accepted images lack alpha, run local background cleanup before importing.

State prompts should say:

```text
Use the first attached image as the canonical character identity. Preserve the exact body shape, ear/pearl shapes, straw angle, face style, palette, outline thickness, proportions, canvas scale, and baseline. Change only the pose and expression needed for this state. Do not redesign the character or create a new variant.
```

## Five-state prompt set

After the user chooses a direction and canonical anchor, create one prompt file per state:

```text
prompts/idle.txt
prompts/thinking.txt
prompts/working.txt
prompts/success.txt
prompts/error.txt
```

Use these state deltas:

- `idle`: relaxed neutral pose, calm expression.
- `thinking`: curious head tilt, small pondering gesture, no question-mark text.
- `working`: focused and active, maybe typing on one large simple prop.
- `success`: celebratory pose, sparkle-like body language but no text.
- `error`: confused or worried expression, still friendly and readable.

Keep all other character details identical.

## OpenAI helper

Dry-run first:

```bash
uv run --with openai python skills/pi-sprite-authoring/scripts/openai_sprite_image.py \
  --dry-run \
  --prompt-file /tmp/boba-sprite/prompts/idle.txt \
  --reference-image /tmp/boba-ref.png \
  --reference-instruction "Use for compact pixel-art scale and outline only; do not copy character identity." \
  --output-dir /tmp/boba-sprite/generated \
  --prefix idle
```

Generate when the user approves API calls and `OPENAI_API_KEY` is set:

```bash
uv run --with openai python skills/pi-sprite-authoring/scripts/openai_sprite_image.py \
  --prompt-file /tmp/boba-sprite/prompts/idle.txt \
  --reference-image /tmp/boba-ref.png \
  --reference-instruction "Use for compact pixel-art scale and outline only; do not copy character identity." \
  --output-dir /tmp/boba-sprite/generated \
  --prefix idle
```

The helper uses image generation when no references are supplied and image edit when references are supplied. It defaults to `--background auto` because some current GPT Image models reject transparent-background requests; pass `--background transparent` only with a model that supports it. The helper writes output images, prompt copies, and metadata, and records the background setting.

For anchor-based generation with multiple references, pass each reference with its own role and instruction in order:

```bash
uv run --with openai python skills/pi-sprite-authoring/scripts/openai_sprite_image.py \
  --prompt-file /tmp/boba-sprite/prompts/thinking.txt \
  --reference-image /tmp/boba-sprite/anchor/canonical-idle.png \
  --reference-role character_reference \
  --reference-instruction "Preserve exact character identity; only change pose and expression." \
  --reference-image /tmp/boba-sprite/refs/boba-spritesheet.png \
  --reference-role style_reference \
  --reference-instruction "Use only for pixel-art scale and outline thickness; do not copy identity." \
  --output-dir /tmp/boba-sprite/generated \
  --prefix thinking
```

## Background cleanup

If the accepted image lacks alpha, clean it locally before packaging:

```bash
uv run --with pillow python skills/pi-sprite-authoring/scripts/remove_sprite_background.py \
  --input /tmp/boba-sprite/generated/thinking.png \
  --output /tmp/boba-sprite/clean/thinking.png \
  --metadata /tmp/boba-sprite/clean/thinking.metadata.json \
  --target-size 128 \
  --padding 10
```

The cleanup helper removes edge-connected background colors sampled from image edges, then places the sprite onto a square transparent canvas. Check the result in Preview or via `/pet import`; adjust `--threshold`, `--background-color`, or `--padding` if it removes too much or too little.

## Iteration prompts

After inspecting output, iterate with delta prompts instead of restarting.

```text
Keep: [specific successful silhouette/palette/expression].
Change: [specific pose or readability issue].
Remove: [text, background, extra props, over-detail, copied identity].
Preserve: same character lock, 128x128 transparent canvas, bold pixel outline, same palette.
```

Common fixes:

- Too detailed: "Simplify to one large readable silhouette; remove tiny decorative details."
- Background not transparent: "Transparent background only; no floor, shadow, frame, or scene." If the current model rejects `--background transparent`, regenerate with a compatible model or remove the background in a separate image-editing step before final packaging.
- Character drift: "Preserve the canonical character lock exactly; only change the pose/expression."
- Looks copied from reference: "Make this an original character; keep only pixel-art density and readability from the reference."
- Too large/small: "Center on 128x128 with 8px transparent padding and consistent feet baseline."

## Final packaging

Select the best output for each state and copy/rename into the pet folder:

```text
pet/idle.png
pet/thinking.png
pet/working.png
pet/success.png
pet/error.png
```

Keep generated prompt and metadata files in a separate dogfood workspace for provenance. Do not commit generated third-party-reference-derived assets unless licenses and provenance are acceptable.
