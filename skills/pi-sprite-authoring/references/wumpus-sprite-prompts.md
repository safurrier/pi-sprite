# Wumpus Sprite Prompts

Use these prompts with an image generator plus 2-5 reference sprites for scale and pixel-art treatment.

## Single idle sprite

```text
Create a transparent PNG pixel-art sprite of Wumpus, Discord's friendly mascot creature, for a terminal companion.

Canvas and style:
- 64x64 or 128x128 square canvas
- transparent background
- cute front-facing or slight 3/4 idle pose
- rounded body, small horns, friendly face
- bold dark outline
- limited Discord-inspired palette
- readable when scaled down to tiny terminal size
- no text, no logo, no background, no shadow
- leave 4-8px transparent padding around the character

Use attached reference sprites only for scale, outline thickness, pose simplicity, and pixel-art treatment. Do not copy their character design.
```

## Full pi-sprite state set

```text
Create five matching transparent PNG pixel-art sprites of the same Wumpus character for a terminal companion.

Required files/states:
1. idle — relaxed neutral smile
2. thinking — curious head tilt or small question-mark mood, no text
3. working — focused typing or tiny laptop pose
4. success — happy celebratory sparkle, no text
5. error — confused or worried, no text

Consistency requirements:
- same canvas size for every image, preferably 64x64 or 128x128
- same character proportions
- same outline thickness
- same color palette
- transparent background
- centered with consistent feet/baseline
- simple readable silhouette
```

## If the model struggles with pixel-perfect output

Ask for a larger clean pixel-art source, then downscale with nearest-neighbor:

```text
Create this as crisp pixel art on a 512x512 transparent canvas, with large blocky pixels and no anti-aliased painterly texture. Keep the character centered and simple so it can be downscaled to 64x64.
```

Then crop/downscale to 64x64 or 128x128 with nearest-neighbor in an image editor.
