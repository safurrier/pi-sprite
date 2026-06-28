import assert from "node:assert/strict";
import test from "node:test";
import {
	formatLiveStatusFooter,
	parseLiveStatusResponse,
	promptForLiveStatus,
} from "../src/sprite/live-status-format.ts";
import {
	formatTurnStatusFooter,
	parseTurnStatusResponse,
	recentConversationForTurnStatus,
} from "../src/sprite/turn-status-format.ts";

test("parses structured turn status JSON", () => {
	const status = parseTurnStatusResponse(
		'{"state":"followup","label":"restart Pi to verify","detail":"The package was installed; restart Pi to load it.","actions":["restart Pi","try /btw"]}',
	);
	assert.equal(status?.state, "followup");
	assert.equal(status?.label, "restart Pi to verify");
	assert.deepEqual(status?.actions, ["restart Pi", "try /btw"]);
	assert.equal(formatTurnStatusFooter(status!), "🟡 restart Pi to verify ✦");
});

test("rejects invalid turn status responses", () => {
	assert.equal(parseTurnStatusResponse("not json"), undefined);
	assert.equal(parseTurnStatusResponse('{"state":"maybe","label":"done"}'), undefined);
	assert.equal(parseTurnStatusResponse('{"state":"done","label":""}'), undefined);
});

test("builds recent conversation from branch entries with budget", () => {
	const entries = [
		{ type: "message", message: { role: "user", content: "first" } },
		{ type: "custom", customType: "pi-sprite:btw-entry", data: {} },
		{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "second" }] } },
		{ type: "message", message: { role: "tool", content: "skip me" } },
		{ type: "message", message: { role: "user", content: "third" } },
	];
	const context = recentConversationForTurnStatus(entries, { maxMessages: 2, maxMessageChars: 20, maxTotalChars: 100 });
	assert.equal(context, "assistant: second\n\nuser: third");
});

test("parses compact live status JSON", () => {
	const status = parseLiveStatusResponse('{"label":"debugging renderer","detail":"Looking at native image cleanup."}');
	assert.equal(status?.label, "debugging renderer");
	assert.equal(formatLiveStatusFooter(status!), "🟣 debugging renderer…");
});

test("rejects invalid live status responses", () => {
	assert.equal(parseLiveStatusResponse("not json"), undefined);
	assert.equal(parseLiveStatusResponse('{"label":""}'), undefined);
});

test("live status prompt stays provisional", () => {
	const prompt = promptForLiveStatus("user: make this work");
	assert.match(prompt, /provisional/u);
	assert.match(prompt, /Do not claim the task is complete/u);
	assert.match(prompt, /Do not add personality/u);
	assert.match(prompt, /current activity/u);
});

test("keeps newest turn-status context when the total budget is tight", () => {
	const entries = [
		{ type: "message", message: { role: "user", content: "older message with many words" } },
		{ type: "message", message: { role: "assistant", content: "middle message with many words" } },
		{ type: "message", message: { role: "user", content: "newest important request" } },
	];
	const context = recentConversationForTurnStatus(entries, { maxMessages: 3, maxMessageChars: 80, maxTotalChars: 45 });
	assert.match(context, /newest important request/u);
	assert.doesNotMatch(context, /older message/u);
});
