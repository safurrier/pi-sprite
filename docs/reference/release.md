---
id: release-checklist
title: Release Checklist
description: >
  Checklist for publishing pi-sprite to npm and verifying Pi package installation.
index:
  - id: preflight
  - id: publish
  - id: post-publish-smoke
---

# Release Checklist

Use this checklist after the release-prep PR has merged to `main`. The release step publishes the npm package; do not publish from a feature branch.

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

4. Build the docs site so hosted README links are known-good:

   ```bash
   uvx --with mkdocs-material mkdocs build --strict
   ```

## Publish

The preferred path is the GitHub Actions npm publish workflow. It uses npm trusted publishing and runs when a GitHub Release is published with a tag matching the package version.

1. Create and push the version tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. Draft a GitHub Release for `v1.0.0` and publish it.

3. Confirm the `Publish npm package` workflow completes successfully.

If trusted publishing is not configured for the npm package yet, configure it in npm and rerun the GitHub Release workflow. Prefer fixing trusted publishing over a local publish.

Manual publish is emergency-only. If used, first verify the release tag is on `origin/main`, preflight has passed from a clean checkout, and the npm account has the right package ownership. Then publish with provenance from a supported CI environment; do not use a dirty local worktree as the normal fallback.

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
