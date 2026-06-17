# pi-sprite Implementation Spec

## Status

Drafted from the product handoff and research pass on 2026-06-17.

Research workspace used while drafting:

```text
/tmp/pi-sprite-research.xm3sxJ
```

Primary references inspected:

- `djdiptayan1/pi-pokepet` — sprite, Petdex, widget, and renderer substrate.
- `dbachelder/pi-btw` — real side-session implementation for `/btw`.
- `@tifan/pi-recap` — slim on-demand recap behavior.
- `pi-context` and `pi-context-viz` — context usage APIs and TUI visualizer patterns.
- `@codexstar/pi-pompom` — anti-pattern / feature-bloat reference.
- Pi docs for extensions, packages, TUI widgets, overlays, and `ctx.getContextUsage()`.

## Product target

`pi-sprite` is a standalone repository and Pi package. It should be developed in its own repo first, then installed into dots from that repo once package-level validation passes.

Recommended repository flow:

```text
safurrier/pi-sprite             # source package repo
~/worktrees/pi-sprite           # implementation checkout
dots                            # consumes pi-sprite by git/npm/local package reference later
```

`pi-sprite` is a lightweight Pi package that provides:

```text
/pet      small Codex/Petdex-style sprite companion
/context  Claude-Code-like context usage TUI
/recap    manual compact session recap
/btw      explicit side-thread questions
```

The extension must feel small, passive, and utility-first. It is not a pet simulator, desktop companion, voice assistant, dashboard suite, or autonomous agent personality.

## Hard non-goals

Do not implement:

- Electron or native floating desktop windows.
- HTTP/SSE/local server runtime.
- Voice, TTS, sounds, ambient weather, songs, mic integration.
- Hunger, feeding, bonding, XP, stats, accessories, treats, mood economy.
- Autonomous pet commentary/personality.
- 3D renderer or raymarching.
- Large always-visible dashboards.
- First-class marketplace platform for every pet gallery.

Add regression checks for these non-goals once the package is slimmed.

## Attribution and licensing

`pi-sprite` starts as a derivative of `djdiptayan1/pi-pokepet`, which is MIT licensed.

Requirements:

- Preserve the original MIT copyright notice from `pi-pokepet` in `LICENSE` while derived code remains.
- Add and maintain `NOTICE.md` crediting `pi-pokepet` as the starting point.
- When copying/adapting specific code from other references, add source comments and preserve any required license notices.
- Do not imply `pi-sprite` is affiliated with `pi-pokepet`, Petdex, Claude Code, or the referenced packages.
- Before first release, audit all copied files for license compatibility and attribution.

## Distribution strategy

Build and validate `pi-sprite` as its own package repo first. Dots should consume it only after the package repo passes the MVP validation suite.

Initial install path for dogfooding:

```bash
pi -e ~/worktrees/pi-sprite
```

Local install path for dots dogfood once stable:

```bash
pi install ~/worktrees/pi-sprite
```

Longer-term install path:

```bash
pi install git:github.com/safurrier/pi-sprite
```

Only publish to npm after the package has a stable MVP and README.

## Architecture overview

```text
pi-sprite/
├── package.json
├── extensions/
│   └── index.ts                 # registers commands/events
├── src/
│   ├── sprite/
│   │   ├── state.ts             # selected pet, visibility, current state
│   │   ├── manifest.ts          # internal/Codex manifest parsing
│   │   ├── loader.ts            # local pet discovery and activation
│   │   ├── renderer.ts          # ANSI/native image frame rendering
│   │   ├── widget.ts            # below-editor widget component
│   │   └── sources/
│   │       ├── local.ts
│   │       ├── petdex.ts
│   │       └── generic-importer.ts
│   ├── context/
│   │   ├── usage.ts             # token/category estimation
│   │   └── overlay.ts           # Claude-style context TUI
│   ├── recap/
│   │   ├── summarize.ts         # manual recap LLM call
│   │   └── overlay.ts           # recap display
│   └── btw/
│       ├── session.ts           # in-memory side session
│       ├── overlay.ts           # side thread UI
│       └── persistence.ts       # hidden thread entries
├── tests/
│   ├── unit/
│   ├── fixtures/
│   └── e2e/
└── docs/
    └── pi-sprite-implementation-spec.md
```

## Definition of done for the full implementation

The whole `pi-sprite` implementation is done when all of the following are true:

### Product behavior

- `/pet` provides a small passive sprite below the editor.
- `/pet list`, `/pet choose <id>`, `/pet import <path>`, `/pet hide`, and `/pet show` work.
- Local expanded pets and Codex/Petdex-style `pet.json + spritesheet.webp` packages import and render.
- Petdex gallery/search/preview/install works, or fails gracefully offline with cached/fallback messaging.
- `/context` opens a Claude-Code-style TUI visualizer with a grid/cell representation, model/window summary, token usage, category estimates, and free-space row.
- `/context all` expands details.
- `/recap` manually generates a structured recap with `Goal`, `State`, `Decisions`, `Files/commands`, and `Next`.
- `/btw <question>`, `/btw:new`, `/btw:clear`, `/btw:inject`, and `/btw:summarize` work; side-thread content stays out of main context until explicit injection/summarization.

### Non-goals remain absent

Runtime code does not reintroduce:

