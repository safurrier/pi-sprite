import assert from "node:assert/strict";
import test from "node:test";
import { createReplyableSpeechBubble, renderSpeechBubble } from "../src/ui/overlay.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

test("renders a bottom-right speech bubble tail", () => {
	const rendered = renderSpeechBubble(
		"Boba says",
		[{ title: "Answer", body: "A small answer that should stay in the bubble." }],
		"↵ close",
		80,
		theme,
		{ tail: "bottom-right", maxBodyLines: 8 },
	).lines;
	assert.match(rendered.join("\n"), /Boba says/u);
	assert.match(rendered.at(-1) ?? "", /╰─╮/u);
});

test("renders a bottom-left speech bubble tail", () => {
	const rendered = renderSpeechBubble(
		"Boba says",
		[{ title: "Answer", body: "A small answer that should stay in the bubble." }],
		"↵ close",
		80,
		theme,
		{ tail: "bottom-left", maxBodyLines: 8 },
	).lines;
	assert.match(rendered.at(-1) ?? "", /╭─╯/u);
});

test("replyable speech bubble submits follow-up and updates in place", async () => {
	let renderRequests = 0;
	const component = createReplyableSpeechBubble(
		"Wumpus side thread",
		[{ title: "Wumpus", body: "First answer" }],
		theme,
		() => {},
		{
			tail: "bottom-right",
			maxBodyLines: 8,
			requestRender: () => renderRequests++,
			onSubmit: async (text) => [
				{ title: "Wumpus", body: "First answer" },
				{ title: "You · 2", body: text, accent: "muted" },
				{ title: "Wumpus", body: "Second answer" },
			],
		},
	);

	component.handleInput?.("\u001b[106;1u"); // Kitty CSI-u printable "j"
	for (const char of "uke dog") component.handleInput?.(char);
	assert.match(component.render(80).join("\n"), /juke dog/u);
	component.handleInput?.("\r");
	assert.match(component.render(80).join("\n"), /Thinking/u);
	await new Promise((resolve) => setTimeout(resolve, 0));
	const rendered = component.render(80).join("\n");
	assert.match(rendered, /You · 2/u);
	assert.match(rendered, /juke dog/u);
	assert.match(rendered, /Second answer/u);
	assert.ok(renderRequests >= 2);
});

test("replyable speech bubble ignores unmatched escape control sequences", () => {
	const component = createReplyableSpeechBubble(
		"Wumpus side thread",
		[{ title: "Wumpus", body: "First answer" }],
		theme,
		() => {},
		{
			tail: "bottom-right",
			maxBodyLines: 8,
			onSubmit: async () => [],
		},
	);

	component.handleInput?.("h");
	component.handleInput?.("\u001b[C"); // Right arrow should not append "[C".
	component.handleInput?.("\u001b[3~"); // Delete should not append "[3~".
	component.handleInput?.("i");

	const rendered = component.render(80).join("\n");
	assert.match(rendered, /hi/u);
	assert.doesNotMatch(rendered, /\[C|\[3~/u);
});

test("replyable speech bubble accepts bracketed paste text", () => {
	const component = createReplyableSpeechBubble(
		"Wumpus side thread",
		[{ title: "Wumpus", body: "First answer" }],
		theme,
		() => {},
		{
			tail: "bottom-right",
			maxBodyLines: 8,
			onSubmit: async () => [],
		},
	);

	component.handleInput?.("\u001b[200~pasted reply\u001b[201~");

	assert.match(component.render(80).join("\n"), /pasted reply/u);
});

test("replyable speech bubble shows reply errors without closing", async () => {
	const component = createReplyableSpeechBubble(
		"Wumpus side thread",
		[{ title: "Wumpus", body: "First answer" }],
		theme,
		() => {},
		{
			tail: "bottom-right",
			maxBodyLines: 8,
			onSubmit: async () => {
				throw new Error("model unavailable");
			},
		},
	);

	component.handleInput?.("f");
	component.handleInput?.("\r");
	await new Promise((resolve) => setTimeout(resolve, 0));
	const rendered = component.render(80).join("\n");
	assert.match(rendered, /Reply failed/u);
	assert.match(rendered, /model unavailable/u);
	assert.match(rendered, /First answer/u);
});

test("scrolls long speech bubble bodies while keeping chrome visible", () => {
	const body = Array.from({ length: 20 }, (_, index) => `Line ${index + 1}`).join("\n");
	const first = renderSpeechBubble("Boba recap", [{ body }], "↑/↓ scroll · ↵ close", 80, theme, {
		tail: "bottom-right",
		maxBodyLines: 5,
	});
	const later = renderSpeechBubble("Boba recap", [{ body }], "↑/↓ scroll · ↵ close", 80, theme, {
		tail: "bottom-right",
		maxBodyLines: 5,
		scroll: 10,
	});
	assert.ok(first.maxScroll > 0);
	assert.match(first.lines.join("\n"), /Line 1/u);
	assert.doesNotMatch(first.lines.join("\n"), /Line 20/u);
	assert.match(later.lines.join("\n"), /Line 11/u);
	assert.match(later.lines.join("\n"), /scroll 11-15\/20/u);
	assert.match(later.lines.at(0) ?? "", /Boba recap/u);
	assert.match(later.lines.at(-1) ?? "", /╰─╮/u);
});
