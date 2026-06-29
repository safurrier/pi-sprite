# Character cohesion review

Use this after generating a canonical anchor and the remaining sprite states. The goal is to catch when image generation creates five related variants instead of one character in five states.

## Inputs

- `anchor/canonical-idle.png` — the ground-truth character identity.
- Candidate state images: `thinking.png`, `working.png`, `success.png`, `error.png`.
- Optional style reference images, used only to understand intended palette, outline, and scale.

## Review prompt

Use this prompt with a human reviewer or a vision-capable model. Do not ask the reviewer to judge whether the art is generally cute until identity preservation is checked.

```text
You are reviewing a custom pi-sprite pet for character consistency.

The first image is the canonical character anchor. Treat it as ground truth.
The remaining images are state candidates for thinking, working, success, and error.

Judge whether each state preserves the same character identity. Pose and expression may change. The character design should not change.

Check these invariants:
- overall silhouette and body proportions
- head/body shape
- face shape and eye style
- signature ears, props, straw, horns, tail, clothes, or other defining features
- palette and relative color placement
- outline thickness and pixel-art style
- canvas scale, baseline, and padding

Return a markdown table with these columns:
State | Identity | Silhouette | Face | Signature traits | Palette/outline | Scale/baseline | State readability | Verdict | Regeneration notes

Use only these verdicts:
- accept
- regenerate-minor
- regenerate-major

If verdict is regenerate-minor or regenerate-major, give concrete regeneration notes that say what must be preserved from the anchor and what pose/expression should change.
```

## Manual rubric

| Rating | Meaning | Action |
| --- | --- | --- |
| same | Clearly the same character in a new pose. | Accept if state reads clearly. |
| minor drift | Mostly same character, but one trait moved or softened. | Accept for rough dogfood, or regenerate for final asset. |
| major drift | Reads as a sibling/variant/new character. | Regenerate. |

Reject on any major drift in identity, silhouette, face, signature traits, palette, or outline. A state can be readable and still fail if it reads as a different character.

## Regeneration prompt pattern

```text
Regenerate the STATE image using the canonical anchor as the first reference.
Preserve exact character identity from the anchor: [specific silhouette, face, props, palette, outline, scale].
The previous attempt drifted because [specific issue].
Change only [pose/expression/state cue].
Do not redesign the character, change proportions, move signature props, or introduce a new variant.
```

## Packaging gate

Only package/import states that pass the cohesion review or are explicitly accepted by the user for rough dogfood. Record the review notes next to the generated assets so future iterations know which traits are locked.
