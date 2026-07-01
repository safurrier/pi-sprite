import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setCapabilities } from "@earendil-works/pi-tui";
import sharp from "sharp";
import { createSpriteRuntime, nativeSpriteCleanupImageIds, stableNativeImageId } from "../src/sprite/runtime.ts";

async function withSpriteHome<T>(fn: (home: string) => Promise<T> | T): Promise<T> {
	const previousHome = process.env.PI_SPRITE_HOME;
	const home = mkdtempSync(join(tmpdir(), "pi-sprite-runtime-"));
	try {
		process.env.PI_SPRITE_HOME = home;
		return await fn(home);
	} finally {
		if (previousHome === undefined) delete process.env.PI_SPRITE_HOME;
		else process.env.PI_SPRITE_HOME = previousHome;
		rmSync(home, { recursive: true, force: true });
	}
}

function fakeContext(statuses: string[] = []) {
	return {
		// biome-ignore lint/style/useNamingConvention: Pi extension contexts expose this as hasUI.
		hasUI: true,
		ui: {
			setStatus(_key: string, value: string | undefined) {
				if (value) statuses.push(value);
			},
			setWidget() {},
			notify(message: string) {
				statuses.push(message);
			},
		},
	} as never;
}

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

test("live status is enabled by default and can be disabled persistently", async () => {
	await withSpriteHome(async () => {
		const runtime = createSpriteRuntime();
		await runtime.start(fakeContext());
		assert.equal(runtime.isLiveStatusEnabled(), true);

		let commandHandler: ((args: string, ctx: never) => Promise<void>) | undefined;
		runtime.registerCommands({
			registerCommand(_name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) {
				commandHandler = command.handler;
			},
		} as never);
		await commandHandler!("live-status off", fakeContext());
		assert.equal(runtime.isLiveStatusEnabled(), false);

		const restarted = createSpriteRuntime();
		await restarted.start(fakeContext());
		assert.equal(restarted.isLiveStatusEnabled(), false);
	});
});

test("live status clear does not disable future live status", async () => {
	await withSpriteHome(async () => {
		const statuses: string[] = [];
		const runtime = createSpriteRuntime();
		await runtime.start(fakeContext(statuses));
		runtime.setLiveStatus({ label: "debugging renderer" });
		assert.match(statuses.at(-1) ?? "", /debugging renderer/u);

		let commandHandler: ((args: string, ctx: never) => Promise<void>) | undefined;
		runtime.registerCommands({
			registerCommand(_name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) {
				commandHandler = command.handler;
			},
		} as never);
		await commandHandler!("live-status clear", fakeContext(statuses));
		assert.equal(runtime.isLiveStatusEnabled(), true);
		assert.doesNotMatch(statuses.at(-2) ?? "", /debugging renderer/u);
	});
});

test("cleared live status ignores stale classifier result", async () => {
	await withSpriteHome(async () => {
		const statuses: string[] = [];
		const runtime = createSpriteRuntime();
		await runtime.start(fakeContext(statuses));
		const generation = runtime.setLiveStatusPending();
		runtime.clearLiveStatus();
		runtime.setLiveStatus({ label: "stale result" }, generation);
		assert.doesNotMatch(statuses.at(-1) ?? "", /stale result/u);
	});
});

test("btw and recap activity do not advertise in the Pi footer", async () => {
	await withSpriteHome(async () => {
		const statuses: string[] = [];
		const runtime = createSpriteRuntime();
		await runtime.start(fakeContext(statuses));

		runtime.setBtwStatus("running", 1);
		assert.doesNotMatch(statuses.at(-1) ?? "", /btw/u);
		runtime.setBtwStatus("ready", 1);
		assert.doesNotMatch(statuses.at(-1) ?? "", /btw/u);
		runtime.setRecapStatus("running");
		assert.doesNotMatch(statuses.at(-1) ?? "", /recap/u);
		runtime.setRecapStatus("ready");
		assert.doesNotMatch(statuses.at(-1) ?? "", /recap/u);
	});
});

test("final turn status clears provisional live status", async () => {
	await withSpriteHome(async () => {
		const statuses: string[] = [];
		const runtime = createSpriteRuntime();
		await runtime.start(fakeContext(statuses));
		runtime.setLiveStatus({ label: "running tests" });
		runtime.setTurnStatus({ state: "done", label: "tests passed" });
		const footer = statuses.at(-1) ?? "";
		assert.match(footer, /tests passed/u);
		assert.doesNotMatch(footer, /running tests/u);
	});
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
