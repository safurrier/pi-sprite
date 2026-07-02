---
id: pet-manifest
title: Pet Manifest Reference
description: >
  Reference for pi-sprite pet.json fields, sprite states, frame strips, and optional personality metadata.
index:
  - id: required-shape
  - id: sprite-states
  - id: animation-strips
  - id: personality
  - id: import-safety
---

# Pet Manifest Reference

## Required Shape

Every imported pet folder needs a `pet.json` object with a valid `id` and an `idle` sprite. `name` is optional but recommended.

```json
{
  "id": "desk-cat",
  "name": "Desk Cat",
  "sprites": {
    "idle": "idle.png",
    "thinking": "thinking.png",
    "working": "working.png",
    "success": "success.png",
    "error": "error.png"
  }
}
```

The parser normalizes `id` to lowercase kebab-case and uses `displayName` as a fallback name when `name` is missing.

## Sprite States

Supported sprite states are:

| State | Used when |
|---|---|
| `idle` | Default state and fallback image |
| `thinking` | Agent reasoning or side-session generation |
| `working` | Tool execution |
| `success` | Completed action or successful turn |
| `error` | Tool or command error |

Sprite paths must be relative to the pet folder and must stay inside that folder. Supported image extensions are `.png`, `.webp`, `.gif`, `.jpg`, and `.jpeg`.

## Animation Strips

Horizontal frame strips use the same `sprites` keys plus a shared `frame` size:

```json
{
  "id": "desk-cat",
  "name": "Desk Cat",
  "sprites": {
    "idle": "idle-strip.png",
    "working": "working-strip.png"
  },
  "frame": {
    "width": 128,
    "height": 128
  }
}
```

Petdex-style `spritesheetPath` is also accepted. The renderer infers the standard Petdex atlas layout when the image shape matches that format.

## Personality

`personality` is optional bounded style metadata for explicit `/btw` side replies:

```json
{
  "id": "desk-cat",
  "name": "Desk Cat",
  "personality": "Warm, concise, lightly mischievous, and practical. Keep BTW answers short.",
  "sprites": {
    "idle": "idle.png"
  }
}
```

Personality text is trimmed and capped by `src/sprite/manifest.ts`. It is encoded as untrusted JSON by `src/btw/prompt.ts` and is only style guidance for explicit `/btw`, `/btw:ask`, and `/btw:new` replies.

## Import Safety

Local folder imports are validated before they are copied into sprite home:

- pet folders must contain `pet.json`
- imported folders may not contain symlinks
- imports reject unsupported file extensions
- imports reject oversized files or total payloads
- ZIP imports reject path traversal
- URL imports require HTTPS

The import rules live in `src/sprite/loader.ts`.
