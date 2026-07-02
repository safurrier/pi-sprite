---
id: rendering-modes
title: Rendering Modes Reference
description: >
  Terminal rendering modes for pi-sprite, including ANSI fallback and Kitty placeholder rendering.
index:
  - id: mode-selection
  - id: ansi-fallback
  - id: kitty-placeholder
  - id: direct-native-images
  - id: tmux-notes
---

# Rendering Modes Reference

## Mode Selection

`pi-sprite` renders through `src/sprite/renderer.ts`. The mode can be overridden with `PI_SPRITE_NATIVE_IMAGES`:

| Value | Behavior |
|---|---|
| unset | Use Kitty placeholder mode when the terminal can support Kitty control, otherwise ANSI fallback |
| `0`, `false`, `off`, `none`, `ansi` | Force ANSI half-block fallback |
| any other value | Same as unset in the current implementation |

## ANSI Fallback

ANSI fallback converts sprite pixels into colored half-block text. It is the most portable and is useful for debugging:

```bash
PI_SPRITE_NATIVE_IMAGES=0 pi -e .
```

Use ANSI fallback when native image escape sequences interfere with capture output or terminal behavior.

## Kitty Placeholder

Kitty placeholder mode uploads image frames quietly, then renders placeholder cells as normal TUI text. This is the native path for Kitty/Ghostty/WezTerm-capable terminals because tmux can move and clear the placeholder cells with the rest of the grid.

## Direct Native Images

Direct native mode places terminal images through the terminal graphics protocol. The current mode selector does not expose a direct-mode environment override; direct rendering remains in the renderer as an implementation path but placeholder mode is the default native behavior.

## Tmux Notes

For tmux, allow passthrough:

```tmux
set -g allow-passthrough on
```

If a sprite ever ghosts after renderer changes or terminal restarts, clear and redraw from Pi:

```text
/pet clear-native
/pet show
```

Keep cleanup changes in the sprite runtime. Widget rendering, native image ids, and clear paths are coupled; bypassing the runtime can leave duplicate sprites or stale terminal graphics behind.
