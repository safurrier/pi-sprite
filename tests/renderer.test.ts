import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setCapabilities, visibleWidth } from "@earendil-works/pi-tui";
import sharp from "sharp";
import {
	encodeKittyPlaceholderUpload,
	encodeKittyVirtualPlacement,
	placeholderCell,
	placeholderGlyph,
	placeholderGridLines,
} from "../src/sprite/kitty-placeholder.ts";
import type { InstalledPet } from "../src/sprite/loader.ts";
import {
	buildKittyPlaceholderSpriteWidget,
	buildNativeSpriteWidget,
	buildTextSpriteWidget,
	clearAllNativeSpriteImages,
	clearNativeSpriteImage,
	clearNativeSpriteImages,
	formatNativeSpritePlaceholderLines,
	renderSpriteAnimation,
	renderSpriteFrame,
	setSpriteTerminalGraphicsSinkForTests,
	spriteNativeImageMode,
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
		const compact = await renderSpriteFrame(pet, "idle");
		assert.ok(compact.lines.join("\n").includes("\u001b[38;2"));
		assert.match(compact.lines.join("\n"), /[▀▄]/u);
		assert.doesNotMatch(compact.lines.join("\n"), /Render Pet/u);
		const labeled = await renderSpriteFrame(pet, "idle", { label: true });
		assert.match(labeled.lines.at(-1) ?? "", /Render Pet/u);
	});
});

test("right-aligns text sprite widgets", () => {
	const lines = buildTextSpriteWidget(["pet"], { align: "right" }).render(10);
	assert.equal(lines[0], "      pet");
});

test("encodes Kitty Unicode placeholder protocol without putting uploads in widget lines", () => {
	const frame = { base64: Buffer.from("fake-png").toString("base64"), filename: "x.png", width: 4, height: 4 };
	const upload = encodeKittyPlaceholderUpload(frame, 42);
	const placement = encodeKittyVirtualPlacement(42, 42, 2, 2);
	const cell = placeholderCell(0, 1, 42);
	const lines = placeholderGridLines(2, 2, 42);

	assert.match(upload, /a=t/u);
	assert.match(upload, /q=2/u);
	assert.match(upload, /i=42/u);
	assert.doesNotMatch(upload, /U=1/u);
	const chunkedUpload = encodeKittyPlaceholderUpload({ ...frame, base64: "a".repeat(9000) }, 42);
	assert.match(chunkedUpload, /m=1/u);
	assert.match(chunkedUpload, /m=0/u);
	assert.match(placement, /a=p/u);
	assert.match(placement, /U=1/u);
	assert.match(placement, /p=42/u);
	assert.match(placement, /c=2/u);
	assert.match(placement, /r=2/u);
	assert.ok(cell.includes(placeholderGlyph()));
	assert.equal(visibleWidth(cell), 1);
	assert.equal(lines.length, 2);
	assert.ok(lines.every((line) => line.includes(placeholderGlyph())));
	assert.ok(lines.every((line) => !line.includes("\u001b_G")));
});

