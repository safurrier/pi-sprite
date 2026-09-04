# pi-sprite specification

## Summary

`pi-sprite` is a Pi extension package. It adds a small terminal sprite plus
`/pet`, `/context`, `/recap`, and `/btw` without becoming a desktop companion
or a second agent runtime.

## Goals / Non-Goals

- Goal: show useful agent state through a below-editor sprite and footer.
- Goal: let users import safe local or HTTPS-delivered pet assets.
- Goal: offer explicit, isolated recap and BTW interactions.
- Non-goal: provide autonomous commentary, sound, a pet economy, process
  management, a large dashboard, or a desktop window.

## Requirements

- The extension MUST start and clean up sprite resources through Pi lifecycle
  events.
- Pet import MUST reject unsafe paths, unsupported files, oversized payloads,
  and non-HTTPS remote URLs.
- BTW and recap bookkeeping MUST stay out of the main model context unless a
  user explicitly injects or summarizes it.
- Pet personality MAY guide an explicit BTW reply only; it MUST NOT affect the
  main thread, recap, or status generation.
- Native rendering SHOULD use Kitty placeholders where supported; users MAY
  force ANSI with `PI_SPRITE_NATIVE_IMAGES=0`.

## Interfaces & Contracts

- `extensions/index.ts` — Pi package entrypoint and lifecycle registration.
- `/pet` and `/sprite` — sprite selection, import, display, status, gallery,
  and authoring commands; `/sprite` is the package-specific alias.
- `/context` — context-usage overlay; `/recap` — compact session recap;
  `/btw` — explicit side thread.
- `pet.json` — requires a valid id and `sprites.idle` or `spritesheetPath`;
  asset paths are relative to the pet folder.

## Invariants

- Sprite timers, widgets, image ids, and footer state have one runtime owner.
- A completed turn replaces provisional status.
- Side-session state has a deliberate transfer boundary to the parent thread.
- Published package contents must include the extension, source, skill,
  examples, and required notices declared by `package.json`.

## Acceptance

- `mise run check` passes the fast package gate.
- `mise run verify` passes package and E2E smoke coverage.
- `node tests/e2e/package-smoke.mjs --isolated` verifies the packed boundary.
- Focused tests cover lifecycle, imports, hidden context, rendering, and
  command behavior.
