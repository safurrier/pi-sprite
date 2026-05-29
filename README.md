# pi-pokepet ⚡

A cute, colorful **Pokémon companion** for the [pi coding agent](https://pi.dev).

Pick a Pokémon and it lives below your editor, reacting in real time to what pi is
doing — running tools, writing files, running tests, opening PRs, getting reviews,
spinning up subagents, switching models, compacting, and more.

Pure ASCII + 256-color ANSI, so it looks great in **Terminal.app, Warp**, and every
other terminal — **no image/graphics protocol required**.

```
 /\_/\     Pikachu ⚡  ALL GREEN! ✦
(^o^)      ♥▓▓▓░ 78
 >⚡<
```

> **Unofficial fan project.** Pokémon and Pokémon character names are trademarks of
> Nintendo, Creatures Inc., and GAME FREAK Inc. This project is not affiliated with,
> sponsored by, or endorsed by them. All ASCII art here is original, stylized fan work.

## Install

```bash
pi install npm:pi-pokepet
```

Then start (or run `/reload` in) pi. Your Pokémon appears below the editor.

Try it for a single run without installing:

```bash
pi -e npm:pi-pokepet
```

## Choose your Pokémon

```
/pokemon choose pikachu
```

Roster: **pikachu** ⚡ · **charmander** 🔥 · **squirtle** 💧 · **bulbasaur** 🍃 ·
**eevee** ✦ · **jigglypuff** ♪ · **psyduck** ?

## Commands

```
/pokemon                    status
/pokemon list               list available Pokémon
/pokemon choose <name>      pick your Pokémon
/pokemon nick <nickname>    give it a nickname
/pokemon feed               give a berry (restores energy)
/pokemon stats              productivity + bond dashboard
/pokemon hide | show        toggle the widget
```

## What it reacts to

**Moods (animated):** appears → talks while the model streams → works during tool
calls → celebrates on success → panics on errors → sleeps when idle.

**Tools & commands** (detected from tool calls): tests, git (commit / push / pull /
merge / rebase / stash / checkout), build, lint, install, dev-server, docker,
network, search, and dangerous commands (`rm -rf`, `sudo`…).

**PRs & reviews:** `gh pr create` / `merge` / `review`, and review/diff tools →
*"opening a PR..."*, *"PR merged! evolution complete ✦"*, *"looks good to me!"*.

**pi advanced features:** subagents (`go, partner!`), model swaps
(`feeling a new power!`), thinking-level changes (`powering up...`), session forks
(`splitting timelines!`), and compaction (`tidying my memory...`).

**File-aware:** shows the filename you're editing (`✎ auth.ts`) and reacts by type
(tests, docs, styles, config, code).

**Time-aware:** different idle lines for morning, evening, late-night, and weekends.

**Flow & struggle:** 4 rapid edits → *"flow state! beautiful~"*; 3 failures in a row →
*"hang in there! *warm hug*"*; recovery → *"redemption arc complete!"*.

**Energy:** a `♥` meter that drifts down over time and is restored with
`/pokemon feed`.

## Bond tiers (cross-session memory)

Your Pokémon remembers you in `~/.pi/agent/pokepet-state.json`:

| Tier | After |
|---|---|
| Stranger | 0 sessions |
| Buddy | 3 sessions |
| Partner | 15 sessions |
| Bestie | 50 sessions |

## Setting it up in pi

`pi install npm:pi-pokepet` writes the package to your pi settings and loads it on
every session. Other ways to load it:

| Goal | How |
|---|---|
| Install for all projects | `pi install npm:pi-pokepet` |
| Install for one project (shareable) | `pi install -l npm:pi-pokepet` (writes `.pi/settings.json`) |
| Try once, no install | `pi -e npm:pi-pokepet` |
| Remove | `pi remove npm:pi-pokepet` |
| Enable/disable later | `pi config` |

No build step and no runtime dependencies — the extension ships as TypeScript and pi
loads it directly.

## How it works

A single pi extension that listens to lifecycle events (`session_start`,
`turn_start`/`turn_end`, `message_update`, `tool_call`, `tool_result`, `agent_start`,
`model_select`, `session_compact`, `session_shutdown`, …), renders an animated widget
via `ctx.ui.setWidget()`, and turns the streaming spinner into a spinning Poké Ball
via `ctx.ui.setWorkingIndicator()`. State persists to small files under `~/.pi/agent/`.

## License

MIT — see [LICENSE](./LICENSE).
