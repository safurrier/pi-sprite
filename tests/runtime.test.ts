import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setCapabilities } from "@earendil-works/pi-tui";
import sharp from "sharp";
import { placeholderGlyph } from "../src/sprite/kitty-placeholder.ts";
import { setSpriteTerminalGraphicsSinkForTests } from "../src/sprite/renderer.ts";
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

function fakeContext(statuses: string[] = [], widgets: unknown[] = []) {
	return {
		// biome-ignore lint/style/useNamingConvention: Pi extension contexts expose this as hasUI.
		hasUI: true,
		ui: {
			setStatus(_key: string, value: string | undefined) {
				if (value) statuses.push(value);
			},
			setWidget(_key: string, widget: unknown) {
				widgets.push(widget);
			},
			notify(message: string) {
				statuses.push(message);
			},
		},
	} as never;
}

function fakeHeadlessContext() {
	return {
		// biome-ignore lint/style/useNamingConvention: Pi extension contexts expose this as hasUI.
		hasUI: false,
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
			assert.ok(nativeSpriteCleanupImageIds().includes(first + 15));
			assert.notDeepEqual(nativeSpriteCleanupImageIds(), firstCleanupIds);
		} finally {
			process.chdir(originalCwd);
		}
	} finally {
		if (previousPane === undefined) delete process.env.TMUX_PANE;
		else process.env.TMUX_PANE = previousPane;
	}
});

