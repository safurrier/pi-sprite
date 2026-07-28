import assert from "node:assert/strict";
import test from "node:test";
import { BtwAgentSession } from "../src/btw/session.ts";

type Listener = (event: any) => void;
function fakeSdk(options: { delayCreate?: boolean; holdPrompt?: boolean; events?: any[] } = {}) {
	const created: any[] = [];
	const sessions: any[] = [];
	const create = async (config: any) => {
		created.push(config);
		if (options.delayCreate) await new Promise<void>((resolve) => setImmediate(resolve));
		const listeners: Listener[] = [];
		const session: any = {
			agent: { state: { messages: [] } },
			disposed: 0,
			aborted: 0,
			thinkingLevels: [] as string[],
			setThinkingLevel(level: string) {
				session.thinkingLevels.push(level);
			},
			subscribe(listener: Listener) {
				listeners.push(listener);
				return () => listeners.splice(listeners.indexOf(listener), 1);
			},
			async prompt(prompt: string) {
				session.prompts.push(prompt);
				for (const event of options.events ?? []) for (const listener of [...listeners]) listener(event);
				if (!options.holdPrompt)
					for (const listener of [...listeners])
						listener({
							type: "agent_end",
							messages: [{ role: "assistant", content: [{ type: "text", text: "answer" }] }],
						});
			},
			prompts: [] as string[],
			async abort() {
				session.aborted++;
			},
			dispose() {
				session.disposed++;
			},
		};
		sessions.push(session);
		return { session };
	};
	return { created, sessions, create };
}
function context() {
	return {
		cwd: "/repo",
		model: { id: "model", provider: "test-provider", api: "openai-completions" },
		modelRegistry: { id: "registry" },
		sessionManager: {
			getBranch: () => [{ id: "root", type: "message", message: { role: "user", content: "main context" } }],
			getLeafId: () => "root",
		},
	} as any;
}
function deps(sdk: ReturnType<typeof fakeSdk>) {
	const buildCalls: any[] = [];
	return {
		buildCalls,
		dependencies: {
			create: sdk.create,
			buildContext(branch: any[], leaf: string) {
				buildCalls.push({ branch, leaf });
				return { messages: [{ role: "user", content: "main context" }], thinkingLevel: "low" };
			},
		} as any,
	};
}

