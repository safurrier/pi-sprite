---
id: release-checklist
title: Release checklist
description: >
  Checklist for publishing pi-sprite to npm and verifying Pi package installation.
index:
  - id: preflight
  - id: publish
  - id: post-publish-smoke
---

# Release checklist

Use this checklist after the release-prep PR has merged to `main`. The release step publishes the npm package. Don't publish from a feature branch.

## Preflight

1. Start from a clean `main` checkout:

   ```bash
   git switch main
   git pull --ff-only
   git status --short
   ```

2. Confirm the package metadata and tarball contents:

   ```bash
   npm view pi-sprite version
   npm run check
   npm pack --dry-run
   ```

3. Run the isolated package smoke path:

   ```bash
   node tests/e2e/package-smoke.mjs --isolated
   ```

4. Build the docs site to verify hosted README links:

   ```bash
   uvx --with mkdocs-material mkdocs build --strict
   ```

## Publish

The preferred path is the GitHub Actions npm publish workflow. It uses npm trusted publishing and runs when you publish a GitHub Release with a tag that matches the package version.

1. Read the package version, then create and push its matching tag:

   ```bash
   version="$(node -p "require('./package.json').version")"
   git tag "v${version}"
   git push origin "v${version}"
   ```

2. Draft and publish a GitHub Release for `v<package version>`.

3. Confirm the `Publish npm package` workflow completes successfully.

If trusted publishing isn't configured for the npm package yet, configure it in npm and rerun the GitHub Release workflow. Prefer fixing trusted publishing over a local publish.

Manual publish is emergency-only. If used, first verify the release tag is on `origin/main`, preflight has passed from a clean checkout, and the npm account has the right package ownership. Then publish with provenance from a supported CI environment. Don't use a dirty local worktree as the normal fallback.

## Post-publish smoke

Verify the published package from a clean Pi package install path:

```bash
npm view pi-sprite version
pi install npm:pi-sprite
pi list
```

Open Pi and verify the first-run commands from the README:

```text
/pet status
/pet gallery
/context
/btw what should I look at next?
/recap
```

Also verify the documented ANSI fallback still starts:

```bash
PI_SPRITE_NATIVE_IMAGES=0 pi
```
