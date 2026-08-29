---
id: project-evolution
title: Project Evolution
description: >
  Evidence-backed history of pi-sprite's slimming, rendering, side-session, authoring, and release decisions.
index:
  - id: evidence-boundary
  - id: phases
  - id: retained-tradeoffs
---

# Project Evolution

## Evidence Boundary

This history covers repository genesis `99f4261deeeb52a624ebcd11de1c0ce7e16b6945`
through the release base `176f324220dd4464274089a80318ee70e055ed0f`. It uses
local Git records and merged pull requests whose merge commits are ancestors of
that base. The evidence package records raw path status, commit, and PR data.

## Phases

### Derivative and slimming

The repository began as a derivative of `pi-pokepet`. Early history contained
Pokémon, Electron, keep-awake, and gamified paths. The slim MVP removed those
paths and established the Pi package boundary in PR [#1](https://github.com/safurrier/pi-sprite/pull/1),
merge `8c5edde3e677f862760a23da405dbe7dcbdde6a6`. Attribution remains in
[NOTICE.md](https://github.com/safurrier/pi-sprite/blob/main/NOTICE.md).

### Package, import, and rendering foundation

PRs [#2](https://github.com/safurrier/pi-sprite/pull/2) through
[#5](https://github.com/safurrier/pi-sprite/pull/5) added Petdex lookup,
image rendering, package smoke coverage, and native animation. The old
monolithic extension paths were replaced with `extensions/index.ts` and
`src/` modules. Validation moved to thin GitHub workflows and `mise` tasks.

### Terminal safety and compact status

PRs [#7](https://github.com/safurrier/pi-sprite/pull/7) through
[#18](https://github.com/safurrier/pi-sprite/pull/18) refined native terminal
support, cleanup, widget footprint, speech bubbles, and final turn status.
The earlier ANSI-in-tmux default was superseded by Kitty placeholder cells in
PR [#29](https://github.com/safurrier/pi-sprite/pull/29), while ANSI remained
the explicit escape hatch.

### Isolated assistance and authoring

PRs [#19](https://github.com/safurrier/pi-sprite/pull/19) through
[#36](https://github.com/safurrier/pi-sprite/pull/36) made recap compact,
added authoring resources, isolated model work, interactive BTW bubbles,
optional BTW-only personality, and MkDocs. The authoring path became a shipped
skill rather than an undocumented local workflow.

### Release and durable BTW fork

PRs [#37](https://github.com/safurrier/pi-sprite/pull/37) through
[#42](https://github.com/safurrier/pi-sprite/pull/42) added release-demo and
npm-release material, then changed contextual BTW into a persistent child Pi
session. PR [#41](https://github.com/safurrier/pi-sprite/pull/41) retained
explicit parent refresh and injection instead of automatic synchronization.

## Retained Tradeoffs

The project keeps a small runtime even when richer companion features are
possible. Native placeholders trade direct terminal placement for tmux-safe
movement. Side sessions preserve main-thread context but require explicit
transfer. Shipped authoring resources improve fresh installs, while image API
use stays optional and third-party assets stay out of the package.
