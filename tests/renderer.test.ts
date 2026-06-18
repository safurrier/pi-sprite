import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import type { InstalledPet } from "../src/sprite/loader.ts";
import { renderSpriteFrame } from "../src/sprite/renderer.ts";

async function withPet<T>(fn: (pet: InstalledPet) => Promise<T>): Promise<T> {
	const dir = mkdtempSync(join(tmpdir(), "pi-sprite-render-"));
	try {
		await sharp({
			create: {
				width: 4,
				height: 4,
				channels: 4,
				background: { r: 255, g: 0, b: 128, alpha: 1 },
			},
		})
			.png()
			.toFile(join(dir, "idle.png"));
		writeFileSync(join(dir, "pet.json"), JSON.stringify({ id: "render-pet", name: "Render Pet" }));
		return await fn({
			id: "render-pet",
			dir,
			manifest: { id: "render-pet", name: "Render Pet", sprites: { idle: "idle.png" } },
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("renders image pets as terminal half-block frames", async () => {
	await withPet(async (pet) => {
		const frame = await renderSpriteFrame(pet, "idle");
		assert.ok(frame.lines.join("\n").includes("\u001b[38;2"));
		assert.match(frame.lines.join("\n"), /[▀▄]/u);
		assert.match(frame.lines.at(-1) ?? "", /Render Pet/u);
	});
});

test("renders the first frame from Codex/Petdex-style spritesheets", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-sprite-sheet-"));
	try {
		await sharp({
			create: { width: 8, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.composite([
				{
					input: Buffer.from('<svg width="4" height="4"><rect width="4" height="4" fill="#00ff00"/></svg>'),
					left: 0,
					top: 0,
				},
				{
					input: Buffer.from('<svg width="4" height="4"><rect width="4" height="4" fill="#ff0000"/></svg>'),
					left: 4,
					top: 0,
				},
			])
			.webp()
			.toFile(join(dir, "spritesheet.webp"));
		const frame = await renderSpriteFrame(
			{
				id: "sheet-pet",
				dir,
				manifest: {
					id: "sheet-pet",
					name: "Sheet Pet",
					sprites: { idle: "spritesheet.webp" },
					frame: { width: 4, height: 4 },
				},
			},
			"idle",
		);
		assert.ok(frame.signature.includes("4x4"));
		assert.match(frame.lines.join("\n"), /Sheet Pet/u);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
