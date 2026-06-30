import assert from "node:assert/strict";
import test from "node:test";
import { completeBtwText } from "../src/btw/completion.ts";
import { type BtwEntry, formatThread, formatThreadSections } from "../src/btw/format.ts";

const entries: BtwEntry[] = [
	{ question: "Why native images?", answer: "Because Ghostty can render crisp sprites.", timestamp: 1 },
	{ question: "What is the risk?", answer: "Stale terminal image placements need cleanup.", timestamp: 2 },
];

test("keeps markdown BTW transcript for model context and injection", () => {
	const transcript = formatThread(entries);
	assert.match(transcript, /## BTW 1/u);
	assert.match(transcript, /User: Why native images\?/u);
	assert.match(transcript, /Assistant: Stale terminal image placements/u);
});

test("renders BTW thread as conversational sections for the bubble UI", () => {
	const sections = formatThreadSections(entries, "Boba");
	assert.equal(sections[0]?.title, "Side thread · 2 turns");
	assert.equal(sections[1]?.title, "You · 1");
	assert.equal(sections[2]?.title, "Boba");
	assert.equal(sections[3]?.title, "You · 2");
	assert.doesNotMatch(sections.map((section) => `${section.title}\n${section.body}`).join("\n"), /## BTW/u);
});

test("renders an empty BTW thread with a start hint", () => {
	const sections = formatThreadSections([], "Boba");
	assert.equal(sections[0]?.title, "Side thread · empty");
	assert.match(sections[0]?.body ?? "", /\/btw <message>/u);
});

function fakeCommandContext() {
	return {
		cwd: process.cwd(),
		model: { provider: "test", model: "test-model", maxTokens: 1000 },
		modelRegistry: {
			getApiKeyAndHeaders: async () => ({ ok: false }),
		},
		sessionManager: {
			getBranch: () => [],
		},
	} as never;
}

test("BTW completion uses side sessions before raw API-key fallback", async () => {
	let directCalled = false;
	const answer = await completeBtwText(fakeCommandContext(), "Side question", 1200, {
		sideSession: async (_ctx, prompt, maxTokens) => {
			assert.equal(prompt, "Side question");
			assert.equal(maxTokens, 1200);
			return "side answer";
		},
		direct: async () => {
			directCalled = true;
			return undefined;
		},
	});
	assert.equal(answer, "side answer");
	assert.equal(directCalled, false);
});

test("BTW completion falls back to direct completion when side session fails", async () => {
	const answer = await completeBtwText(fakeCommandContext(), "Side question", 1200, {
		sideSession: async () => undefined,
		direct: async (_ctx, prompt, maxTokens) => {
			assert.equal(prompt, "Side question");
			assert.equal(maxTokens, 1200);
			return "fallback answer";
		},
	});
	assert.equal(answer, "fallback answer");
});
