# Petdex Reference to Custom Pet

Use this workflow when the user wants a custom pet inspired by Boba, Petdex, Sprite Mart, or another existing sprite.

## Contents

- Discover reference pets
- Reference-image binding
- Direction-card stage
- Character lock
- State set
- Character cohesion review
- Packaging loop

## Discover reference pets

In Pi:

```text
/pet gallery
/pet search boba
/pet preview <slug>
/pet install <slug>
```

For local reference files without installing in the active session:

```bash
node skills/pi-sprite-authoring/scripts/download-petdex-examples.mjs \
  --query boba \
  --limit 5 \
  --out /tmp/pi-sprite-petdex-refs
```

Downloaded Petdex files are local reference material. Do not commit or redistribute third-party assets unless their licenses are verified.

## Reference-image binding

Before generating images, bind each reference to an explicit role and instruction. Do not pass vague instructions like "use this image".

Good binding:

```json
{
  "id": "boba-petdex",
  "path": "/tmp/pi-sprite-petdex-refs/boba/spritesheet.webp",
  "role": "style_reference",
  "instruction": "Use for compact pixel-art scale, outline thickness, simple pose language, and terminal readability. Do not copy the exact character identity, costume, or sprite frames."
}
```

Reference roles:

- `style_reference` — palette, outline, pixel density, pose simplicity.
- `scale_reference` — canvas size, silhouette size, padding.
- `character_reference` — user-owned character identity that should be preserved.
- `mood_reference` — emotional target only.
- `negative_reference` — what to avoid.

For unclear-license Petdex assets, use `style_reference` or `scale_reference`, not `character_reference`.

## Direction-card stage

Turn the user brief and references into 3-5 direction cards before generating. Each card should be a concrete pet concept, not just a style adjective.

```markdown
1. **Sleepy Tapioca Familiar**
   - Character: round boba-pearl creature with a tiny straw sprout
   - Mood: cozy, drowsy, lightly mischievous
   - Visual lock: cream/caramel/brown palette, dark chunky outline, dot eyes, centered 128x128 canvas
   - Why it fits: round silhouette stays readable in terminal size
   - Risk: could look like a generic boba mascot unless the straw/ears are distinctive
```

Ask the user to choose, combine, or revise directions. If the user says to proceed autonomously, state the chosen direction and why.

## Character lock

After direction selection, write a stable character lock and repeat it in every state prompt.

```text
Canonical character lock:
A tiny original boba-tea terminal companion. Rounded milk-tea body, two large tapioca-pearl ear shapes, small straw sprout tilted left, sleepy dot eyes, tiny paws, cream/brown/caramel palette, bold dark pixel outline. Always centered on a transparent 128x128 canvas with 8px padding. No text, logo, cup branding, background, shadow, or watermark.
```

## State set

Do not generate all states independently from only a style reference. First generate 3-6 `idle` candidates, choose one canonical anchor, and then generate the remaining states as edits that preserve that anchor's character identity.

Generate or select one image for each `pi-sprite` state:

- `idle` — neutral/resting pose.
- `thinking` — pondering, curious, tilted, or looking upward; no question-mark text.
- `working` — focused/active/typing; keep props large and simple.
- `success` — celebratory/happy; no text.
- `error` — confused/worried but still cute; no text.

Prefer five separate state images for first-time custom pets. Use spritesheets only after the five-state identity works.

## Character cohesion review

After generating state images, compare each state to the canonical anchor before packaging.

```markdown
## Character cohesion review

Canonical anchor: /tmp/boba-inspired/anchor/idle.png

| State | Identity | Silhouette | Face | Ears/props | Palette/outline | State readability | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| thinking | same | same | minor drift | same | same | clear | accept |
| working | major drift | changed body | changed face | missing straw | same | clear | regenerate |
```

Reject states with major drift in identity, silhouette, face, signature props, palette, or outline. Regeneration prompts should say exactly what to preserve from the anchor and only change pose/expression. Use `character-cohesion-review.md` for a reusable review prompt and table format.

If accepted images lack alpha, run `scripts/remove_sprite_background.py` and package the cleaned images, not the raw generated files.

## Packaging loop

Create a pet template:

```bash
node skills/pi-sprite-authoring/scripts/create-pet-template.mjs \
  --id boba-inspired \
  --name "Boba Inspired" \
  --out /tmp/boba-inspired-pet
```

Copy or rename selected outputs:

```text
/tmp/boba-inspired-pet/idle.png
/tmp/boba-inspired-pet/thinking.png
/tmp/boba-inspired-pet/working.png
/tmp/boba-inspired-pet/success.png
/tmp/boba-inspired-pet/error.png
```

Import and test:

```text
/pet import /tmp/boba-inspired-pet
/pet choose boba-inspired
/pet size small
/pet label off
/pet show
```

If native images look stale or stuck:

```text
/pet clear-native
/pet show
```