- Electron, Glimpse, native floating windows, HTTP/SSE servers, or process managers.
- Voice, TTS, sound, ambient weather, songs, or mic integration.
- Hunger, feeding, bonding, XP, stats dashboards, accessories, treats, or pet economy.
- Autonomous pet commentary/personality.
- 3D/raymarched rendering.

### Validation framework

- `mise run check` is the fast local gate and passes.
- `mise run ci` delegates to the fast gate and passes in GitHub Actions.
- `mise run verify` includes heavier package/TUI/E2E smoke validation and passes locally before merge.
- CI uploads `test-results/` and `artifacts/e2e/` when present.
- Test fixtures cover local pets, Codex/Petdex packages, malicious imports, and ZIP/URL import edge cases.

### Automated tests

- Unit tests cover sprite state transitions, manifest parsing, import security, renderer behavior, context usage/category formatting, recap prompt/sanitization, and BTW side-session persistence/injection.
- Non-feature regression tests fail if forbidden runtime concepts are reintroduced.
- Package validation passes:

```bash
npm run check
npm pack --dry-run
mise run check
```

### TUI and E2E evidence

- Manual Pi smoke passes with:

```bash
pi -e ~/worktrees/pi-sprite
```

- Tmux/TUI captures exist under `artifacts/e2e/` for:
  - default sprite render.
  - local pet import/choose/reload.
  - Codex/Petdex pet render.
  - `/context` overlay.
- E2E assertion scripts verify captures for expected text, grid/cells, category rows, and non-empty sprite frames.
- Model-backed E2E for `/recap` and `/btw` passes when `PI_SPRITE_E2E_MODEL=1` is set.
- Network-backed Petdex/import-url E2E passes when `PI_SPRITE_E2E_NETWORK=1` is set.

### Packaging and dots integration

- README documents install, commands, import/gallery, `/context`, `/recap`, `/btw`, non-features, and troubleshooting.
- `NOTICE.md` and `LICENSE` preserve required `pi-pokepet` MIT attribution while derived code remains.
- `pi install git:github.com/safurrier/pi-sprite` works from a clean environment.
- Dots consumes `pi-sprite` from this standalone repo only after package validation passes.
- Dots removes/disables conflicting old Pompom/context packages, and `/pet`, `/context`, `/recap`, `/btw` resolve to `pi-sprite` without command collisions.

## Implementation phases

Each phase should land with its own validation evidence. Do not start the dots migration until the package repo passes the package-level and Pi-level smoke tests.

---

## Phase -1 — Repository bootstrap, attribution, and validation framework

### Goal

Create the standalone `pi-sprite` repository, preserve attribution, and construct the validation framework before product implementation begins.

### Harness-scaffold validation references

Use `safurrier/harness-toolkit` as the model for validation shape, especially:

- `templates/.github/workflows/ci.yml.tmpl` — thin GitHub Actions workflow that installs tools, runs setup, delegates validation to task entrypoints, and uploads test artifacts.
- `stacks/web/project/package.json.tmpl` — stable web/TypeScript script contract: `setup`, `fmt`, `fmt:check`, `lint`, `typecheck`, `test`, `build`, `check`, `verify`.
- `stacks/web/project/vitest.config.ts` — test results written to `test-results/` for CI artifact upload.
- `.mise/tasks/check`, `.mise/tasks/ci`, `.mise/tasks/verify` — `check` is the fast local quality gate, `ci` delegates to `check`, and `verify` layers heavier validation after `check`.
- `docs/reference/stacks/web.md` — documents the task contract clearly enough for agents and humans.

Adapt the pattern rather than copying all scaffold ceremony. `pi-sprite` should use the same idea: one stable task surface, thin CI, test artifacts, and heavier/manual E2E separated from fast checks.

### Tasks

- Create GitHub repo:

```text
github.com/safurrier/pi-sprite
```

- Rename current upstream remote to preserve provenance:

```bash
git remote rename origin upstream-pi-pokepet
git remote add origin git@github.com:safurrier/pi-sprite.git
```

- Keep `upstream-pi-pokepet` as read-only reference for future attribution/diff checks.
- Add `NOTICE.md` crediting `djdiptayan1/pi-pokepet`.
- Preserve `LICENSE` with original MIT notice while derived code remains.
- Add the validation framework before feature work:

```text
.mise.toml
.mise/tasks/setup
.mise/tasks/fmt
.mise/tasks/lint
.mise/tasks/typecheck
.mise/tasks/test
.mise/tasks/build
.mise/tasks/check
.mise/tasks/ci
.mise/tasks/verify
.mise/tasks/test-e2e
.github/workflows/ci.yml
vitest.config.ts or node:test reporter setup
tests/e2e/*
artifacts/e2e/.gitkeep
test-results/.gitkeep
```

- Keep task semantics scaffold-like:

```text
mise run setup      # install dependencies
mise run fmt        # format code
mise run lint       # non-mutating lint
mise run typecheck  # static analysis
mise run test       # unit tests, writes test-results
mise run build      # package/build smoke if applicable
mise run check      # fmt-check + lint + typecheck + unit + package dry-run
mise run ci         # CI entrypoint, delegates to check
mise run test-e2e   # TUI/tmux/manual-ish E2E, env-gated where needed
mise run verify     # check + build + E2E smoke that can run in CI
```

- Add package scripts that the mise tasks delegate to:

