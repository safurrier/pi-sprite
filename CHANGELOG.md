# Changelog

## 1.0.0 - First pi-sprite release

- Added the `pi-sprite` Pi package with `/pet`, `/sprite`, `/context`, `/recap`, and `/btw` commands.
- Added passive terminal sprite rendering with ANSI fallback and Kitty/Ghostty/WezTerm native placeholder support.
- Added Petdex and local pet workflows: `/pet gallery`, `/pet preview`, `/pet install`, `/pet import`, and `/pet import-url`.
- Added the packaged `pi-sprite-authoring` skill and starter scripts for custom pet creation.
- Added explicit side-session generation for recap, BTW replies, turn status, and live status, reusing Pi's active model/provider where possible.
- Added README, MkDocs, WendyBot3000 release demo, package smoke tests, and release validation guidance.

This project began as a slimmed derivative of `pi-pokepet`; `NOTICE.md` retains attribution for the original MIT-licensed work.
