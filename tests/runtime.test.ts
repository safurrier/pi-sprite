import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setCapabilities } from "@earendil-works/pi-tui";
import sharp from "sharp";
import { createSpriteRuntime, nativeSpriteCleanupImageIds, stableNativeImageId } from "../src/sprite/runtime.ts";

test("uses one stable native image id per tmux pane across cwd changes", () => {
	const previousPane = process.env.TMUX_PANE;
	try {
		process.env.TMUX_PANE = "%42";
		const first = stableNativeImageId();
		const firstCleanupIds = nativeSpriteCleanupImageIds();
		const originalCwd = process.cwd();
		process.chdir("/");
		try {
			assert.equal(stableNativeImageId(), first);
			assert.ok(nativeSpriteCleanupImageIds().includes(first));
			assert.ok(nativeSpriteCleanupImageIds().includes(first + 1));
			assert.notDeepEqual(nativeSpriteCleanupImageIds(), firstCleanupIds);
		} finally {
			process.chdir(originalCwd);
		}
	} finally {
		if (previousPane === undefined) delete process.env.TMUX_PANE;
		else process.env.TMUX_PANE = previousPane;
	}
});

test("native startup reserves blank cells instead of drawing ANSI loading art", async () => {
	const previousHome = process.env.PI_SPRITE_HOME;
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	const home = mkdtempSync(join(tmpdir(), "pi-sprite-runtime-"));
	try {
		process.env.PI_SPRITE_HOME = home;
		process.env.PI_SPRITE_NATIVE_IMAGES = "kitty";
		setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
		const petDir = join(home, "pets", "native-pet");
		mkdirSync(petDir, { recursive: true });
		await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
			.composite([
				{
					input: Buffer.from('<svg width="4" height="4"><rect width="4" height="4" fill="#ff00ff"/></svg>'),
				},
			])
			.png()
			.toFile(join(petDir, "idle.png"));
		writeFileSync(
			join(petDir, "pet.json"),
			JSON.stringify({ id: "native-pet", name: "Native Pet", sprites: { idle: "idle.png" } }),
		);
		writeFileSync(join(home, "state.json"), JSON.stringify({ selectedPetId: "native-pet", visible: true }));

		const widgets: unknown[] = [];
		const runtime = createSpriteRuntime();
		await runtime.start({
			// biome-ignore lint/style/useNamingConvention: Pi extension contexts expose this as hasUI.
			hasUI: true,
			ui: {
				setStatus() {},
				setWidget(_key: string, widget: unknown) {
					widgets.push(widget);
				},
			},
		} as never);

		const firstWidget = widgets[0];
		assert.ok(Array.isArray(firstWidget));
		assert.doesNotMatch(firstWidget.join("\n"), /Native Pet|◕‿◕/u);
		assert.ok(firstWidget.length >= 4);
	} finally {
		if (previousHome === undefined) delete process.env.PI_SPRITE_HOME;
		else process.env.PI_SPRITE_HOME = previousHome;
		if (previousOverride === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousOverride;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
		rmSync(home, { recursive: true, force: true });
	}
});