```json
{
  "scripts": {
    "setup": "npm install",
    "fmt": "biome check --write .",
    "fmt:check": "biome check .",
    "lint": "biome lint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --reporter=default --reporter=junit",
    "build": "npm pack --dry-run",
    "test:e2e": "node tests/e2e/run-e2e.mjs",
    "check": "npm run fmt:check && npm run lint && npm run typecheck && npm test && npm run build",
    "verify": "npm run check && npm run test:e2e"
  }
}
```

If the repo stays on `node:test` instead of Vitest, keep the same script names and still write machine-readable output under `test-results/` where practical.

- Add GitHub Actions using the scaffold pattern:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  check:
    name: Quality Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v2
      - run: mise run setup
      - run: mise run ci
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: |
            test-results/
            artifacts/e2e/
          if-no-files-found: ignore
  verify:
    name: Full Validation
    runs-on: ubuntu-latest
    needs: [check]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v2
      - run: mise run setup
      - run: mise run verify
```

- Keep CI E2E realistic but not flaky:
  - Unit and package checks always run.
  - Noninteractive command-level smoke can run in CI.
  - Tmux/TUI capture runs where terminal dependencies are available.
  - Model-backed `/recap` and `/btw` tests are env-gated with `PI_SPRITE_E2E_MODEL=1`.
  - Network-backed gallery/import-url tests are env-gated with `PI_SPRITE_E2E_NETWORK=1`.
- Add first validation helpers:

```text
tests/e2e/pi-command.mjs
tests/e2e/tmux-smoke.sh
tests/e2e/assert-capture.mjs
tests/e2e/assert-context-overlay.mjs
```

- Add fixture directories:

```text
tests/fixtures/pets/
tests/fixtures/import/
tests/fixtures/zips/
artifacts/e2e/.gitkeep
test-results/.gitkeep
```

- Add a non-goal regression check script:

```text
tests/non-features.test.ts
```

It should fail if runtime code reintroduces forbidden concepts such as Electron, voice, TTS, ambient weather, feeding, hunger, treats, XP, stats dashboards, or process managers.

### Acceptance criteria

- New GitHub repo exists and local `origin` points to it.
- Original `pi-pokepet` remote is retained as `upstream-pi-pokepet`.
- `NOTICE.md` credits `pi-pokepet`.
- License notice is preserved.
- Validation scripts exist and can run, even if some are initially smoke-only.
- `mise run check` is the fast local quality gate.
- `mise run ci` delegates to the same fast gate.
- `mise run verify` includes heavier package/TUI/E2E smoke validation.
- GitHub Actions delegates to mise instead of duplicating validation logic.
- CI uploads `test-results/` and `artifacts/e2e/` when present.
- E2E artifact directory exists.

### Automated validation

```bash
git remote -v
node -e "const p=require('./package.json'); for (const s of ['setup','fmt','fmt:check','lint','typecheck','test','build','check','verify']) if (!p.scripts?.[s]) process.exit(1)"
test -f NOTICE.md
test -f LICENSE
test -f .mise.toml
test -f .github/workflows/ci.yml
test -d tests/e2e
test -d artifacts/e2e
test -d test-results
mise run check
```

### CI validation

After first push, confirm GitHub Actions runs:

```bash
gh run list --repo safurrier/pi-sprite --limit 5
gh run view --repo safurrier/pi-sprite --log
```

Expected:

- Quality Gate passes.
- Test artifact upload step runs, even if no artifacts are present yet.
- Full Validation runs on pull requests.

### Manual validation

```bash
gh repo view safurrier/pi-sprite --json nameWithOwner,url,visibility
git ls-remote origin HEAD
git ls-remote upstream-pi-pokepet HEAD
```

Expected:

- `origin` resolves to `safurrier/pi-sprite`.
- `upstream-pi-pokepet` resolves to `djdiptayan1/pi-pokepet`.

---

## Phase 0 — Repo setup and aggressive slimming

### Goal

Turn the `pi-pokepet` fork into a valid, slim `pi-sprite` Pi package with one extension entrypoint and no heavy runtime.

### Tasks

- Rename package and metadata:
  - `name`: `pi-sprite`
  - widget key: `pi-sprite`
  - state/cache dirs under `~/.pi/agent/pi-sprite/`
- Keep from `pi-pokepet` where useful:
  - package shape
  - `/pet` registration pattern
  - `ctx.ui.setWidget(..., { placement: "belowEditor" })`
  - Petdex manifest validation ideas
  - ANSI/native image rendering ideas
- Remove:
  - `electron-*` files and dependency
  - `scripts/cli.js` process manager behavior unless needed only for package metadata
  - keep-awake code
  - feed/sleep/stats/energy/bond/personality
  - process list/kill commands
  - random quotes/autonomous commentary
- Add `docs/NON_FEATURES.md` or README non-features section.
- Add a minimal static default sprite/fallback.

### Acceptance criteria

- Pi starts with `pi -e .` and no extension errors.
- `/pet` exists.
- Static default sprite appears below editor.
- No Electron, server, or background process starts.
- Package manifest exposes only the intended Pi extension.

### Automated validation

```bash
npm install
npm run typecheck
npm test
npm pack --dry-run
rg -n "electron|glimpse|voice|tts|ambient|weather|feed|hunger|treat|accessor|bond|xp|stats|server|sse" extensions src package.json README.md docs || true
```

The grep is expected to find only non-feature documentation or tests, not runtime implementation.

### Manual Pi validation

```bash
cd ~/worktrees/pi-sprite
pi -e .
```

In Pi:

```text
/pet
/pet hide
/pet show
/reload
```

Process check from another shell:

```bash
ps aux | rg -i 'electron|glimpse|pompom|pokepet|pi-sprite.*server|sse'
```

Expected: no extension-owned Electron/server process.

### Tmux capture validation

```bash
tmux new-session -d -s pi-sprite-phase0 'cd ~/worktrees/pi-sprite && pi -e .'
sleep 4
tmux send-keys -t pi-sprite-phase0 '/pet show' Enter
sleep 1
tmux capture-pane -p -e -t pi-sprite-phase0 > artifacts/e2e/phase0-pet-show.ansi
tmux capture-pane -p -t pi-sprite-phase0 > artifacts/e2e/phase0-pet-show.txt
rg -n 'pi-sprite|sprite|pet|idle|show' artifacts/e2e/phase0-pet-show.txt
```

The text capture should show the command response and/or default sprite label. The ANSI capture should be kept as visual evidence.

---

## Phase 1 — Minimal sprite runtime

### Goal

Render a reliable below-editor companion with a small state machine.

### Tasks

- Implement sprite runtime state:

```text
idle
thinking
working
success
error
```

- Subscribe to minimal events:

```text
session_start -> idle
agent_start -> thinking
message_update thinking -> thinking
tool_execution_start -> working
tool_result error -> error
tool_result ok -> working/idle
agent_end -> success briefly, then idle
session_shutdown -> cleanup
```

- Update widget only when state/render signature changes.
- Use only short reset timeout for `success`/`error`.
- Clear timers on shutdown.

### Acceptance criteria

- Sprite state changes while Pi thinks and runs tools.
- Failed tool result shows error state.
- Success/error returns to idle.
- No persistent animation interval is required for MVP.

### Unit tests

- `state.transition.test.ts`
  - session start initializes idle.
  - agent start sets thinking.
  - tool start sets working.
  - failure sets error.
  - agent end sets success then reset schedules idle.
- `widget.test.ts`
  - hidden clears widget.
  - repeated state does not re-render.
  - output respects narrow width.
  - shutdown clears timers.

### Automated validation

```bash
npm run typecheck
npm test -- --test-name-pattern='sprite|widget|state'
```

### Manual Pi validation

In Pi:

```text
/pet show
run a prompt that reads a small file
run a prompt that executes a failing command like `false`
```

Expected transitions:

```text
idle -> thinking -> working -> success -> idle
idle -> thinking -> working -> error -> idle
```

### Tmux capture validation

Capture before/during/after a known command:

```bash
tmux capture-pane -p -e -t pi-sprite-phase1 > artifacts/e2e/phase1-idle.ansi
tmux send-keys -t pi-sprite-phase1 'run bash false to test error state' Enter
sleep 2
tmux capture-pane -p -e -t pi-sprite-phase1 > artifacts/e2e/phase1-error.ansi
sleep 4
tmux capture-pane -p -e -t pi-sprite-phase1 > artifacts/e2e/phase1-reset.ansi
```

Normalize captures for CI-style assertions:

```bash
node tests/e2e/assert-capture.mjs artifacts/e2e/phase1-error.ansi --contains error
node tests/e2e/assert-capture.mjs artifacts/e2e/phase1-reset.ansi --contains idle
```

---

## Phase 2 — Local pet format and persistence

### Goal

Users can list, choose, import, and persist simple local pets.

### Internal format

Managed directory:

```text
~/.pi/agent/pi-sprite/pets/<id>/
  pet.json
  idle.png
  thinking.png
  working.png
  success.png
  error.png
