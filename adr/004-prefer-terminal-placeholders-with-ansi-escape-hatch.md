# Prefer tracked native placeholders over direct image placement

Status: Accepted
Date: 2026-07-01

## Context

Direct terminal image placement can flicker or ghost when tmux moves the TUI
grid. PR [#29](https://github.com/safurrier/pi-sprite/pull/29) selected Kitty
placeholder rendering at `339a66fcfa3e0306e9b9190f9343d8812d9e8128`, after
native cleanup fixes in earlier rendering PRs.

## Decision

Use Kitty placeholder cells as the default native-image path when supported.
Keep `PI_SPRITE_NATIVE_IMAGES=0` as the stable ANSI half-block fallback.

## Consequences

Tmux can move and clear the sprite with normal grid cells. Direct native
rendering remains an implementation path rather than a supported user switch.
This rejects a direct-placement default inside tmux.
