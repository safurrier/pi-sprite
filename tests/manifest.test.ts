import assert from "node:assert/strict";
import test from "node:test";
import { normalizePetId, parsePetManifest } from "../src/sprite/manifest.ts";

test("normalizes pet ids", () => {
	assert.equal(normalizePetId("Happy Dog!!"), "happy-dog");
});

test("parses expanded and Codex-style manifests", () => {
	assert.equal(parsePetManifest({ id: "boba", name: "Boba", sprites: { idle: "idle.png" } }).id, "boba");
	assert.equal(
		parsePetManifest({ id: "boba", displayName: "Boba", spritesheetPath: "spritesheet.webp" }).sprites.idle,
		"spritesheet.webp",
	);
});

test("rejects unsafe sprite paths", () => {
	assert.throws(() => parsePetManifest({ id: "x", sprites: { idle: "../idle.png" } }));
	assert.throws(() => parsePetManifest({ id: "x", spritesheetPath: "/tmp/x.webp" }));
	assert.throws(() => parsePetManifest({ id: "x", sprites: { idle: "run.sh" } }));
});