```

Minimal manifest:

```json
{
  "id": "boba",
  "name": "Boba",
  "version": "1.0.0",
  "author": "local",
  "sprites": {
    "idle": "idle.png",
    "thinking": "thinking.png",
    "working": "working.png",
    "success": "success.png",
    "error": "error.png"
  },
  "frame": {
    "width": 64,
    "height": 64
  }
}
```

### Tasks

- Implement local source discovery.
- Implement manifest parser and sanitizer.
- Implement commands:

```text
/pet list
/pet choose <id>
/pet import <path>
```

- Persist selected pet and visibility in:

```text
~/.pi/agent/pi-sprite/state.json
```

### Acceptance criteria

- User can place a pet folder under the managed directory.
- `/pet list` shows it.
- `/pet choose boba` activates it.
- `/pet import ./path` copies it into the managed directory.
- Selected sprite persists after restart/reload.
- Missing state image falls back to idle.

### Unit tests

Fixtures:

```text
tests/fixtures/pets/valid-expanded/
tests/fixtures/pets/missing-optional-state/
tests/fixtures/pets/bad-manifest/
tests/fixtures/pets/unsafe-id/
```

Test cases:

- valid expanded pet loads.
- unknown state falls back to idle.
- invalid ID normalizes or rejects consistently.
- bad manifest gives actionable error.
- state persists and reloads.

### Automated validation

```bash
PI_SPRITE_HOME=$(mktemp -d) npm test -- --test-name-pattern='local|manifest|persistence'
npm run typecheck
```

### Manual Pi validation

```bash
PI_SPRITE_HOME=$(mktemp -d) pi -e .
```

In Pi:

```text
/pet import ./tests/fixtures/pets/valid-expanded
/pet list
/pet choose valid-expanded
/reload
/pet list
```

Expected: `valid-expanded` remains selected.

### Tmux capture validation

```bash
tmux new-session -d -s pi-sprite-phase2 'cd ~/worktrees/pi-sprite && PI_SPRITE_HOME=$(mktemp -d) pi -e .'
sleep 4
tmux send-keys -t pi-sprite-phase2 '/pet import ./tests/fixtures/pets/valid-expanded' Enter
sleep 1
tmux send-keys -t pi-sprite-phase2 '/pet choose valid-expanded' Enter
sleep 1
tmux capture-pane -p -e -t pi-sprite-phase2 > artifacts/e2e/phase2-valid-expanded.ansi
node tests/e2e/assert-capture.mjs artifacts/e2e/phase2-valid-expanded.ansi --contains valid-expanded
```

---

## Phase 3 — Codex/Petdex package import

### Goal

Support the common Codex/Petdex package shape:

```text
pet.json
spritesheet.webp
```

### Tasks

- Adapt `pi-pokepet` manifest validation and sprite-sheet rendering.
- Support Codex fields:

```json
{
  "id": "happy-dog",
  "displayName": "Happy Dog",
  "description": "A cheerful pixel dog.",
  "spritesheetPath": "spritesheet.webp"
}
```

- Extract/generate frames with `sharp`.
- Cache generated frames under:

```text
~/.pi/agent/pi-sprite/cache/
```

- Map Codex/Petdex states:

```text
idle -> idle
waiting/review -> thinking
running/runRight/runLeft -> working
jump/wave -> success
failed -> error
```

### Acceptance criteria

- Codex/Petdex package imports successfully.
- Imported package appears in `/pet list`.
- Imported package can be selected.
- At least idle renders correctly.
- Invalid sprite sheets fail cleanly.

### Unit tests

Fixtures:

```text
tests/fixtures/pets/codex-valid/
tests/fixtures/pets/codex-missing-spritesheet/
tests/fixtures/pets/codex-absolute-spritesheet/
tests/fixtures/pets/codex-traversal-spritesheet/
tests/fixtures/pets/codex-bad-atlas/
```

Test cases:

- Codex manifest parses.
- spritesheet path traversal rejected.
- bad atlas dimensions rejected.
- generated frames are cached.
- state mapping produces all internal states.

### Automated validation

```bash
PI_SPRITE_HOME=$(mktemp -d) npm test -- --test-name-pattern='codex|petdex|spritesheet|renderer'
npm run typecheck
```

### Manual Pi validation

```text
/pet import ./tests/fixtures/pets/codex-valid
/pet choose codex-valid
```

### Visual/tmux validation

```bash
tmux capture-pane -p -e -t pi-sprite-phase3 > artifacts/e2e/phase3-codex-valid.ansi
node tests/e2e/assert-ansi-frame.mjs artifacts/e2e/phase3-codex-valid.ansi --min-colored-cells 20
```

The `assert-ansi-frame` helper should strip control sequences enough to confirm that a non-empty frame rendered, and optionally count truecolor/SGR sequences for image-backed pets.

---

## Phase 4 — Secure generic importer

### Goal

Make imports safe before URL/ZIP/gallery installs.

### Tasks

- Implement `GenericCodexImporter`.
- Validate:
  - no absolute paths
  - no `..` segments
  - no symlinks escaping source
  - allowed extensions only:

```text
.json .png .webp .gif .jpg .jpeg .txt .md
```

- Enforce:
  - max file count
  - max individual file size
  - max total uncompressed size
  - sanitized lowercase kebab-case IDs
- Copy into temp dir first; validate; atomically move into managed dir.
- Never execute imported files.

### Acceptance criteria

- Path traversal is rejected.
- Huge files are rejected.
- Executable files are rejected.
- Valid local expanded and Codex packages still import.

### Unit/security tests

Fixtures:

```text
tests/fixtures/import/path-traversal/
tests/fixtures/import/absolute-path/
tests/fixtures/import/executable-file/
tests/fixtures/import/huge-file/
tests/fixtures/import/too-many-files/
tests/fixtures/import/duplicate-normalized-id/
```

Automated:

```bash
PI_SPRITE_HOME=$(mktemp -d) npm test -- --test-name-pattern='importer|security|traversal|size'
```

Manual:

```text
/pet import ./tests/fixtures/import/path-traversal
/pet import ./tests/fixtures/pets/valid-expanded
```

Expected: unsafe import fails; safe import succeeds.

---

## Phase 5 — `/context` Claude-style TUI visualizer

### Goal

Implement `/context` as a visual TUI representation similar to Claude Code’s context screen, not just a text bar.

Target feel from the reference screenshot:

```text
/context
└ Context Usage
  [grid/cells showing used vs free context]

  Model Name (context window)
  30.3k/1m tokens (3%)

  Estimated usage by category
  ◉ System prompt: 2.3k tokens (0.2%)
  ◉ System tools: 2.7k tokens (0.3%)
  ◉ Custom agents: 61 tokens (0.0%)
  ◉ Memory files: 12.4k tokens (1.2%)
  ◉ Skills: 12.7k tokens (1.3%)
  ◌ Messages: 8 tokens (0.0%)
  □ Free space: 969.7k (97.0%)

  MCP tools · /mcp
  └ 48 tools · 0 tokens

  Custom agents · /agents
  └ 1 agent · 61 tokens

  Memory files · /memory
  └ 5 files · 12.4k tokens

  Skills · /skills
  └ 126 skills · 12.7k tokens

  /context all to expand
