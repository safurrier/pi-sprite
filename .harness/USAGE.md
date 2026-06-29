# pi-sprite Harness Kit config

This repo carries a repo-local HK profile and system map:

- `harness.toml` — target binding for local diagnostics.
- `profiles/pi-sprite-root.toml` — validation/review contract mined from `package.json`, `.mise/tasks/*`, README, and GitHub CI.
- `system.toml` — compact component/invariant map for agent routing.

Until HK auto-discovers repo-local profile config, run config diagnostics with:

```bash
HARNESS_KIT_CONFIG=.harness/harness.toml hk profile resolve --target . --json
HARNESS_KIT_CONFIG=.harness/harness.toml hk checks --target . --changed --json
HARNESS_KIT_CONFIG=.harness/harness.toml hk config validate --target . --json
```

Normal HK lifecycle commands can still use the usual target:

```bash
hk start <slug> --plan "..." --target .
hk validate --why "Fast gate passes" -- mise run check
hk sync --target .
hk ready --target .
```
