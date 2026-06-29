import assert from "node:assert/strict";
import test from "node:test";
import { recapSections, SYSTEM_PROMPT } from "../src/recap/format.ts";
import { generateRecapText } from "../src/recap/generation.ts";

test("recap prompt asks for a short executive summary", () => {
	assert.match(SYSTEM_PROMPT, /executive summary/u);
	assert.match(SYSTEM_PROMPT, /TL;DR, Recent work, Current status, Next/u);
	assert.match(SYSTEM_PROMPT, /under 120 words/u);
	assert.doesNotMatch(SYSTEM_PROMPT, /Files\/commands/u);
});

test("recap sections parse executive summary labels", () => {
	const sections = recapSections(
		[
			"TL;DR: Native sprites no longer leave trails.",
			"Recent work: Added Kitty placement ids and validation.",
			"Current status: Merged and installed locally.",
			"Next: Watch a fresh Pi session for recurrence.",
		].join("\n"),
	);

	assert.deepEqual(
		sections.map((section) => section.title),
		["TL;DR", "Recent work", "Current status", "Next"],
	);
	assert.equal(sections[2]?.accent, "success");
	assert.equal(sections[3]?.accent, "success");
});

test("recap generation uses side-session success without direct fallback", async () => {
	let directCalled = false;
	const result = await generateRecapText({} as never, "user: recap this", {
		sideSession: async (_ctx, request) => {
			assert.match(request.prompt, /Current session:/u);
			assert.equal(request.maxTokens, 500);
			return { ok: true, text: "TL;DR: Side session recap." };
		},
		direct: async () => {
			directCalled = true;
			return { ok: false, message: "direct should not run" };
		},
	});

	assert.deepEqual(result, { ok: true, recap: "TL;DR: Side session recap.", source: "side-session" });
	assert.equal(directCalled, false);
});

test("recap generation lazily falls back to direct completion after side-session failure", async () => {
	let directCalledWith = "";
	const result = await generateRecapText({} as never, "assistant: previous work", {
		sideSession: async () => ({ ok: false, reason: "timeout", message: "Side session timed out." }),
		direct: async (_ctx, text) => {
			directCalledWith = text;
			return { ok: true, recap: "TL;DR: Direct fallback recap.", source: "api-key-fallback" };
		},
	});

	assert.deepEqual(result, { ok: true, recap: "TL;DR: Direct fallback recap.", source: "api-key-fallback" });
	assert.equal(directCalledWith, "assistant: previous work");
});

test("recap generation explains side-session and direct fallback failures", async () => {
	const result = await generateRecapText({} as never, "user: recap this", {
		sideSession: async () => ({ ok: false, reason: "error", message: "provider rejected side session" }),
		direct: async () => ({ ok: false, message: "No API key available." }),
	});

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.message, /ephemeral Pi side session/u);
		assert.match(result.message, /provider rejected side session/u);
		assert.match(result.message, /Direct API-key fallback: No API key available/u);
		assert.match(result.message, /Pi's full agent harness/u);
	}
});

test("recap generation rejects empty side and direct responses cleanly", async () => {
	const result = await generateRecapText({} as never, "user: recap this", {
		sideSession: async () => ({ ok: false, reason: "empty", message: "Side session returned no assistant text." }),
		direct: async () => ({ ok: false, message: "API-key fallback returned no recap text." }),
	});

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.message, /empty: Side session returned no assistant text/u);
		assert.match(result.message, /API-key fallback returned no recap text/u);
	}
});