```

### Scope for v0

Implement the visual overlay and best-effort category estimation. Do not require perfect Claude-category parity if Pi does not expose exact resource-category token accounting.

### Tasks

- Register:

```text
/context
/context all
```

- Use `ctx.getContextUsage()` for authoritative total/window/percent.
- Estimate categories from available Pi APIs and session state:
  - system prompt: `ctx.getSystemPrompt()` estimated tokens.
  - system tools: `pi.getActiveTools()` + `pi.getAllTools()` serialized definitions estimated tokens.
  - messages: current branch user/assistant/tool messages estimated tokens.
  - compactions/branch summaries if present.
  - custom entries if present.
  - free space: context window minus actual total.
- If Pi exposes resource metadata for skills/prompts/agents/memory in the future, split those out. Until then:
  - parse clearly identifiable system-prompt sections if stable.
  - otherwise place unclassified system-prompt content under `System prompt`.
- Render a non-dashboard but rich TUI overlay using `ctx.ui.custom(..., { overlay: true })`.
- Include:
  - context cell grid.
  - model name/window.
  - token total and percentage.
  - category legend.
  - compact lower sections for MCP/tools/agents/memory/skills when count data is available.
  - help line: `Esc close`, `/context all` for expanded details.
- Add fallback notification when usage is unavailable.

### Acceptance criteria

- `/context` opens a TUI overlay, not a plain notification.
- The overlay includes a grid/cell visual representation.
- It shows model, total tokens, context window, and percent.
- It shows category estimates and free space.
- It adapts to narrow terminals.
- `Esc` closes the overlay.
- `/context all` expands category details.
- It fails gracefully when context usage is unavailable.

### Unit tests

- `context/usage.test.ts`
  - formats `30.3k/1m` style tokens.
  - computes free space from authoritative total/window.
  - status thresholds.
  - category percentages sum within tolerance.
  - handles missing usage.
- `context/overlay.test.ts`
  - renders grid at normal width.
  - renders compact mode at narrow width.
  - includes category labels.
  - clamps line width.
  - escape closes.
- `context/category-estimator.test.ts`
  - estimates system prompt.
  - estimates active tool definitions.
  - estimates branch messages.
  - handles custom/compaction entries.

### Automated validation

```bash
npm test -- --test-name-pattern='context|usage|overlay'
npm run typecheck
```

### Manual Pi validation

In Pi:

```text
/context
/context all
```

Expected:

- Visual grid appears.
- Category legend appears.
- Percent and tokens match the footer/context usage within a reasonable tolerance.
- `Esc` closes.

### Tmux capture validation

```bash
tmux new-session -d -s pi-sprite-context 'cd ~/worktrees/pi-sprite && pi -e .'
sleep 4
tmux send-keys -t pi-sprite-context '/context' Enter
sleep 1
tmux capture-pane -p -e -t pi-sprite-context > artifacts/e2e/context-overlay.ansi
tmux capture-pane -p -t pi-sprite-context > artifacts/e2e/context-overlay.txt
rg -n 'Context Usage|Estimated usage|Free space|tokens|/context all' artifacts/e2e/context-overlay.txt
node tests/e2e/assert-context-overlay.mjs artifacts/e2e/context-overlay.txt
```

`assert-context-overlay.mjs` should verify:

- title contains `Context Usage`.
- token line matches `/[0-9.]+[kKmM]?\/[0-9.]+[kKmM]? tokens/` or equivalent.
- at least 5 category rows are visible.
- grid/cell area contains repeated cell glyphs.
- no rendered line exceeds terminal width after ANSI stripping.

---

## Phase 6 — Manual `/recap`

### Goal

Add a useful manual recap command without always-visible panels or idle timers.

### Tasks

- Register:

```text
/recap
```

- Follow `@tifan/pi-recap` patterns:
  - `buildSessionContext(...)`
  - `convertToLlm(...)`
  - `serializeConversation(...)`
  - `complete(...)`
- Prompt for structured output:

```text
Goal: ...
State: ...
Decisions: ...
Files/commands: ...
Next: ...
```

- Use current model by default; add optional config later only if needed.
- Render in a small overlay or markdown component.
- Persist latest recap as a custom state entry if useful, but do not inject it into normal LLM context.

### Acceptance criteria

- `/recap` returns structured recap with required fields.
- It uses active branch context, not terminal scrollback.
- It does not auto-run.
- It does not show an always-visible recap panel.
- It handles no-model/no-auth gracefully.

### Unit tests

- prompt builder includes required fields.
- conversation extraction excludes excessive tool-result spam.
- sanitizer strips code fences and extra labels.
- empty session returns friendly message.
- no auth returns actionable message.

### Automated validation

```bash
npm test -- --test-name-pattern='recap|summarize'
npm run typecheck
```

### Manual Pi validation

```text
/recap
```

Expected:

```text
Goal: ...
State: ...
Decisions: ...
Files/commands: ...
Next: ...
```

### Model-backed E2E validation

Gate this behind explicit env vars so CI/local can skip when no model credentials exist:

```bash
PI_SPRITE_E2E_MODEL=1 node tests/e2e/pi-command.mjs --command '/recap' --expect 'Goal:' --expect 'Next:'
```

---

## Phase 7 — Petdex gallery/search/install

### Goal

Add gallery support after the local importer and Codex package support are solid.

### Tasks

- Implement source abstraction:

```ts
interface PetSource {
  id: string;
  name: string;
  list?(query?: string): Promise<GalleryPet[]>;
  get?(slug: string): Promise<GalleryPet>;
  install?(slug: string, destination: string): Promise<InstalledPet>;
}
```

- Implement:
  - `LocalSource`
  - `PetdexSource`
  - `GenericCodexImporter`
- Add commands:

```text
/pet gallery
/pet search <query>
/pet preview <slug>
/pet install <slug>
```

- Prefer direct Petdex manifest if stable.
- Fallback to installed CLI or `npx -y codex-pets` only if needed.
- Cache manifest briefly.
- Treat gallery metadata as untrusted.

### Acceptance criteria

- `/pet gallery` shows text list.
- `/pet search cat` filters.
- `/pet preview boba` shows details.
- `/pet install boba` installs into managed local dir.
- Installed pet appears in `/pet list` and can be chosen.
- Offline failure is useful.

### Unit tests

- manifest maps to `GalleryPet`.
- search filters safely.
- installed status marks local pets.
- install normalizes through importer.
- network failure uses cache or gives friendly error.

### Automated validation

```bash
npm test -- --test-name-pattern='gallery|petdex-source|search|install'
npm run typecheck
```

### Manual Pi validation

```text
/pet gallery
/pet search cat
/pet preview boba
/pet install boba
/pet choose boba
```

### Networked E2E validation

Gate behind env var:

```bash
PI_SPRITE_E2E_NETWORK=1 node tests/e2e/petdex-install.mjs --slug boba
```

Expected artifacts:

```text
artifacts/e2e/petdex-gallery.txt
artifacts/e2e/petdex-install.txt
artifacts/e2e/petdex-boba.ansi
```

---

## Phase 8 — `/btw` slim side thread

### Goal

Implement side questions without polluting the main session.

### Design choice

Use `pi-btw` as the architectural reference. Do not re-invent the hard parts.

Keep for v0:

- real in-memory side session.
- contextual seed from current main branch.
- hidden thread persistence.
- explicit inject/summarize back into main session.
- overlay transcript.

Skip for v0:

- tangent/contextless split.
- model override.
- thinking override.
- complex in-modal slash routing.
- visible `--save` notes.

### Tasks

- Register:

```text
/btw <question>
/btw:new
/btw:clear
/btw:inject
/btw:summarize
```

- Implement side session:
  - `createAgentSession(...)`
  - `SessionManager.inMemory()`
  - initial tools: `read`, `bash`; decide later whether `edit`/`write` are safe.
- Seed contextual messages with `buildSessionContext(...)`.
- Persist hidden entries:

```text
pi-sprite:btw-entry
pi-sprite:btw-reset
```

- Filter hidden BTW entries out of main LLM context.
- Inject with `pi.sendUserMessage(...)`; use follow-up when main is busy.
- Summarize with a tools-disabled in-memory session.
- Dispose session/subscriptions on shutdown.

### Acceptance criteria

- `/btw "question"` answers in side overlay.
- BTW content does not enter main context unless explicitly injected.
- `/btw:new` starts fresh.
- `/btw:clear` clears side state.
- `/btw:inject` injects raw/distilled side content.
- `/btw:summarize` injects summary, not raw transcript.
- Side session cleans up on shutdown.

### Unit tests

Model tests after `pi-btw` style:

- creates in-memory session.
- seeds contextual messages.
- excludes visible/hidden BTW entries from main context.
- persists hidden thread entries.
- restores thread on session start.
- injects with `sendUserMessage` when idle.
- injects with `{ deliverAs: "followUp" }` when busy.
- summarize uses `tools: []`.
- dispose clears subscriptions.

### Automated validation

```bash
npm test -- --test-name-pattern='btw|side-session|inject|summarize'
npm run typecheck
```

### Manual Pi validation

```text
/btw what are the risks in this plan?
/btw:new
/btw what should we do next?
/btw:summarize
```

Before injection, ask the main agent:

```text
What did I ask in the BTW thread?
```

Expected: main agent should not know.

After `/btw:inject` or `/btw:summarize`, ask again.

Expected: main agent should know only the injected content.

### Model-backed E2E validation

```bash
PI_SPRITE_E2E_MODEL=1 node tests/e2e/btw-flow.mjs
```

Assertions:

- overlay opens.
- side answer appears.
- hidden thread state exists.
- main branch context excludes hidden thread before injection.
- main receives injected summary after summarize.

---

## Phase 9 — Generic ZIP/URL import

### Goal

Support remote/zip imports after local security validation is complete.

### Tasks

- Add:

```text
/pet import-url <url>
```

- Download to temp file.
- Enforce max download size.
- Support `.zip` and direct package asset URLs.
- Reject non-HTTPS by default unless explicit local/dev override.
- Extract with safe traversal validation.
- Reuse generic importer.

### Acceptance criteria

- Normal Codex pet ZIP imports.
- ZIP path traversal is rejected.
- Oversized ZIP is rejected.
- Missing `pet.json` is rejected.
- Download failures are friendly.

### Unit/security tests

Fixtures:

```text
tests/fixtures/zips/valid.zip
tests/fixtures/zips/zip-slip.zip
tests/fixtures/zips/huge.zip
tests/fixtures/zips/no-pet-json.zip
```

Automated:

```bash
npm test -- --test-name-pattern='zip|import-url|download'
```

### Manual/network validation

```text
/pet import-url https://example.com/pet.zip
```

Gate real network in CI/local:

```bash
PI_SPRITE_E2E_NETWORK=1 node tests/e2e/import-url.mjs --url https://...
```

---

## Phase 10 — Package readiness and dots migration

### Goal

Make `pi-sprite` usable, then retire the older/bloated Pi package setup in dots.

### Package readiness tasks

- README with:
  - features
  - gallery/import
  - commands
  - non-features
  - troubleshooting
- Add package metadata:

```json
{
  "keywords": ["pi-package", "pi-extension", "sprite", "petdex", "codex-pets"],
  "pi": {
    "extensions": ["./extensions/index.ts"]
  }
}
```

- Add `npm pack --dry-run` validation.
- Add release checklist.

### Dots migration tasks

Do this in a separate dots worktree.

- Remove/disable `@codexstar/pi-pompom`.
- Remove/disable old context package if `/context` collides.
- Add local/git/npm `pi-sprite` package config.
- Update docs/AGENTS references if needed.
- Keep migration reversible.

### Acceptance criteria

- Fresh Pi with package installed loads `pi-sprite`.
- Old Pompom commands are gone unless intentionally retained.
- No duplicate `/context` command collision.
- `/pet`, `/context`, `/recap`, `/btw` work.

### Package validation

```bash
npm install
npm run typecheck
npm test
npm pack --dry-run
pi -e .
```

### Dots validation

```bash
cd ~/worktrees/dots/<migration-worktree>
uv run pytest tests/unit/ -v
uv run ruff check .
mise run dotfiles
```

Manual Pi smoke after dots migration:

```text
/reload
/pet
/context
/recap
/btw hello
```

---

## End-to-end validation harness

Create an explicit E2E layer rather than relying only on human manual testing.

### `tests/e2e/pi-command.mjs`

Purpose:

- Spawn `pi -e .` in a pseudo-terminal.
- Send slash commands.
- Capture terminal output.
- Assert expected text.
- Store artifacts.

Suggested usage:

```bash
node tests/e2e/pi-command.mjs --command '/pet show' --expect 'pet'
node tests/e2e/pi-command.mjs --command '/context' --expect 'Context Usage'
```

### `tests/e2e/tmux-smoke.sh`

Purpose:

- Run Pi in tmux, because Pi is primarily a TUI and pane capture is closer to real use.
- Capture plain and ANSI output.
- Save artifacts for review.

Suggested usage:

```bash
bash tests/e2e/tmux-smoke.sh pet
bash tests/e2e/tmux-smoke.sh context
bash tests/e2e/tmux-smoke.sh recap
bash tests/e2e/tmux-smoke.sh btw
```

### Artifact layout

```text
artifacts/e2e/
  phase0-pet-show.txt
  phase0-pet-show.ansi
  context-overlay.txt
  context-overlay.ansi
  recap.txt
  btw-flow.txt