test("Kitty placeholder widget writes uploads out of band and animates by swapping placeholder ids", () => {
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	const writes: string[] = [];
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
	setSpriteTerminalGraphicsSinkForTests({ write: (sequence) => writes.push(sequence) });
	try {
		process.env.PI_SPRITE_NATIVE_IMAGES = "placeholder";
		assert.equal(spriteNativeImageMode(), "placeholder");
		assert.equal(supportsNativeSpriteImages(), true);
		const frames = [
			{ base64: Buffer.from("frame-0").toString("base64"), filename: "0.png", width: 4, height: 4 },
			{ base64: Buffer.from("frame-1").toString("base64"), filename: "1.png", width: 4, height: 4 },
		];
		const first = buildKittyPlaceholderSpriteWidget(frames, 0, "status", [42, 43], { size: "tiny" }).render(20);
		const second = buildKittyPlaceholderSpriteWidget(frames, 1, "status", [42, 43], { size: "tiny" }).render(20);
		const rendered = [...first, ...second].join("\n");

		assert.equal(writes.filter((write) => write.includes("a=t")).length, 2);
		assert.equal(writes.filter((write) => write.includes("U=1")).length, 2);
		assert.ok(first.join("\n").includes(placeholderGlyph()));
		assert.ok(second.join("\n").includes(placeholderGlyph()));
		assert.notEqual(first.join("\n"), second.join("\n"));
		assert.equal(rendered.includes("\u001b_G"), false);
	} finally {
		setSpriteTerminalGraphicsSinkForTests(undefined);
		if (previousOverride === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousOverride;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
	}
});

test("detects native sprite image capability and builds a native widget", () => {
	const previousTmux = process.env.TMUX;
	const previousTerm = process.env.TERM;
	delete process.env.TMUX;
	process.env.TERM = "xterm-256color";
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
	try {
		assert.equal(supportsNativeSpriteImages(), true);
		const widget = buildNativeSpriteWidget(
			{ base64: Buffer.from("not-a-real-png").toString("base64"), filename: "x.png", width: 1, height: 1 },
			"status",
			123,
			{ align: "right" },
		);
		const rendered = widget.render(20);
		assert.ok(rendered.length > 0);
		assert.ok((rendered[0] ?? "").startsWith("   "));
		assert.ok((rendered[0] ?? "").includes("\u001b_G"));
		assert.match(rendered.join("\n"), /a=T[^;]*i=123[^;]*p=123/u);
		assert.ok(clearAllNativeSpriteImages().join("\n").includes("a=d,d=A"));
	} finally {
		if (previousTmux === undefined) delete process.env.TMUX;
		else process.env.TMUX = previousTmux;
		if (previousTerm === undefined) delete process.env.TERM;
		else process.env.TERM = previousTerm;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
	}
});

test("auto-enables native sprite images inside known Kitty-capable tmux terminals", () => {
	const previousTmux = process.env.TMUX;
	const previousGhostty = process.env.GHOSTTY_RESOURCES_DIR;
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	setCapabilities({ images: null, trueColor: true, hyperlinks: false });
	try {
		process.env.TMUX = "/tmp/tmux-501/default,123,0";
		process.env.GHOSTTY_RESOURCES_DIR = "/Applications/Ghostty.app/Contents/Resources/ghostty";
		delete process.env.PI_SPRITE_NATIVE_IMAGES;
		assert.equal(supportsNativeSpriteImages(), true);
		assert.ok(clearAllNativeSpriteImages().join("\n").includes("a=d,d=A"));
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

test("allows explicit native sprite image opt-in inside tmux", () => {
	const previousTmux = process.env.TMUX;
	const previousGhostty = process.env.GHOSTTY_RESOURCES_DIR;
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	setCapabilities({ images: null, trueColor: true, hyperlinks: false });
	try {
		process.env.TMUX = "/tmp/tmux-501/default,123,0";
		process.env.GHOSTTY_RESOURCES_DIR = "/Applications/Ghostty.app/Contents/Resources/ghostty";
		process.env.PI_SPRITE_NATIVE_IMAGES = "kitty";
		assert.equal(supportsNativeSpriteImages(), true);
		const widget = buildNativeSpriteWidget(
			{ base64: Buffer.from("not-a-real-png").toString("base64"), filename: "x.png", width: 1, height: 1 },
			"status",
			123,
		);
		const rendered = widget.render(20).join("\n");
		assert.ok(rendered.includes("\u001bPtmux;\u001b\u001b_G"));
		assert.match(rendered, /a=d,d=I,i=0/u);
		assert.match(rendered, /a=T[^;]*i=123[^;]*p=123/u);
		assert.doesNotMatch(rendered, /a=d,d=I,i=123/u);
		assert.ok(clearNativeSpriteImage(123).join("\n").includes("a=d,d=I,i=123"));
		assert.equal(clearNativeSpriteImages([123, 124]).length, 2);
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

test("native sprite widget deletes the previous frame after drawing the next frame", () => {
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
	try {
		delete process.env.PI_SPRITE_NATIVE_IMAGES;
		const widget = buildNativeSpriteWidget(
			{ base64: Buffer.from("not-a-real-png").toString("base64"), filename: "x.png", width: 1, height: 1 },
			"status",
			124,
			{},
			123,
		);
		const rendered = widget.render(20).join("\n");
		const guardIndex = rendered.indexOf("a=d,d=I,i=0");
		const drawIndex = rendered.indexOf("a=T");
		const placementIndex = rendered.indexOf("p=124");
		const deleteIndex = rendered.indexOf("a=d,d=I,i=123");
		assert.ok(guardIndex >= 0);
		assert.ok(drawIndex > guardIndex);
		assert.ok(placementIndex > drawIndex);
		assert.ok(deleteIndex > drawIndex);
		assert.doesNotMatch(rendered, /a=d,d=I,i=124/u);
	} finally {
		if (previousOverride === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousOverride;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
	}
});

test("native placeholder reserves label row", () => {
	assert.equal(formatNativeSpritePlaceholderLines([], { size: "small" }).length, 4);
	assert.equal(formatNativeSpritePlaceholderLines([], { size: "small", label: true }).length, 5);
});

test("placeholder image mode is selected only when explicitly requested and Kitty control is available", () => {
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	const previousGhostty = process.env.GHOSTTY_RESOURCES_DIR;
	const previousKitty = process.env.KITTY_WINDOW_ID;
	const previousTermProgram = process.env.TERM_PROGRAM;
	const previousTerminalEmulator = process.env.TERMINAL_EMULATOR;
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
	try {
		process.env.PI_SPRITE_NATIVE_IMAGES = "placeholder";
		assert.equal(spriteNativeImageMode(), "placeholder");
		process.env.PI_SPRITE_NATIVE_IMAGES = "kitty-placeholder";
		assert.equal(spriteNativeImageMode(), "placeholder");
		process.env.PI_SPRITE_NATIVE_IMAGES = "1";
		assert.equal(spriteNativeImageMode(), "direct");
		setCapabilities({ images: "iterm2", trueColor: true, hyperlinks: true });
		assert.equal(spriteNativeImageMode(), "direct");
		setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
		process.env.PI_SPRITE_NATIVE_IMAGES = "0";
		assert.equal(spriteNativeImageMode(), "ansi");
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
		delete process.env.GHOSTTY_RESOURCES_DIR;
		delete process.env.KITTY_WINDOW_ID;
		delete process.env.TERM_PROGRAM;
		delete process.env.TERMINAL_EMULATOR;
		process.env.PI_SPRITE_NATIVE_IMAGES = "placeholder";
		assert.equal(spriteNativeImageMode(), "ansi");
	} finally {
		if (previousOverride === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousOverride;
		if (previousGhostty === undefined) delete process.env.GHOSTTY_RESOURCES_DIR;
		else process.env.GHOSTTY_RESOURCES_DIR = previousGhostty;
		if (previousKitty === undefined) delete process.env.KITTY_WINDOW_ID;
		else process.env.KITTY_WINDOW_ID = previousKitty;
		if (previousTermProgram === undefined) delete process.env.TERM_PROGRAM;
		else process.env.TERM_PROGRAM = previousTermProgram;
		if (previousTerminalEmulator === undefined) delete process.env.TERMINAL_EMULATOR;
		else process.env.TERMINAL_EMULATOR = previousTerminalEmulator;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
	}
});

test("native sprite images can be disabled explicitly without blocking cleanup", () => {
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
	try {
		process.env.PI_SPRITE_NATIVE_IMAGES = "0";
		assert.equal(supportsNativeSpriteImages(), false);
		assert.ok(clearNativeSpriteImage(123).join("\n").includes("a=d,d=I,i=123"));
		assert.ok(clearAllNativeSpriteImages().join("\n").includes("a=d,d=A"));
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
		const pet = {
			id: "sheet-pet",
			dir,
			manifest: {
				id: "sheet-pet",
				name: "Sheet Pet",
				sprites: { idle: "spritesheet.webp" },
				frame: { width: 4, height: 4 },
			},
		};
		const animation = await renderSpriteAnimation(pet, "idle", { label: true });
		const cachedAnimation = await renderSpriteAnimation(pet, "idle", { label: true });
		const renamedAnimation = await renderSpriteAnimation(
			{ ...pet, manifest: { ...pet.manifest, name: "Renamed Sheet Pet" } },
			"idle",
			{ label: true },
		);
		assert.equal(animation, cachedAnimation);
		assert.notEqual(animation, renamedAnimation);
		assert.equal(animation.frames.length, 2);
		assert.match(animation.frames[0]!.lines.join("\n"), /Sheet Pet/u);
		assert.match(renamedAnimation.frames[0]!.lines.join("\n"), /Renamed Sheet Pet/u);
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
