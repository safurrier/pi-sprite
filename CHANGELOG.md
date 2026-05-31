# Changelog

## 1.6.0 - Native Petdex image rendering

- Added a native Petdex renderer that extracts full sprite-sheet frames as PNGs
  and renders them through Pi's TUI `Image` component on Kitty/iTerm2-compatible
  terminals.
- Preserved the full Petdex frame box for native image pets so small and large
  modes scale display size without cropping sprite content.
- Added native frame caching under
  `~/.pi/agent/pokepet-cache/petdex-native/<slug>/<hash>/`.
- Kept the ANSI truecolor half-block renderer as the fallback for terminals
  without Pi native image support, including Windows Terminal in this version.
- Moved ASCII and ANSI fallback output to component widgets so large pets are not
  cut off by Pi's plain string-widget line cap.
- Increased ANSI fallback detail budgets for small and large Petdex pets now
  that fallback rendering is no longer constrained by the plain string-widget
  cap.
- Changed `NO_COLOR` behavior so native image rendering still works when
  available; only ANSI fallback color output is blocked.
- Added native renderer/widget tests for PNG extraction, Kitty/iTerm2 image
  sequences, unsupported-terminal fallback detection, and display budgets.
- Added `@earendil-works/pi-tui` as a direct runtime dependency.

## 1.5.0 - Petdex image pets

- Added `/pet` as the new command surface and removed `/pokemon` registration.
- Added Petdex image mode with `/pet style image`, local `~/.codex/pets`
  discovery, `/pet gallery [query]`, and `/pet install <slug>`.
- Added ANSI truecolor half-block rendering for Petdex 8-column x 9-row sprite sheets, with
  cached frame conversion under `~/.pi/agent/pokepet-cache/petdex/`.
- Improved Petdex render clarity by cropping transparent sprite padding and
  using nearest-neighbor scaling instead of smooth downsampling.
- Prevented pet truncation by making Petdex frame width responsive to the
  current terminal, wrapping status text, and falling back from large ASCII art
  to compact ASCII art when the terminal is too narrow.
- Added a row budget for Petdex image pets so tall sprites like `steve-jobs`
  and `noir-webling` fit inside Pi's below-editor widget instead of being
  clipped vertically.
- Preserved the original Pokemon ASCII roster behind `/pet style ascii`, with
  the existing compact and large modes.
- Migrated persisted state from legacy `monKey` to `style`, `asciiPetKey`, and
  `imagePetSlug`.
- Added tests for Petdex metadata validation, sprite rendering, mood mapping,
  state migration, and mocked gallery install.

## 1.4.1

- Replaced the generic working-line text with pet-aware, repo-aware messages so Pi feels more like a playful coding companion during active work.
- Improved contrast on the working/status text so it reads more clearly in the terminal UI.

## 1.4.0 — detailed mode

### Added

- **`/pokemon large` — detailed art mode.** Switch the footer pet from the
  compact 3-line sprite to big, hand-drawn, fully animated line art. The default
  stays compact, so existing behavior is unchanged — large is strictly opt-in.
  - `/pokemon large` enlarges your current partner.
  - `/pokemon large <name>` switches to and previews a specific Pokémon.
  - `/pokemon small` (alias `compact`) returns to the compact pet.
  - `large`/`big` and `small`/`compact` aliases both work.
- **Detailed sprites for all 7 Pokémon**, each 15–16 lines with distinctive,
  recognizable features: Pikachu (ears, cheeks, zig-zag tail), Charmander
  (snout, belly, flame tail), Squirtle (hexagon shell, curled tail), Bulbasaur
  (ears, wide smile, back bulb), Eevee (fox ears, fluffy ruff, bushy tail),
  Jigglypuff (round body, hair curl), Psyduck (three sprigs, hands-to-head).

### Behavior

- Detailed mode reuses the **same** `tick()`→`render()` animation loop, mood
  eyes, energy-gated sway, and accents as the compact sprite, so it blinks,
  bobs (working), dances (happy), jitters (panic), naps with `z` (sleep), and
  stands guard with `☕` — identical to before, just bigger.
