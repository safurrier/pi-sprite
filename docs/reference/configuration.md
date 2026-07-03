---
id: configuration
title: Configuration Reference
description: >
  Where pi-sprite stores pet folders and selected-pet state, plus how to seed a default pet from config.
index:
  - id: sprite-home
  - id: selected-pet-state
  - id: default-pet-setup
  - id: profile-specific-homes
---

# Configuration Reference

## Sprite Home

By default, `pi-sprite` stores state under:

```text
~/.pi/agent/pi-sprite/
```

The path is controlled by `src/sprite/paths.ts`:

```text
PI_SPRITE_HOME=<custom-dir>
```

When `PI_SPRITE_HOME` is set, both `state.json` and imported pets are read from that custom directory.

## Selected Pet State

Imported pets live under:

```text
~/.pi/agent/pi-sprite/pets/<id>/
```

The selected pet and display preferences live in:

```text
~/.pi/agent/pi-sprite/state.json
```

A minimal seeded state file looks like this:

```json
{
  "selectedPetId": "desk-cat",
  "visible": true
}
```

The selected id must match a folder under `pets/` whose `pet.json` parses successfully.

## Default Pet Setup

To seed a default pet from a config repo or dotfiles system:

1. Copy the expanded pet folder to `~/.pi/agent/pi-sprite/pets/<id>/`.
2. Write `state.json` with `selectedPetId` set to that id.
3. Keep `pet.json` and all referenced sprite files inside the pet folder.
4. Run `/pet status` after reload to confirm the selected pet.

Example target shape:

```text
~/.pi/agent/pi-sprite/
├── state.json
└── pets/
    └── desk-cat/
        ├── pet.json
        ├── idle.png
        ├── thinking.png
        ├── working.png
        ├── success.png
        └── error.png
```

Use absolute paths when importing manually:

```text
/pet import /Users/alex/sprites/desk-cat
```

Slash commands do not expand `~`, so avoid shell-style paths in `/pet import`.

## Profile-Specific Homes

Some Pi wrappers set `PI_CODING_AGENT_DIR` to separate agent profiles. `pi-sprite` does not derive its home from that variable directly; it uses `PI_SPRITE_HOME` when present and otherwise falls back to `~/.pi/agent/pi-sprite`.

For profile-specific defaults, set `PI_SPRITE_HOME` for each profile or mirror the seeded `pi-sprite/` directory into the profile-specific agent home used by that wrapper.
