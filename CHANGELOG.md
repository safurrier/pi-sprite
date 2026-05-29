# Changelog

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