- Render size is tracked in `state.size` (`"small"` | `"large"`), defaulting to
  `"small"` each session.

### Compatibility

- Cross-terminal safe on **macOS, Windows, and Linux**: the body uses only
  box-drawing + ASCII characters (no wide emoji inside the art, which would tear
  column alignment), eye glyphs reuse the set the compact mode already ships,
  and `NO_COLOR` is honored.

### Internal

- New `extensions/sprites.ts` holds the large art map + animated frame builder.
- `extensions/mons.ts` now exports `EYES`, `WEAK_EYES`, and `THOUGHTS` so both
  the compact and detailed renderers share one animation vocabulary.

## 1.3.1

- Switch to secure, passwordless NPM OIDC Trusted Publishing to bypass 2FA safely.
- Enhanced release checks script to automatically bypass on pure CI/CD or chore Pull Requests.

## 1.3.0

- Added automated package version bump validation check.
- Added automated CHANGELOG.md modification verification check.

## 1.2.0 — keep-awake

- **Keep your system awake:** `/pokemon awake [reason]` stops the machine from
  sleeping while something runs in the background — cross-platform with no
  dependencies (macOS `caffeinate`, Linux `systemd-inhibit`, Windows
  `SetThreadExecutionState`). Release with `/pokemon sleep` (and the pet naps).
- The inhibitor is tied to pi's PID, so the lock auto-releases if pi exits or
  crashes — the system is never left awake forever.
- New vigilant **guard** mood (☕) shown while keep-awake is active; the pet
  refuses to sleep and a persistent `☕ awake` marker appears on the meter.

## 1.1.0 — reactive update

- **Real "thinking" mood:** splits the model stream by event type, so reasoning
  (`thinking_*`) now floats with a 💭 thought bubble — distinct from talking
  (`text_*`) and tool-call composing (`toolcall_*`).
- **Lively body animation:** beyond the eyes, the body now moves per mood —
  working bobs, happy dances side to side, panic jitters, thinking floats.
- **MCP reactions:** detects MCP tool calls (server-prefixed names like
  `firecrawl_*`, `linear_*`, and the `mcp` gateway) with their own line.
- **Accurate subagents:** subagent dispatch is now detected from the
  `subagent`/`task` tool call (was incorrectly firing on every prompt).
- **Feeding matters:** low energy droops the eyes, damps motion, and sends the
  pet to sleep sooner; full energy unlocks the wider, bouncier dance.
- **No more dozing mid-run:** the pet stays animated for the full duration of a
  long-running tool (bash/tests) instead of reverting to idle.

## 1.0.0 — final release

- README: full roster gallery showing every Pokémon's ASCII art with its type
  color, plus a colored banner image.
- Cross-platform: normalize Windows path separators in file-type detection so
  directory-based reactions (e.g. `tests/`) work on Windows as well as
  macOS/Linux. Uses only Node builtins — runs on macOS, Linux, and Windows.

## 0.1.0 — initial release

- 7 Pokémon companions: Pikachu, Charmander, Squirtle, Bulbasaur, Eevee,
  Jigglypuff, Psyduck — each with its own color, type, and personality lines.
- 7 animated moods (appear / talk / work / celebrate / panic / sleep).
- Spinning Poké Ball working indicator.
- Reacts to tools: tests, git (commit/push/pull/merge/rebase/stash/checkout),
  build, lint, install, dev-server, docker, network, search, dangerous commands.
- Reacts to PRs & reviews (`gh pr create/merge/review`, review/diff tools).
- Reacts to pi advanced features: subagents, model swaps, thinking-level changes,
  session forks, and compaction.
- File-aware (filename + type) and time-aware (morning/evening/late-night/weekend).
- Flow-state and struggle/redemption detection.
- Energy meter (`♥`) restored with `/pokemon feed`.
- Cross-session memory with bond tiers (stranger → bestie) and `/pokemon stats`.
- `/pokemon` command suite: list, choose, nick, feed, stats, hide, show.
