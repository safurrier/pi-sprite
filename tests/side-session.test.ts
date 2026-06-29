import assert from "node:assert/strict";
import test from "node:test";
import { extractAssistantText } from "../src/agent/side-session-text.ts";

test("extracts assistant text from string content", () => {
	assert.equal(
		extractAssistantText([
			{ role: "user", content: "ignore" },
			{ role: "assistant", content: "  Side answer.  " },
		]),
		"Side answer.",
	);
});

test("extracts assistant text from text parts", () => {
	assert.equal(
		extractAssistantText([
			{
				role: "assistant",
				content: [
					{ type: "text", text: "First" },
					{ type: "image", data: "ignored" },
					{ type: "text", text: "Second" },
				],
			},
		]),
		"First\nSecond",
	);
});

test("extracts newest assistant text", () => {
	assert.equal(
		extractAssistantText([
			{ role: "assistant", content: "older" },
			{ role: "user", content: "latest user" },
			{ role: "assistant", content: "newer" },
		]),
		"newer",
	);
});
