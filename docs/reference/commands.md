---
id: commands
title: Command Reference
description: >
  Reference for pi-sprite slash commands and their main-thread boundaries.
index:
  - id: pet-and-sprite
  - id: context-and-recap
  - id: btw
---

# Command Reference

## Pet and Sprite

`/pet` is the main command. `/sprite` accepts the same subcommands and is the
package-specific alias.

| Command | Result |
| --- | --- |
| `/pet status`, `/pet list`, `/pet choose <id>` | Inspect or select local pets. |
| `/pet import <absolute-path>` | Validate, copy, and select a local pet folder. |
| `/pet import-url <https-url>` | Download, validate, copy, and select a remote pet. |
| `/pet gallery`, `/pet search <query>`, `/pet preview <slug>`, `/pet install <slug>` | Discover or install Petdex pets. |
| `/pet create [brief]`, `/pet author [brief]` | Send the packaged authoring workflow to Pi. |
| `/pet hide`, `/pet show`, `/pet size <value>`, `/pet label <on|off>`, `/pet align <left|right>` | Change display settings. |
| `/pet turn-status <on|off|clear>`, `/pet live-status <on|off|clear>` | Change footer status behavior. |
| `/pet clear-native` | Clear terminal image placements before a redraw. |

Use a fully expanded absolute path for `/pet import`; Pi slash commands do not
expand `~`.

## Context and Recap

`/context` opens a context-usage overlay. `/context all` requests expanded
details. `/sprite:context` is the package-specific context alias.

`/recap` generates a compact session summary in a speech bubble. It uses an
isolated side session first and leaves its bookkeeping out of main model
context.

## BTW

`/btw <message>` opens or continues the contextual side thread. `/btw` opens
its interactive bubble, while `/btw:ask <question>` is a disposable,
contextless question. `/btw:new` starts a new child session and `/btw:clear`
clears the saved thread.

`/btw:status` reports the parent and child relationship without synchronizing
it. `/btw:refresh` explicitly copies a bounded parent-progress snapshot.
`/btw:recap` or `/btw recap` adds a recap to the side thread. Only
`/btw:inject` and `/btw:summarize` send side-thread content to the main
conversation.
