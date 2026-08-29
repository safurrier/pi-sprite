# Ship authoring resources with the package

Status: Accepted
Date: 2026-06-26

## Context

Custom pets need a repeatable authoring flow, not a repository-only note. PR
[#20](https://github.com/safurrier/pi-sprite/pull/20) added the packaged skill
at `413f76d75502e77438af711cfe6ece2e6caaf25d`; package smoke coverage later
verified installation boundaries.

## Decision

Publish the `pi-sprite-authoring` skill and examples through the `files` list
in `package.json`. `/pet create` bridges to that packaged skill. The skill uses
local templates and prompt-only paths when image-generation dependencies or
credentials are unavailable.

## Consequences

Package changes must verify both discovery and packed contents. Third-party
reference assets remain local unless their license and provenance are verified.
This rejects a repo-only authoring procedure that disappears after install.
