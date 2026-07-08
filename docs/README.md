---
id: docs-index
title: pi-sprite Docs
description: >
  Human-facing index for pi-sprite documentation, ordered from quick start to deeper references.
index:
  - id: start-here
  - id: author-and-configure-sprites
  - id: understand-the-system
  - id: reference
---

# pi-sprite Docs

## Start Here

- [Docs Home](index.md) — short landing page for users and contributors
- [Project README](https://github.com/safurrier/pi-sprite#readme) — install, command overview, development commands, and non-features

## Author and Configure Sprites

- [Sprite Authoring Guide](tutorials/authoring-sprites.md) — use `/pet create` to create a stable importable pet from references or generated art
- [WendyBot3000 Demo](tutorials/wendybot3000-demo.md) — deterministic release-demo pet, Ghostty/VHS capture source, README GIF checks, and live Pi command sequence
- [Configuration Reference](reference/configuration.md) — sprite state, pet folders, default pet selection, and environment overrides

## Understand the System

- [Architecture](explanation/architecture.md) — extension lifecycle, command bridges, rendering ownership, side sessions, and package boundaries

## Reference

- [Pet Manifest Reference](reference/pet-manifest.md) — `pet.json` fields, sprite states, frame strips, and personality metadata
- [Rendering Modes Reference](reference/rendering-modes.md) — ANSI fallback, direct native images, and Kitty placeholder rendering
