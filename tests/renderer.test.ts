import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setCapabilities } from "@earendil-works/pi-tui";
import sharp from "sharp";
import type { InstalledPet } from "../src/sprite/loader.ts";
import {
	buildNativeSpriteWidget,
	renderSpriteAnimation,
	renderSpriteFrame,
	supportsNativeSpriteImages,
} from "../src/sprite/renderer.ts";

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

test("detects native sprite image capability and builds a native widget", () => {
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
	try {
		assert.equal(supportsNativeSpriteImages(), true);
		const widget = buildNativeSpriteWidget(
			{ base64: Buffer.from("not-a-real-png").toString("base64"), filename: "x.png", width: 1, height: 1 },
			"status",
			123,
		);
		assert.ok(widget.render(20).length > 0);
	} finally {
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
	}
});

test("supports Ghostty native sprite images through tmux passthrough", () => {
	const previousTmux = process.env.TMUX;
	const previousGhostty = process.env.GHOSTTY_RESOURCES_DIR;
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	setCapabilities({ images: null, trueColor: true, hyperlinks: false });
	try {
		process.env.TMUX = "/tmp/tmux-501/default,123,0";
		process.env.GHOSTTY_RESOURCES_DIR = "/Applications/Ghostty.app/Contents/Resources/ghostty";
		delete process.env.PI_SPRITE_NATIVE_IMAGES;
		assert.equal(supportsNativeSpriteImages(), true);
		const widget = buildNativeSpriteWidget(
			{ base64: Buffer.from("not-a-real-png").toString("base64"), filename: "x.png", width: 1, height: 1 },
			"status",
			123,
		);
		const rendered = widget.render(20).join("\n");
		assert.ok(rendered.includes("\u001bPtmux;\u001b\u001b_G"));
	} finally {
		if (previousTmux === undefined) delete process.env.TMUX;
		else process.env.TMUX = previousTmux;
		if (previousGhostty === undefined) delete process.env.GHOSTTY_RESOURCES_DIR;
		else process.env.GHOSTTY_RESOURCES_DIR = previousGhostty;
		if (previousOverride === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousOverride;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
	}
});

test("native sprite images can be disabled explicitly", () => {
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
	try {
		process.env.PI_SPRITE_NATIVE_IMAGES = "0";
		assert.equal(supportsNativeSpriteImages(), false);
	} finally {
		if (previousOverride === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousOverride;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
	}
});

test("renders configured multi-frame Codex/Petdex-style spritesheets", async () => {
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
		const animation = await renderSpriteAnimation(
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
		assert.equal(animation.frames.length, 2);
		assert.match(animation.frames[0]!.lines.join("\n"), /Sheet Pet/u);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("infers Petdex 8x9 atlas frames for spritesheet paths", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-sprite-atlas-"));
	try {
		await sharp({
			create: { width: 32, height: 36, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.composite(
				Array.from({ length: 6 }, (_, col) => ({
					input: Buffer.from(
						`<svg width="4" height="4"><rect width="4" height="4" fill="rgb(${col * 30},255,0)"/></svg>`,
					),
					left: col * 4,
					top: 0,
				})),
			)
			.webp()
			.toFile(join(dir, "spritesheet.webp"));
		const animation = await renderSpriteAnimation(
			{
				id: "atlas-pet",
				dir,
				manifest: { id: "atlas-pet", name: "Atlas Pet", sprites: { idle: "spritesheet.webp" } },
			},
			"idle",
		);
		assert.equal(animation.frames.length, 6);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