test("starting with a new context clears the previous sprite widget", async () => {
	const previousNative = process.env.PI_SPRITE_NATIVE_IMAGES;
	try {
		process.env.PI_SPRITE_NATIVE_IMAGES = "0";
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
		await withSpriteHome(async () => {
			const firstWidgets: unknown[] = [];
			const secondWidgets: unknown[] = [];
			const runtime = createSpriteRuntime();

			await runtime.start(fakeContext([], firstWidgets));
			const firstRenderCount = firstWidgets.length;
			assert.ok(firstRenderCount > 0);
			await runtime.start(fakeContext([], secondWidgets));
			await new Promise((resolve) => setTimeout(resolve, 60));

			assert.ok(firstWidgets.length > firstRenderCount);
			assert.equal(firstWidgets.at(-1), undefined);
			assert.ok(secondWidgets.length > 0);
		});
	} finally {
		if (previousNative === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousNative;
	}
});

test("context handoff clears pending state reset timers", async () => {
	await withSpriteHome(async () => {
		const statuses: string[] = [];
		const runtime = createSpriteRuntime();

		await runtime.start(fakeContext());
		runtime.setState("success", { resetMs: 1 });
		await runtime.start(fakeContext(statuses));
		runtime.setState("working");
		await new Promise((resolve) => setTimeout(resolve, 10));

		assert.match(statuses.at(-1) ?? "", /working/u);
		assert.doesNotMatch(statuses.at(-1) ?? "", /idle/u);
	});
});

test("context handoff clears headless pending state reset timers", async () => {
	await withSpriteHome(async () => {
		const statuses: string[] = [];
		const runtime = createSpriteRuntime();

		await runtime.start(fakeHeadlessContext());
		runtime.setState("success", { resetMs: 1 });
		await runtime.start(fakeContext(statuses));
		runtime.setState("working");
		await new Promise((resolve) => setTimeout(resolve, 10));

		assert.match(statuses.at(-1) ?? "", /working/u);
		assert.doesNotMatch(statuses.at(-1) ?? "", /idle/u);
	});
});

test("startup native cleanup uses the current cwd image ids", async () => {
	const previousHome = process.env.PI_SPRITE_HOME;
	const previousNative = process.env.PI_SPRITE_NATIVE_IMAGES;
	const previousTmuxPane = process.env.TMUX_PANE;
	const previousCwd = process.cwd();
	const home = mkdtempSync(join(tmpdir(), "pi-sprite-runtime-"));
	const firstCwd = join(home, "first");
	const secondCwd = join(home, "second");
	mkdirSync(firstCwd, { recursive: true });
	mkdirSync(secondCwd, { recursive: true });
	try {
		process.env.PI_SPRITE_HOME = home;
		process.env.PI_SPRITE_NATIVE_IMAGES = "kitty";
		delete process.env.TMUX_PANE;
		setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });

		process.chdir(firstCwd);
		const oldId = stableNativeImageId();
		const runtime = createSpriteRuntime();
		process.chdir(secondCwd);
		const currentId = stableNativeImageId();
		assert.notEqual(currentId, oldId);

		const widgets: unknown[] = [];
		await runtime.start(fakeContext([], widgets));
		const rendered = widgets.flatMap((widget) => (Array.isArray(widget) ? widget : [])).join("\n");

		assert.match(rendered, new RegExp(`i=${currentId}(?:,|;)`, "u"));
		assert.match(rendered, new RegExp(`i=${oldId}(?:,|;)`, "u"));
	} finally {
		process.chdir(previousCwd);
		if (previousHome === undefined) delete process.env.PI_SPRITE_HOME;
		else process.env.PI_SPRITE_HOME = previousHome;
		if (previousNative === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousNative;
		if (previousTmuxPane === undefined) delete process.env.TMUX_PANE;
		else process.env.TMUX_PANE = previousTmuxPane;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
		rmSync(home, { recursive: true, force: true });
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

test("selected pet exposes personality for BTW prompts", async () => {
	await withSpriteHome(async (home) => {
		const petDir = join(home, "pets", "personality-pet");
		mkdirSync(petDir, { recursive: true });
		writeFileSync(
			join(petDir, "pet.json"),
			JSON.stringify({
				id: "personality-pet",
				name: "Personality Pet",
				personality: "Warm, concise, and practical.",
				sprites: { idle: "idle.png" },
			}),
		);
		writeFileSync(join(home, "state.json"), JSON.stringify({ selectedPetId: "personality-pet", visible: true }));

		const runtime = createSpriteRuntime();
		await runtime.start(fakeContext());

		assert.equal(runtime.getSpriteName(), "Personality Pet");
		assert.equal(runtime.getSpritePersonality(), "Warm, concise, and practical.");
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

test("placeholder mode renders widget placeholders and writes graphics commands out of band", async () => {
	const previousHome = process.env.PI_SPRITE_HOME;
	const previousOverride = process.env.PI_SPRITE_NATIVE_IMAGES;
	const home = mkdtempSync(join(tmpdir(), "pi-sprite-runtime-"));
	const writes: string[] = [];
	let runtime: ReturnType<typeof createSpriteRuntime> | undefined;
	try {
		process.env.PI_SPRITE_HOME = home;
		process.env.PI_SPRITE_NATIVE_IMAGES = "placeholder";
		setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
		setSpriteTerminalGraphicsSinkForTests({ write: (sequence) => writes.push(sequence) });
		const petDir = join(home, "pets", "placeholder-pet");
		mkdirSync(petDir, { recursive: true });
		await sharp({ create: { width: 8, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
			.composite([
				{
					input: Buffer.from('<svg width="4" height="4"><rect width="4" height="4" fill="#ff00ff"/></svg>'),
					left: 0,
					top: 0,
				},
				{
					input: Buffer.from('<svg width="4" height="4"><rect width="4" height="4" fill="#00ffff"/></svg>'),
					left: 4,
					top: 0,
				},
			])
			.png()
			.toFile(join(petDir, "idle-strip.png"));
		writeFileSync(
			join(petDir, "pet.json"),
			JSON.stringify({
				id: "placeholder-pet",
				name: "Placeholder Pet",
				sprites: { idle: "idle-strip.png" },
				frame: { width: 4, height: 4 },
			}),
		);
		writeFileSync(join(home, "state.json"), JSON.stringify({ selectedPetId: "placeholder-pet", visible: true }));

		const widgets: unknown[] = [];
		runtime = createSpriteRuntime();
		await runtime.start(fakeContext([], widgets));
		await new Promise((resolve) => setTimeout(resolve, 30));

		const widgetFactory = widgets.find(
			(widget): widget is () => { render(width: number): string[] } => typeof widget === "function",
		);
		assert.ok(widgetFactory);
		const rendered = widgetFactory().render(40).join("\n");
		assert.ok(rendered.includes(placeholderGlyph()));
		assert.equal(rendered.includes("\u001b_G"), false);
		assert.equal(writes.filter((write) => write.includes("a=t")).length, 2);
		assert.equal(writes.filter((write) => write.includes("U=1")).length, 2);

		const previousRendered = rendered;
		await new Promise((resolve) => setTimeout(resolve, 430));
		const nextWidgetFactory = [...widgets]
			.reverse()
			.find((widget: unknown): widget is () => { render(width: number): string[] } => typeof widget === "function");
		assert.ok(nextWidgetFactory);
		assert.notEqual(nextWidgetFactory().render(40).join("\n"), previousRendered);

		const widgetCountBeforeClear = widgets.length;
		let commandHandler: ((args: string, ctx: never) => Promise<void>) | undefined;
		runtime.registerCommands({
			registerCommand(_name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) {
				commandHandler = command.handler;
			},
		} as never);
		const clearWidgets: unknown[] = [];
		await commandHandler!("clear-native", fakeContext([], clearWidgets));
		const clearText = clearWidgets.flatMap((widget) => (Array.isArray(widget) ? widget : [])).join("\n");
		assert.match(clearText, /a=d,d=I/u);
		await new Promise((resolve) => setTimeout(resolve, 430));
		assert.equal(widgets.length, widgetCountBeforeClear);
	} finally {
		runtime?.shutdown();
		setSpriteTerminalGraphicsSinkForTests(undefined);
		if (previousHome === undefined) delete process.env.PI_SPRITE_HOME;
		else process.env.PI_SPRITE_HOME = previousHome;
		if (previousOverride === undefined) delete process.env.PI_SPRITE_NATIVE_IMAGES;
		else process.env.PI_SPRITE_NATIVE_IMAGES = previousOverride;
		setCapabilities({ images: null, trueColor: true, hyperlinks: true });
		rmSync(home, { recursive: true, force: true });
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