```

### Required E2E scenarios before declaring ready

- `pet-default-render`
  - Start Pi with extension.
  - `/pet show`.
  - Capture default sprite below editor.
- `pet-local-import`
  - Import fixture pet.
  - Choose it.
  - Reload.
  - Capture selected sprite.
- `pet-codex-import`
  - Import Codex/Petdex fixture.
  - Capture non-empty ANSI/native frame.
- `context-overlay`
  - `/context` opens visual overlay.
  - Capture includes `Context Usage`, category rows, grid/cells, token totals.
- `recap-manual`
  - Model-backed and env-gated.
  - `/recap` returns required fields.
- `btw-flow`
  - Model-backed and env-gated.
  - `/btw` answers; inject/summarize works; hidden thread does not pollute main context.

---

## Milestone cuts

### Milestone 1 — Sprite + context MVP

Phases:

```text
0, 1, 2, 5
```

Commands:

```text
/pet
/pet list
/pet choose
/pet import
/pet hide
/pet show
/context
/context all
```

### Milestone 2 — Pet ecosystem

Phases:

```text
3, 4, 7, 9
```

### Milestone 3 — Workflow commands

Phases:

```text
6, 8
```

Do `/recap` before `/btw`.

### Milestone 4 — dots migration

Phase:

```text
10
```

---

## Key decisions

1. `/context` is a TUI visualizer, not a plain text bar.
2. Start with best-effort category estimation; do not block on exact Claude category parity.
3. Use `pi-pokepet` as sprite substrate, but remove Electron/gamification aggressively.
4. Use `pi-btw` as the `/btw` architectural reference.
5. Use `@tifan/pi-recap` as the `/recap` behavioral reference.
6. Delay dots migration until the package-level E2E smoke suite passes.
