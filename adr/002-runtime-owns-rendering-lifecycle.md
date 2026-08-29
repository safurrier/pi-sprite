# Give the sprite runtime sole rendering ownership

Status: Accepted
Date: 2026-06-25

## Context

Native image placements, timers, widgets, and footer status can outlive a Pi
turn or session. Rendering cleanup work in PRs [#7](https://github.com/safurrier/pi-sprite/pull/7)
through [#18](https://github.com/safurrier/pi-sprite/pull/18) addressed tmux
trails and stale native placements; the final merge SHA was
`059934c543dd426c3506afb8a3c9d0c03676bb8e`.

## Decision

`src/sprite/runtime.ts` owns selected-pet state, timers, widgets, native image
ids, rendering, cleanup, and footer state. `extensions/index.ts` translates Pi
lifecycle events, while `src/sprite/commands.ts` parses command UX through the
runtime interface.

## Consequences

Other command groups may request a sprite state or footer update but do not
render or clean up directly. This favors lifecycle safety over a shorter path
from a command to a widget.
