import assert from "node:assert/strict";
import test from "node:test";
import {
	BTW_ENTRY,
	BTW_RESET,
	filterPiSpriteHiddenContextEntries,
	isPiSpriteHiddenContextEntry,
	RECAP_ENTRY,
} from "../src/agent/session-entries.ts";

test("filters all hidden pi-sprite custom entries from model context", () => {
	const visible = { type: "message", message: { role: "user", content: "keep me" } };
	const entries = [
		visible,
		{ type: "custom", customType: BTW_ENTRY, data: { question: "q", answer: "a", timestamp: 1 } },
		{ type: "custom", customType: BTW_RESET, data: { timestamp: 2 } },
		{ type: "custom", customType: RECAP_ENTRY, data: { recap: "TL;DR", timestamp: 3 } },
	];

	assert.deepEqual(filterPiSpriteHiddenContextEntries(entries), [visible]);
	assert.equal(isPiSpriteHiddenContextEntry(visible), false);
});
