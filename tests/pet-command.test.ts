import assert from "node:assert/strict";
import test from "node:test";
import { petCreatePrompt, registerSpriteCommands, type SpriteCommandRuntime } from "../src/sprite/commands.ts";

function fakeContext(options: { idle?: boolean } = {}) {
	const notifications: Array<{ message: string; level?: string }> = [];
	return {
		notifications,
		ctx: {
			isIdle: () => options.idle ?? true,
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

function registeredHandlers(runtime = fakeRuntime()) {
	const handlers = new Map<string, (args: string, ctx: never) => Promise<void>>();
	const sent: Array<{ content: string; options?: unknown }> = [];
	registerSpriteCommands(
		{
			registerCommand(name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) {
				handlers.set(name, command.handler);
			},
			sendUserMessage(content: string, options?: unknown) {
				sent.push({ content, options });
			},
		} as never,
		runtime,
	);
	const pet = handlers.get("pet");
	const sprite = handlers.get("sprite");
	assert.ok(pet);
	assert.ok(sprite);
	return { pet, sprite, runtime, sent };
}

test("pet command adapter routes status and settings without owning runtime state", async () => {
	const { pet, runtime } = registeredHandlers();
	const { ctx, notifications } = fakeContext();

	await pet("", ctx);
	await pet("hide", ctx);
	await pet("show", ctx);
	await pet("size tiny", ctx);
	await pet("label on", ctx);
	await pet("align left", ctx);
	await pet("turn-status clear", ctx);
	await pet("turn-status off", ctx);
	await pet("live-status clear", ctx);
	await pet("live-status on", ctx);
	await pet("clear-native", ctx);

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

test("pet create bridges to the authoring skill with an OpenAI API-key caveat", async () => {
	const { pet, sent } = registeredHandlers();
	const { ctx, notifications } = fakeContext();

	await pet("create a tiny neon raccoon", ctx);

	assert.equal(sent.length, 1);
	assert.match(sent[0]?.content ?? "", /^\/skill:pi-sprite-authoring/u);
	assert.match(sent[0]?.content ?? "", /tiny neon raccoon/u);
	assert.match(sent[0]?.content ?? "", /OPENAI_API_KEY/u);
	assert.match(notifications[0]?.message ?? "", /OpenAI\/GPT image generation requires/u);
});

test("pet create queues as a follow-up while the agent is busy", async () => {
	const { pet, sent } = registeredHandlers();

	await pet("create", fakeContext({ idle: false }).ctx);

	assert.deepEqual(sent[0]?.options, { deliverAs: "followUp" });
});

test("sprite command is a discovery alias for pet", async () => {
	const { sprite, runtime } = registeredHandlers();
	const { ctx, notifications } = fakeContext();

	await sprite("", ctx);
	await sprite("show", ctx);

	assert.match(notifications[0]?.message ?? "", /uses \/pet as its main command/u);
	assert.ok(runtime.calls.includes("show"));
});

test("pet create prompt keeps the skill bridge explicit", () => {
	const prompt = petCreatePrompt("make Wumpus cozy");
	assert.match(prompt, /^\/skill:pi-sprite-authoring/u);
	assert.match(prompt, /make Wumpus cozy/u);
	assert.match(prompt, /OpenAI API key/u);
});

test("pet command adapter rejects invalid enum values", async () => {
	const { pet } = registeredHandlers();
	await assert.rejects(() => pet("size enormous", fakeContext().ctx), /tiny\|small\|medium\|large/u);
	await assert.rejects(() => pet("align center", fakeContext().ctx), /left\|right/u);
});
