---
id: docs-home
title: pi-sprite Docs
description: >
  Landing page for pi-sprite users and contributors.
index:
  - id: start-here
  - id: common-tasks
  - id: understand-the-system
---

# pi-sprite Docs

`pi-sprite` is a Pi package that adds a small terminal sprite, a context usage overlay, compact recaps, and explicit side-thread questions.

## Start Here

- [Project README](https://github.com/safurrier/pi-sprite#readme) — install, command overview, development commands, and non-features
- [Sprite authoring guide](tutorials/authoring-sprites.md) — create an importable pet folder with stable sprite states
- [WendyBot3000 demo](tutorials/wendybot3000-demo.md) — deterministic release-demo pet and recording source
- [Configuration reference](reference/configuration.md) — where imported pets and selected-pet state live

## Common Tasks

| Task | Read |
|---|---|
| Install or dogfood the package | [Project README](https://github.com/safurrier/pi-sprite#readme) |
| Make a custom pet with `/pet create` | [Sprite authoring guide](tutorials/authoring-sprites.md) |
| Record a first-release demo | [WendyBot3000 demo](tutorials/wendybot3000-demo.md) |
| Hand-edit `pet.json` | [Pet manifest reference](reference/pet-manifest.md) |
| Debug terminal image behavior | [Rendering modes reference](reference/rendering-modes.md) |
| Prepare an npm release | [Release checklist](reference/release.md) |
| Generate a recap into the side thread | [Architecture](explanation/architecture.md) |

## Understand the System

- [Architecture](explanation/architecture.md) — extension lifecycle, sprite runtime, side sessions, and package boundaries
