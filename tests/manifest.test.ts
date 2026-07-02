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

test("parses optional short pet personality prompts", () => {
	const manifest = parsePetManifest({
		id: "boba",
		name: "Boba",
		personality: "  Warm, concise, and lightly mischievous.  ",
		sprites: { idle: "idle.png" },
	});
	assert.equal(manifest.personality, "Warm, concise, and lightly mischievous.");
});

test("rejects unsafe sprite paths", () => {
	assert.throws(() => parsePetManifest({ id: "x", sprites: { idle: "../idle.png" } }));
	assert.throws(() => parsePetManifest({ id: "x", spritesheetPath: "/tmp/x.webp" }));
	assert.throws(() => parsePetManifest({ id: "x", sprites: { idle: "run.sh" } }));
});

test("rejects oversized pet personality prompts", () => {
	assert.throws(() => parsePetManifest({ id: "x", personality: "x".repeat(2001), sprites: { idle: "idle.png" } }));
});
