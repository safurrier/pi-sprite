import assert from "node:assert/strict";
import test from "node:test";
import { recapSections, SYSTEM_PROMPT } from "../src/recap/format.ts";

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