test("persistent BTW seeds the active leaf once and continues its AgentSession transcript", async () => {
	const sdk = fakeSdk();
	const setup = deps(sdk);
	const btw = new BtwAgentSession(setup.dependencies);
	await btw.ask(context(), "first", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	await btw.ask(context(), "follow-up", { seedFromMainBranch: true, thinkingLevel: "low" });
	assert.equal(sdk.created.length, 1);
	assert.deepEqual(
		setup.buildCalls.map((call) => call.leaf),
		["root"],
	);
	assert.equal(sdk.created[0].cwd, "/repo");
	assert.equal(sdk.created[0].model.id, "model");
	assert.equal(sdk.created[0].thinkingLevel, "xhigh");
	assert.deepEqual(sdk.created[0].tools, ["read", "bash", "edit", "write"]);
	assert.deepEqual(sdk.sessions[0].thinkingLevels, ["low"]);
	assert.equal(sdk.sessions[0].prompts.length, 2);
});

test("disposable BTW tangent neither builds nor seeds main context and is disposed", async () => {
	const sdk = fakeSdk();
	const setup = deps(sdk);
	const btw = new BtwAgentSession(setup.dependencies);
	await btw.ask(context(), "tangent", { seedFromMainBranch: false, thinkingLevel: "low" });
	await btw.ask(context(), "contextual", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	assert.equal(setup.buildCalls.length, 1);
	assert.equal(sdk.sessions[0].agent.state.messages.length, 0);
	assert.equal(sdk.created[0].thinkingLevel, "low");
	assert.equal(sdk.created[1].thinkingLevel, "xhigh");
	assert.equal(sdk.sessions[0].disposed, 1);
	assert.equal(sdk.sessions[1].agent.state.messages[0].content, "main context");
});

test("restored visible BTW exchanges are replayed into the fresh private transcript", async () => {
	const sdk = fakeSdk();
	const setup = deps(sdk);
	const btw = new BtwAgentSession(setup.dependencies, [
		{ question: "old question", answer: "old answer", timestamp: 1 },
	]);
	await btw.ask(context(), "new question", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	assert.deepEqual(
		sdk.sessions[0].agent.state.messages.slice(1).map((message: any) => message.role),
		["user", "assistant"],
	);
	assert.equal(sdk.sessions[0].agent.state.messages[1].content, "old question");
	assert.deepEqual(sdk.sessions[0].agent.state.messages[2], {
		role: "assistant",
		content: [{ type: "text", text: "old answer" }],
		api: "openai-completions",
		provider: "test-provider",
		model: "model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1,
	});
});

test("simultaneous asks reject before a second session is created", async () => {
	const sdk = fakeSdk({ delayCreate: true });
	const setup = deps(sdk);
	const btw = new BtwAgentSession(setup.dependencies);
	const first = btw.ask(context(), "first", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	await assert.rejects(
		btw.ask(context(), "second", { seedFromMainBranch: true, thinkingLevel: "low" }),
		/already running/u,
	);
	await first;
	assert.equal(sdk.created.length, 1);
});

test("dispose settles an active caller and cleans up its SDK session", async () => {
	const sdk = fakeSdk({ holdPrompt: true });
	const setup = deps(sdk);
	const btw = new BtwAgentSession(setup.dependencies);
	const pending = btw.ask(context(), "wait", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	await new Promise((resolve) => setImmediate(resolve));
	await btw.dispose();
	await assert.rejects(pending, /disposed/u);
	assert.equal(sdk.sessions[0].disposed, 1);
});

test("cancel settles an active caller without leaving it pending", async () => {
	const sdk = fakeSdk({ holdPrompt: true });
	const btw = new BtwAgentSession(deps(sdk).dependencies);
	const pending = btw.ask(context(), "wait", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	await new Promise((resolve) => setImmediate(resolve));
	await btw.cancel();
	await btw.dispose();
	await assert.rejects(pending, /cancelled/u);
	assert.equal(sdk.sessions[0].aborted, 1);
});

test("fails explicitly when no active model is available", async () => {
	const sdk = fakeSdk();
	const ctx = context();
	ctx.model = undefined;
	await assert.rejects(
		new BtwAgentSession(deps(sdk).dependencies).ask(ctx, "question", {
			seedFromMainBranch: true,
			thinkingLevel: "xhigh",
		}),
		/No active model/u,
	);
	assert.equal(sdk.created.length, 0);
});

test("maps assistant thinking/text and tool metadata into bounded stream updates", async () => {
	const sdk = fakeSdk({
		events: [
			{ type: "message_update", message: { content: [{ type: "thinking", thinking: "considering" }] } },
			{ type: "message_update", message: { content: [{ type: "text", text: "draft" }] } },
			{ type: "tool_execution_start", toolName: "bash", args: { command: "pwd" } },
			{ type: "tool_execution_update", toolName: "bash", partialResult: "partial" },
			{ type: "tool_execution_end", toolName: "bash", result: "done", isError: false },
			{
				type: "tool_execution_start",
				toolName: "circular",
				args: (() => {
					const value: any = { amount: 1n };
					value.self = value;
					return value;
				})(),
			},
		],
	});
	const updates: any[] = [];
	await new BtwAgentSession(deps(sdk).dependencies).ask(context(), "stream", {
		seedFromMainBranch: false,
		thinkingLevel: "xhigh",
		onUpdate: (update) => updates.push(update),
	});
	assert.deepEqual(
		updates.map((update) => update.kind),
		["thinking", "assistant", "tool", "tool", "tool", "tool"],
	);
	assert.match(updates[2].text, /bash.*pwd/u);
	assert.match(updates[4].text, /done/u);
	assert.match(updates[5].text, /circular: \[unserializable\]/u);
});
