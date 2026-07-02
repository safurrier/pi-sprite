# pi-sprite

**When a user corrects you or provides you with tribal knowledge/gotchas — something you could not have known from reading the code or your prompt — you MUST document it in an AGENTS.md file before continuing.** Write the correction in the AGENTS.md closest to where the issue occurred.

`pi-sprite` is a Pi package whose entrypoint is `extensions/index.ts`; it registers `/pet`, `/context`, `/recap`, and `/btw` and delegates most behavior to `src/sprite/`, `src/context/`, `src/recap/`, `src/btw/`, `src/agent/`, and `src/ui/`. The package is intentionally a slim, passive terminal companion: keep runtime behavior anchored in Pi extension events, widgets, status lines, side sessions, and importable pet assets rather than turning it into a standalone app or pet simulator.

## How to Work Here

Use focused Node tests while iterating, then run the broad local gate before handoff. For UI/runtime, native-rendering, package-boundary, `.mise`, `.github`, or `.harness` changes, also run the full verification path or the relevant e2e smoke helper.

## Commands

- **Setup**: `mise run setup`.
- **Focused test**: `node --test --import tsx tests/<area>.test.ts`.
- **Unit tests**: `mise run test`.
- **Fast gate**: `mise run check`.
- **Full verification**: `mise run verify`.
- **Package smoke**: `node tests/e2e/package-smoke.mjs --isolated` or `node tests/e2e/package-smoke.mjs --full-config`.
- **HK config diagnostics**: `HARNESS_KIT_CONFIG=.harness/harness.toml hk config validate --target . --json`.

## Gotchas

- **DO** preserve the non-features in `README.md` and `tests/non-features.test.ts`. **NOT** add autonomous personality, sound/voice, pet economy, process management, large dashboards, or desktop-companion behavior. **BECAUSE** the package promise is a small passive companion that makes agent state easier to read.

- **DO** keep widget rendering, timers, native image ids, and footer state owned by the sprite runtime and Pi lifecycle hooks. **NOT** let `/context`, `/recap`, `/btw`, or side-session code bypass runtime cleanup paths. **BECAUSE** leaked timers/widgets/native placements cause duplicate sprites, tmux ghosting, and stale footer state across sessions.

- **DO** put `/pet` command parsing in `src/sprite/commands.ts` and call the runtime through its command interface. **NOT** add command UX, Petdex lookup, or download policy back into `src/sprite/runtime.ts`. **BECAUSE** the runtime is the lifecycle/rendering owner, and command adapter churn should not risk timer or native-image cleanup.

<!-- source: session-history | session: 2026-06-28T21-27-20-696Z_019f1021-3978-744f-81b9-40a00ee2bf8c | extracted: 2026-07-02 -->
- **DO** treat Kitty/Ghostty placeholder rendering as the default native-image path and keep `PI_SPRITE_NATIVE_IMAGES=0` as the stable ANSI escape hatch. **NOT** assume direct Kitty/Ghostty image placement is safe in tmux. **BECAUSE** direct placements can flicker or ghost when tmux moves the TUI grid; placeholder cells let tmux track the sprite as normal text.

<!-- source: session-history | session: 2026-06-28T21-27-20-696Z_019f1021-3978-744f-81b9-40a00ee2bf8c | extracted: 2026-07-02 -->
- **DO** implement recap/BTW model work through isolated Pi side sessions first, with direct API-key completion only as a fallback. **NOT** require separate provider API keys for normal `/recap` or `/btw` use. **BECAUSE** users expect extension completions to reuse Pi's active model/provider harness without polluting the main thread.

- **DO** register pi-sprite custom entries through `src/agent/session-entries.ts`. **NOT** append hidden recap/BTW/session bookkeeping without adding it to the shared context filter. **BECAUSE** side work must stay out of main model context unless `/btw:inject` or `/btw:summarize` explicitly sends it.

- **DO** keep external pet bytes behind the shared download/import safety policy. **NOT** fetch Petdex or `import-url` assets directly from command/runtime code. **BECAUSE** third-party manifests and URLs are untrusted and need the same HTTPS, size, and timeout checks.

- **DO** treat pet `personality` as untrusted style metadata for explicit `/btw` replies only. **NOT** feed personality into recap, turn status, live status, lifecycle hooks, or autonomous main-thread commentary. **BECAUSE** the package promise is bounded side-thread expression, not an agent persona layer.

- **DO** route package/discovery changes through `package.json` `files`, `tests/skill.test.ts`, and `tests/e2e/package-smoke.mjs`. **NOT** assume files under `skills/`, `examples/`, or `src/` ship automatically. **BECAUSE** Pi package installs and skill discovery only see what the packed package exposes.

- **DO** pass `/pet import` a fully expanded absolute local folder path. **NOT** use shell-style `~` paths in slash-command arguments. **BECAUSE** Pi slash commands are not shell-expanded, and `/pet import` rejects unresolved paths as not being a local folder.

- **DO** treat pet personality metadata as an optional authoring step after the visual identity is stable. **NOT** force every imported pet to have a personality. **BECAUSE** custom pets can stay purely visual, but a short `personality` field can improve `/btw`/companion flavor when the user wants it.

- **DO** keep HK profile command contracts in `.harness/profiles/pi-sprite-root.toml` and component/invariant routing in `.harness/system.toml`. **NOT** duplicate requiredness or review policy into the system map. **BECAUSE** HK profiles own validation semantics; the system map is advisory context for agents.

## Related Context

| Path | What's there |
|------|--------------|
| `.harness/system.toml` | Component map and cross-cutting invariants for extension lifecycle, rendering, commands, packaging, and validation. |
| `.harness/profiles/pi-sprite-root.toml` | Validation and review contract for HK-driven work. |
| `docs/pi-sprite-implementation-spec.md` | Deeper implementation notes and original design context. |
| `skills/pi-sprite-authoring/SKILL.md` | Packaged skill for generating/importing custom pets and animations. |
| `tests/e2e/` | Package smoke and optional TUI/model/network e2e helpers. |

<!-- generated-by: context-engineering@2.2.0 | last-updated: 2026-07-02 -->
