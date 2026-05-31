# pi-pokepet

A colorful pet companion for the [pi coding agent](https://pi.dev).

`pi-pokepet` lives below your editor and reacts in real time while pi thinks,
talks, runs tools, edits files, opens PRs, reviews code, compacts sessions, and
more.

It has two visual styles:

- **Petdex image pets**: animated Codex-style sprite pets from
  [Petdex](https://github.com/crafter-station/petdex), rendered with Pi's
  native terminal image support when available and ANSI terminal pixels as a
  fallback.
- **ASCII pets**: the original compact and large terminal line-art roster.

## Install

```bash
pi install npm:pi-pokepet
```

Try it for one run:

```bash
pi -e npm:pi-pokepet
```

## Commands

```text
/pet                         status
/pet style image             use Petdex image pets
/pet style ascii             use the legacy ASCII roster
/pet list                    list pets for the active style
/pet choose <id>             choose an installed Petdex pet or ASCII pet
/pet gallery [query]         search the public Petdex gallery
/pet install <slug>          download and select a Petdex gallery pet
/pet large                   enlarge the active pet
/pet small                   return to compact size
/pet nick <nickname>         give it a nickname
/pet feed                    restore energy
/pet awake [reason]          keep your system from sleeping
/pet sleep                   release keep-awake or make the pet nap
/pet stats                   productivity and bond dashboard
/pet hide | show             toggle the widget
```

`/pokemon` is no longer registered. Use `/pet style ascii` for the original
ASCII pets.

## Petdex Image Pets

Petdex pets use the Codex sprite format:

```text
~/.codex/pets/<slug>/
|-- pet.json
`-- spritesheet.webp  # or spritesheet.png
```

The spritesheet is an **8 column x 9 row atlas**. Rows are animation states:
`idle`, `run right`, `run left`, `wave`, `jump`, `failed`, `waiting`,
`running`, `review`.

Install one directly from the Petdex gallery:

```text
/pet gallery boba
/pet install boba
```

Or install with the Petdex CLI first:

```bash
npx petdex install boba
```

Then select it in pi:

```text
/pet style image
/pet choose boba
```

Image pets render through Pi's native TUI image component on terminals with
Kitty or iTerm2-compatible image support. This keeps the original Petdex frame
as a real PNG, so pets look much closer to Codex-style sprite pets instead of
being converted into text pixels.

Native image mode is expected to work in Kitty, Ghostty, WezTerm, and iTerm2.
Windows Terminal does not expose a Pi-supported image protocol yet, so this
version uses the ANSI half-block fallback there. The fallback is rendered through
a Pi component widget, not a plain string widget, so it can use a taller frame
budget without being cut off by Pi's default string-widget line cap.

If `NO_COLOR` is set and native images are available, pi-pokepet still renders
the native image and only removes text/status color. If `NO_COLOR` is set and
native images are unavailable, image mode falls back to ASCII and notifies once.

Small and large mode set display budgets only; the Petdex source frame is never
cropped for native rendering. Long pet names and mood messages wrap onto
additional lines.

## Mood Mapping

pi-pokepet maps pi activity to Petdex rows:

| pi mood | Petdex row |
| --- | --- |
| idle, sleep | idle |
| talking | wave |
| thinking | review |
| working | running |
| review tools | review |
| happy, hatch | jump |
| panic | failed |
| guard | waiting |

The animation loop uses each row's standard Petdex frame count.

## ASCII Roster

The original ASCII pets remain available with `/pet style ascii`:

- Pikachu
- Charmander
- Squirtle
- Bulbasaur
- Eevee
- Jigglypuff
- Psyduck

Use `/pet large` for detailed line art and `/pet small` for the compact footer
pet.

If the terminal is too narrow for a detailed ASCII drawing, pi-pokepet shows the
compact ASCII frame instead of allowing the large frame to be truncated.

> The ASCII roster is an unofficial fan project. Pokemon and Pokemon character
> names are trademarks of Nintendo, Creatures Inc., and GAME FREAK Inc. This
> project is not affiliated with, sponsored by, or endorsed by them. The ASCII
> art is original, stylized fan work.

## What It Reacts To

- model thinking, talking, and tool-call composition
- tests, builds, linting, installs, dev servers, Docker, network checks
- git commits, pushes, pulls, merges, rebases, stashes, checkouts
- PR creation, PR merges, review and diff tools
- file edits with filename-aware messages
- MCP tools and subagent dispatch
- model swaps, thinking-level changes, forks, and compaction
- flow state, repeated failures, and recovery

Energy persists across sessions in `~/.pi/agent/pokepet-state.json`. Event stats
persist in `~/.pi/agent/pokepet-events.jsonl`.

Native Petdex PNG frames are cached under:

```text
~/.pi/agent/pokepet-cache/petdex-native/
```

ANSI fallback frames are cached under:

```text
~/.pi/agent/pokepet-cache/petdex/
```

## Development

```bash
npm install
npm run lint
npm test
```

Project structure:

```text
extensions/
|-- index.ts                  entry point, events, /pet command, render routing
|-- petdex.ts                 local Petdex loading and gallery installs
|-- petdex-native-renderer.ts sprite atlas to native PNG frames
|-- petdex-widget.ts          Pi TUI Image widget for native rendering
|-- petdex-renderer.ts        sprite atlas to ANSI fallback frames
|-- mons.ts                   legacy ASCII roster and compact frame builder
|-- sprites.ts                legacy large ASCII art
|-- content.ts                mood lines and intent detection
|-- state.ts                  persistence and migration
`-- colors.ts                 ANSI color helpers
```

## License

MIT - see [LICENSE](./LICENSE).
