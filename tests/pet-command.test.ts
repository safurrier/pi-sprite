import assert from "node:assert/strict";
import test from "node:test";
import { registerSpriteCommands, type SpriteCommandRuntime } from "../src/sprite/commands.ts";

function fakeContext() {
	const notifications: Array<{ message: string; level?: string }> = [];
	return {
		notifications,
		ctx: {
			ui: {
				notify(message: string, level?: string) {
					notifications.push({ message, level });
				},
				setWidget() {},
			},
		} as never,
	};
}

function fakeRuntime(): SpriteCommandRuntime & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		setCommandContext: () => calls.push("ctx"),
		statusText: () => "pi-sprite: shown; pet=default",
		selectPet: (id) => calls.push(`select:${id}`),
		importPetUrl: async () => ({
			id: "url-pet",
			dir: "/tmp/url-pet",
			manifest: { id: "url-pet", name: "URL Pet", sprites: { idle: "idle.png" } },
		}),
		show: () => calls.push("show"),
		hide: () => calls.push("hide"),
		setSize: (size) => calls.push(`size:${size}`),
		setLabel: (visible) => calls.push(`label:${visible}`),
		setAlign: (align) => calls.push(`align:${align}`),
		clearTurnStatus: () => calls.push("turn:clear"),
		setTurnStatusEnabled: (enabled) => calls.push(`turn:${enabled}`),
		clearLiveStatus: () => calls.push("live:clear"),
		setLiveStatusEnabled: (enabled) => calls.push(`live:${enabled}`),
		clearNative: () => calls.push("clear-native"),
		getSpriteName: () => "URL Pet",
	};
}

function registeredHandler(runtime = fakeRuntime()) {
	let handler: ((args: string, ctx: never) => Promise<void>) | undefined;
	registerSpriteCommands(
		{
			registerCommand(_name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) {
				handler = command.handler;
			},
		} as never,
		runtime,
	);
	assert.ok(handler);
	return { handler, runtime };
}

test("pet command adapter routes status and settings without owning runtime state", async () => {
	const { handler, runtime } = registeredHandler();
	const { ctx, notifications } = fakeContext();

	await handler("", ctx);
	await handler("hide", ctx);
	await handler("show", ctx);
	await handler("size tiny", ctx);
	await handler("label on", ctx);
	await handler("align left", ctx);
	await handler("turn-status clear", ctx);
	await handler("turn-status off", ctx);
	await handler("live-status clear", ctx);
	await handler("live-status on", ctx);
	await handler("clear-native", ctx);

	assert.deepEqual(runtime.calls, [
		"ctx",
		"ctx",
		"hide",
		"ctx",
		"show",
		"ctx",
		"size:tiny",
		"ctx",
		"label:true",
		"ctx",
		"align:left",
		"ctx",
		"turn:clear",
		"ctx",
		"turn:false",
		"ctx",
		"live:clear",
		"ctx",
		"live:true",
		"ctx",
		"clear-native",
	]);
	assert.match(notifications[0]?.message ?? "", /pi-sprite: shown/u);
});

test("pet command adapter rejects invalid enum values", async () => {
	const { handler } = registeredHandler();
	await assert.rejects(() => handler("size enormous", fakeContext().ctx), /tiny\|small\|medium\|large/u);
	await assert.rejects(() => handler("align center", fakeContext().ctx), /left\|right/u);
});
