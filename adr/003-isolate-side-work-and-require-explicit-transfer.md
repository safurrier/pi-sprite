# Isolate side work from the main model context

Status: Accepted
Date: 2026-06-18

## Context

Recap, status, and BTW need model work without silently changing the main
conversation. PR [#6](https://github.com/safurrier/pi-sprite/pull/6) introduced
isolated BTW sessions at `8107f88411ab67dffe73fb060b82cffc3ab4ae41`; PR
[#41](https://github.com/safurrier/pi-sprite/pull/41) made contextual BTW a
persistent child session at `8e49d3f2676384db2b9a5850acef342ab6cf2d7c`.

## Decision

Run recap and status work in isolated Pi side sessions first, with direct API
completion only as a fallback. BTW uses a durable child session seeded from the
selected parent path. Hidden recap and BTW entries are filtered from main model
context. Parent progress crosses the boundary only through explicit status,
refresh, inject, or summarize commands.

## Consequences

Normal use reuses Pi's active model/provider without separate API keys. The
child can share a cwd, so it is instructed to mutate files only on explicit
request and report the result. This rejects prompt-only BTW completion and
silent parent synchronization.
