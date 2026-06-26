import assert from "node:assert/strict";
import test from "node:test";
import { renderSpeechBubble } from "../src/ui/overlay.ts";

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
