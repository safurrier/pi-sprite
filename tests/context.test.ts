import assert from "node:assert/strict";
import test from "node:test";

test("context overlay assertion helper accepts expected Claude-style text", async () => {
	const { spawnSync } = await import("node:child_process");
	const result = spawnSync("node", ["tests/e2e/assert-context-overlay.mjs", "--self-test"], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
});
