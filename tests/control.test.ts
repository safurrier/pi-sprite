import assert from "node:assert/strict";
import test from "node:test";
import { PI_SPRITE_CONTROL_EVENT, parsePiSpriteControl } from "../src/sprite/control.ts";

test("exposes one namespaced inter-extension control event", () => {
	assert.equal(PI_SPRITE_CONTROL_EVENT, "pi-sprite:control");
});

test("accepts bounded transient state transitions and ignores unrelated fields", () => {
	assert.deepEqual(parsePiSpriteControl({ state: "working", resetMs: 1800, petId: "cap" }), {
		state: "working",
		resetMs: 1800,
	});
});

test("rejects unknown states and out-of-range reset timers", () => {
	assert.equal(parsePiSpriteControl({ state: "dancing" }), undefined);
	assert.deepEqual(parsePiSpriteControl({ state: "error", resetMs: 60001 }), { state: "error" });
	assert.deepEqual(parsePiSpriteControl({ state: "error", resetMs: 0 }), { state: "error" });
	assert.equal(parsePiSpriteControl({ petId: "cap" }), undefined);
	assert.equal(parsePiSpriteControl(null), undefined);
});
