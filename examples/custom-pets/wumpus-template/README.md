# Wumpus custom pet template

Add transparent pixel-art images next to `pet.json`:

```text
idle.png
thinking.png
working.png
success.png
error.png
```

Then import in Pi:

```text
/pet import examples/custom-pets/wumpus-template
/pet choose wumpus
/pet show
```

See `skills/pi-sprite-authoring/references/wumpus-sprite-prompts.md` for image-generation prompts.
