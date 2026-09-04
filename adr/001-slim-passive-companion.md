# Keep pi-sprite a slim passive companion

Status: Accepted
Date: 2026-06-17

## Context

The repository inherited a broader pet application, including Electron,
keep-awake, and gamified paths. The initial pi-sprite implementation and
non-feature tests removed that direction. PR [#1](https://github.com/safurrier/pi-sprite/pull/1)
merged the slim MVP at `8c5edde3e677f862760a23da405dbe7dcbdde6a6`.

## Decision

Keep the product inside Pi's extension lifecycle. It supplies a small sprite,
explicit commands, overlays, and status lines. It does not add autonomous
personality, sound, a pet economy, process management, desktop windows, or a
large dashboard.

## Consequences

Feature requests that need an independent runtime are out of scope. The
non-feature regression test and `SPEC.md` protect this boundary. This rejects
the earlier Electron and gamification direction visible before the slim MVP.
