import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { buildUsage, renderContextOverlayLines, splitSystemPromptForContextUsage } from "../src/context/index.ts";

const plainTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

test("context overlay assertion helper accepts expected Claude-style text", async () => {
	const result = spawnSync("node", ["tests/e2e/assert-context-overlay.mjs", "--self-test"], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
});

test("splits available skills out of the system prompt estimate", () => {
	const split = splitSystemPromptForContextUsage(
		[
			"base instructions",
			"<available_skills>",
			"  <skill><name>example</name></skill>",
			"</available_skills>",
			"more instructions",
		].join("\n"),
	);

	assert.match(split.systemPrompt, /base instructions/u);
	assert.match(split.systemPrompt, /more instructions/u);
	assert.doesNotMatch(split.systemPrompt, /available_skills/u);
	assert.match(split.skills, /<available_skills>/u);
	assert.match(split.skills, /example/u);
});

const usageModel = {
	modelLabel: "GPT-5.5 (272k context)",
	total: 32_000,
	window: 272_000,
	percent: 11.76,
	actualTokens: 20_000,
	estimatedTokens: 32_000,
	categories: [
		{
			label: "System message",
			tokens: 18_000,
			glyph: "◉",
			color: "muted" as const,
			detail: "Base instructions.",
		},
		{ label: "Skills", tokens: 2_000, glyph: "◉", color: "warning" as const, detail: "Skill metadata." },
		{ label: "System tools", tokens: 12_000, glyph: "◉", color: "borderAccent" as const, detail: "Tool schemas." },
		{ label: "Custom entries", tokens: 15, glyph: "◉", color: "text" as const, detail: "Extension entries." },
		{ label: "Free space", tokens: 240_000, glyph: "□", color: "dim" as const },
	],
};

test("usage model reports active context after compaction instead of full branch history", () => {
	const model = buildUsage(
		{
			getContextUsage: () => ({ tokens: 32_000, contextWindow: 272_000, percent: 11.76 }),
			model: { name: "GPT-5.5", contextWindow: 272_000 },
			getSystemPrompt: () => "base instructions",
			sessionManager: {
				getBranch: () => [
					{
						id: "old-user",
						type: "message",
						message: { role: "user", content: "old user text".repeat(10_000) },
					},
					{
						id: "old-tool",
						type: "message",
						message: { role: "toolResult", content: "old tool output".repeat(100_000) },
					},
					{
						id: "compact",
						type: "compaction",
						summary: "compact summary".repeat(100),
						firstKeptEntryId: "recent-user",
					},
					{
						id: "recent-user",
						type: "message",
						message: { role: "user", content: "recent user text" },
					},
				],
			},
		} as any,
		{ getActiveTools: () => [], getAllTools: () => [] } as any,
	);

	assert.ok(model);
	assert.equal(model.total, 32_000);
	assert.equal(model.categories.find((category) => category.label === "Tool results")?.tokens, 0);
	assert.equal(model.categories.find((category) => category.label === "Messages")?.tokens, 4);
});

test("context overlay renders an opaque framed reader-friendly layout", () => {
	const lines = renderContextOverlayLines(usageModel, false, 100, plainTheme);
	const text = lines.join("\n");

	assert.match(text, /Context Usage/u);
	assert.match(text, /Usage map/u);
	assert.match(text, /Estimated usage/u);
	assert.match(text, /Skills/u);
	assert.match(text, /Free space/u);
	assert.match(text, /Esc\/q\/Enter to close/u);
	assert.ok(lines.every((line) => visibleWidth(line) <= 100));
	assert.ok(lines.every((line) => visibleWidth(line) >= 100));
});

test("context overlay respects narrow render widths", () => {
	for (const width of [24, 40, 63, 78]) {
		const lines = renderContextOverlayLines(usageModel, false, width, plainTheme);
		assert.ok(
			lines.every((line) => visibleWidth(line) <= width),
			`line exceeded width ${width}`,
		);
	}
});

test("expanded context overlay preserves command guidance", () => {
	const text = renderContextOverlayLines(usageModel, true, 100, plainTheme).join("\n");

	assert.match(text, /Breakdown notes/u);
	assert.match(text, /MCP tools/u);
	assert.match(text, /\/mcp/u);
	assert.match(text, /Custom agents/u);
	assert.match(text, /\/agents/u);
	assert.match(text, /\/skills/u);
});
