# pi-sprite

**When a user corrects you or provides tribal knowledge or a gotcha that is not
visible in code or the prompt, document it in the nearest `AGENTS.md` before
continuing.**

`pi-sprite` is a Pi package. `extensions/index.ts` registers `/pet`,
`/context`, `/recap`, and `/btw`; the runtime remains a small passive terminal
companion rather than a standalone pet application.

## How to Work Here

Use focused Node tests while iterating. Run `mise run check` before handoff;
run `mise run verify` for UI, lifecycle, package, CI, or E2E changes.

## Commands

- **Setup**: `mise run setup`.
- **Focused test**: `node --test --import tsx tests/<area>.test.ts`.
- **Fast gate**: `mise run check`.
- **Full verification**: `mise run verify`.
- **Package smoke**: `node tests/e2e/package-smoke.mjs --isolated`.
- **Docs build**: `uvx --with mkdocs-material mkdocs build --strict`.

## Gotchas

- **DO** preserve the non-features in `README.md` and
  `tests/non-features.test.ts`. **NOT** add autonomous personality, sound,
  pet economy, process management, large dashboards, or desktop behavior.
  **BECAUSE** the package is a small passive companion.

- **DO** keep widget rendering, timers, native image ids, and footer state in
  the sprite runtime and lifecycle hooks. **NOT** bypass cleanup from command
  or side-session code. **BECAUSE** stale resources create duplicate sprites,
  ghosted terminal images, and stale footer state.

- **DO** parse `/pet` in `src/sprite/commands.ts` and keep downloads behind the
  shared import policy. **NOT** put command UX, Petdex lookup, or direct fetches
  in `src/sprite/runtime.ts`. **BECAUSE** command changes must not weaken
  lifecycle or import safety.

- **DO** use Kitty/Ghostty placeholder rendering by default and
  `PI_SPRITE_NATIVE_IMAGES=0` for ANSI. **NOT** assume direct image placement
  is safe in tmux. **BECAUSE** placeholders move with the TUI grid.

- **DO** run recap and BTW through isolated Pi side sessions and register their
  entries in `src/agent/session-entries.ts`. **NOT** require normal users to
  supply API keys or let hidden side work enter main context. **BECAUSE** Pi's
  active model is reused without silent context pollution.

- **DO** keep contextual BTW as a child fork with explicit status and refresh.
  **NOT** reduce it to prompt-only completion or silently synchronize parent
  progress. **BECAUSE** it must be independent while preserving deliberate
  transfer boundaries.

- **DO** treat pet `personality` as untrusted style metadata for explicit BTW
  replies. **NOT** feed it into recap, status, lifecycle hooks, or main-thread
  commentary. **BECAUSE** personality is bounded expression, not an agent
  persona.

- **DO** verify packaged resources through `package.json`, `tests/skill.test.ts`,
  and package smoke. **NOT** assume a repository path ships. **BECAUSE** Pi
  discovery sees only packed files.

- **DO** keep Ghostty demo captures attached to a live terminal or detach them
  cleanly. **NOT** kill the attached tmux server to end a recording. **BECAUSE**
  its Ghostty tab disappears too.

- **DO** give `/pet import` an expanded absolute local folder. **NOT** use `~`.
  **BECAUSE** slash-command arguments do not receive shell expansion.

- **DO** keep HK validation contracts in `.harness/profiles/pi-sprite-root.toml`
  and routing in `.harness/system.toml`. **NOT** duplicate contract policy in the
  system map. **BECAUSE** profiles own validation semantics.

## Related Context

| Path | What's there |
|---|---|
| `SPEC.md` | Current correctness envelope and acceptance evidence. |
| `adr/` | Lasting decisions with historical rationale. |
| `docs/AGENTS.md` | Documentation routing and published-doc ownership. |
| `.harness/profiles/pi-sprite-root.toml` | HK validation contract. |
| `skills/pi-sprite-authoring/SKILL.md` | Shipped custom-pet workflow. |

<!-- generated-by: context-engineering@2.6.5 | last-updated: 2026-08-29 -->
