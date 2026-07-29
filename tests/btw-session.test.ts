import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BtwAgentSession, createBtwForkManager } from "../src/btw/session.ts";

type Listener = (event: any) => void;

function fakeManager(initialMessages: any[] = []) {
	const messages = [...initialMessages];
	const entries: any[] = initialMessages.map((message, index) => ({ id: `seed-${index}`, type: "message", message }));
	return {
		appendMessage(message: any) {
			messages.push(message);
			entries.push({ id: `message-${entries.length}`, type: "message", message });
		},
		appendCustomMessageEntry(customType: string, content: string, display: boolean, details: unknown) {
			const message = { role: "custom", customType, content, display, details, timestamp: Date.now() };
			messages.push(message);
			entries.push({ id: `custom-${entries.length}`, type: "custom_message", message });
		},
		buildSessionContext: () => ({ messages: [...messages] }),
		getEntries: () => [...entries],
		getSessionId: () => "child-session-id",
		getSessionFile: () => "/sessions/child.jsonl",
	};
}

function fakeSdk(
	options: {
		delayCreate?: boolean;
		holdPrompt?: boolean;
		events?: any[];
		appendCreationEntry?: boolean;
		answers?: string[];
	} = {},
) {
	const created: any[] = [];
	const sessions: any[] = [];
	const create = async (config: any) => {
		created.push(config);
		if (options.delayCreate) await new Promise<void>((resolve) => setImmediate(resolve));
		if (options.appendCreationEntry) {
			config.sessionManager.appendCustomMessageEntry("sdk-model", "model configuration", false, {});
		}
		const listeners: Listener[] = [];
		const session: any = {
			agent: { state: { messages: config.sessionManager.buildSessionContext().messages } },
			sessionManager: config.sessionManager,
			sessionId: config.sessionManager.getSessionId(),
			sessionFile: config.sessionManager.getSessionFile(),
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
				session.promptContexts.push([...session.agent.state.messages]);
				for (const event of options.events ?? []) for (const listener of [...listeners]) listener(event);
				if (options.holdPrompt) return await new Promise<void>(() => {});
				const user = { role: "user", content: prompt, timestamp: Date.now() };
				const answer = {
					role: "assistant",
					content: [{ type: "text", text: options.answers?.[session.prompts.length - 1] ?? "answer" }],
				};
				config.sessionManager.appendMessage(user);
				config.sessionManager.appendMessage(answer);
				session.agent.state.messages = config.sessionManager.buildSessionContext().messages;
				for (const listener of [...listeners]) listener({ type: "message_end", message: answer });
			},
			prompts: [] as string[],
			promptContexts: [] as any[][],
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
	const state: { branch: any[]; leaf: string | null } = {
		branch: [{ id: "root", type: "message", message: { role: "user", content: "main context" } }],
		leaf: "root",
	};
	const ctx: any = {
		cwd: "/repo",
		model: { id: "model", provider: "test-provider", api: "openai-completions" },
		modelRegistry: { id: "registry" },
		getSystemPromptOptions: () => ({
			customPrompt: "normal Pi prompt",
			appendSystemPrompt: "normal appended guidance",
			contextFiles: [{ path: "/repo/AGENTS.md", content: "# Repo rules" }],
			skills: [
				{
					name: "repo-skill",
					description: "A repo skill",
					filePath: "/repo/SKILL.md",
					baseDir: "/repo",
					source: "project",
				},
			],
			cwd: "/repo",
		}),
		sessionManager: {
			getBranch: () => state.branch,
			getLeafId: () => state.leaf,
			getSessionId: () => "parent-session-id",
			getSessionFile: () => "/sessions/parent.jsonl",
		},
	};
	return { state, ctx };
}

function deps(sdk: ReturnType<typeof fakeSdk>) {
	const buildCalls: any[] = [];
	const forkManagers: any[] = [];
	return {
		buildCalls,
		forkManagers,
		dependencies: {
			create: sdk.create,
			buildContext(branch: any[], leaf: string) {
				buildCalls.push({ branch: [...branch], leaf });
				return { messages: branch.filter((entry) => entry.type === "message").map((entry) => entry.message) };
			},
			createForkManager() {
				const manager = fakeManager([{ role: "user", content: "main context" }]);
				forkManagers.push(manager);
				return manager;
			},
		} as any,
	};
}

test("real fork manager activates the exact parent path without claiming path-only child persistence", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sprite-btw-fork-"));
	try {
		const parentFile = join(root, "parent.jsonl");
		const header = {
			type: "session",
			version: 3,
			id: "parent-session",
			timestamp: "2026-07-29T00:00:00.000Z",
			cwd: "/repo",
		};
		const rootEntry = {
			type: "message",
			id: "aaaabbbb",
			parentId: null,
			timestamp: "2026-07-29T00:00:01.000Z",
			message: { role: "user", content: "root", timestamp: 1 },
		};
		const abandonedEntry = {
			type: "message",
			id: "ccccdddd",
			parentId: "aaaabbbb",
			timestamp: "2026-07-29T00:00:02.000Z",
			message: { role: "user", content: "abandoned", timestamp: 2 },
		};
		const activeEntry = {
			type: "message",
			id: "eeeeffff",
			parentId: "aaaabbbb",
			timestamp: "2026-07-29T00:00:03.000Z",
			message: { role: "user", content: "active", timestamp: 3 },
		};
		await writeFile(
			parentFile,
			`${[header, rootEntry, abandonedEntry, activeEntry].map((entry) => JSON.stringify(entry)).join("\n")}\n`,
		);
		const child = createBtwForkManager({
			cwd: "/repo",
			sessionManager: { getSessionFile: () => parentFile, getLeafId: () => "eeeeffff" },
		} as any);
		assert.equal(child.isPersisted(), true);
		assert.notEqual(child.getSessionFile(), parentFile);
		assert.equal(child.getHeader()?.parentSession, parentFile);
		assert.deepEqual(
			child.buildSessionContext().messages.map((message: any) => message.content),
			["root", "active"],
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("persistent BTW uses the exact active leaf as model context and continues a durable child session", async () => {
	const sdk = fakeSdk();
	const setup = deps(sdk);
	const { ctx } = context();
	const btw = new BtwAgentSession(setup.dependencies);
	await btw.ask(ctx as any, "first", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	await btw.ask(ctx as any, "follow-up", { seedFromMainBranch: true, thinkingLevel: "low" });
	assert.equal(sdk.created.length, 1);
	assert.deepEqual(
		setup.buildCalls.map((call) => call.leaf),
		["root"],
	);
	assert.equal(sdk.created[0].sessionManager.getSessionFile(), "/sessions/child.jsonl");
	assert.deepEqual(sdk.created[0].tools, ["read", "bash", "edit", "write"]);
	assert.equal(sdk.sessions[0].prompts.length, 2);
	assert.equal(btw.parentStatus(ctx as any).childSessionId, "child-session-id");
});

test("child inherits parent AGENTS and skills while recursive extensions stay disabled", async () => {
	const sdk = fakeSdk();
	const { ctx } = context();
	await new BtwAgentSession(deps(sdk).dependencies).ask(ctx as any, "inspect", {
		seedFromMainBranch: true,
		thinkingLevel: "xhigh",
	});
	const loader = sdk.created[0].resourceLoader;
	assert.deepEqual(loader.getAgentsFiles().agentsFiles, [{ path: "/repo/AGENTS.md", content: "# Repo rules" }]);
	assert.equal(loader.getSkills().skills[0].name, "repo-skill");
	assert.deepEqual(loader.getExtensions().extensions, []);
	assert.match(loader.getAppendSystemPrompt().join("\n"), /normal appended guidance/u);
	assert.match(loader.getAppendSystemPrompt().join("\n"), /Parent progress is not synchronized automatically/u);
});

test("explicit parent refresh adds only a bounded read-only snapshot", async () => {
	const sdk = fakeSdk();
	const setup = deps(sdk);
	const current = context();
	const btw = new BtwAgentSession(setup.dependencies);
	await btw.ask(current.ctx as any, "first", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	current.state.branch.push(
		{ id: "next-user", type: "message", message: { role: "user", content: "new parent work" } },
		{
			id: "next-assistant",
			type: "message",
			message: { role: "assistant", content: [{ type: "text", text: "progress" }] },
		},
	);
	current.state.leaf = "next-assistant";
	const before = btw.parentStatus(current.ctx as any);
	assert.equal(before.newEntries, 2);
	const refreshed = await btw.refreshParent(current.ctx as any, "low");
	assert.equal(refreshed.refreshedLeafId, "next-assistant");
	const refresh = sdk.sessions[0].agent.state.messages.find(
		(message: any) => message.customType === "pi-sprite-btw-parent-refresh",
	);
	assert.match(refresh.content, /new parent work/u);
	assert.match(refresh.content, /progress/u);
});

test("prompt completion, not agent_end, determines the final answer", async () => {
	const sdk = fakeSdk({
		events: [{ type: "agent_end", messages: [{ role: "assistant", content: [{ type: "text", text: "premature" }] }] }],
	});
	const answer = await new BtwAgentSession(deps(sdk).dependencies).ask(context().ctx as any, "question", {
		seedFromMainBranch: true,
		thinkingLevel: "xhigh",
	});
	assert.equal(answer, "answer");
});

test("an empty later response cannot reuse a previous successful answer", async () => {
	const sdk = fakeSdk({ answers: ["first answer", ""] });
	const btw = new BtwAgentSession(deps(sdk).dependencies);
	const ctx = context().ctx as any;
	assert.equal(await btw.ask(ctx, "first", { seedFromMainBranch: true, thinkingLevel: "xhigh" }), "first answer");
	await assert.rejects(
		btw.ask(ctx, "second", { seedFromMainBranch: true, thinkingLevel: "xhigh" }),
		/no assistant text/u,
	);
});

test("disposable BTW tangent neither builds nor seeds main context and is disposed", async () => {
	const sdk = fakeSdk();
	const setup = deps(sdk);
	await new BtwAgentSession(setup.dependencies).ask(context().ctx as any, "tangent", {
		seedFromMainBranch: false,
		thinkingLevel: "low",
	});
	assert.equal(setup.buildCalls.length, 0);
	assert.equal(sdk.sessions[0].disposed, 1);
});

test("restored visible BTW exchanges are persisted into the child transcript", async () => {
	const sdk = fakeSdk();
	const setup = deps(sdk);
	const btw = new BtwAgentSession(setup.dependencies, [
		{ question: "old question", answer: "old answer", timestamp: 1 },
	]);
	await btw.ask(context().ctx as any, "new question", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	const messages = setup.forkManagers[0].buildSessionContext().messages;
	assert.ok(messages.some((message: any) => message.content === "old question"));
	assert.ok(messages.some((message: any) => message.content?.[0]?.text === "old answer"));
});

test("fallback sessions seed parent model context before SDK configuration entries are appended", async () => {
	for (const fallback of ["ephemeral parent", "failed parent file or leaf lookup"]) {
		const sdk = fakeSdk({ appendCreationEntry: true });
		const current = context();
		if (fallback === "ephemeral parent") current.ctx.sessionManager.getSessionFile = () => undefined;
		else current.ctx.sessionManager.getLeafId = () => "missing-leaf";
		const dependencies = {
			create: sdk.create,
			buildContext(branch: any[]) {
				return { messages: branch.filter((entry) => entry.type === "message").map((entry) => entry.message) };
			},
			createForkManager() {
				return fakeManager();
			},
		} as any;
		await new BtwAgentSession(dependencies).ask(current.ctx as any, "fallback", {
			seedFromMainBranch: true,
			thinkingLevel: "xhigh",
		});
		assert.equal(sdk.sessions[0].promptContexts[0][0].content, "main context", fallback);
		assert.ok(
			sdk.created[0].sessionManager.getEntries().some((entry: any) => entry.message?.customType === "sdk-model"),
			fallback,
		);
	}
});

test("simultaneous asks reject before a second session is created", async () => {
	const sdk = fakeSdk({ delayCreate: true });
	const btw = new BtwAgentSession(deps(sdk).dependencies);
	const ctx = context().ctx as any;
	const first = btw.ask(ctx, "first", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
	await assert.rejects(btw.ask(ctx, "second", { seedFromMainBranch: true, thinkingLevel: "low" }), /already running/u);
	await first;
	assert.equal(sdk.created.length, 1);
});

test("cancel during delayed child creation prevents every prompt and disposes the unseen session", async () => {
	const sdk = fakeSdk({ delayCreate: true });
	const btw = new BtwAgentSession(deps(sdk).dependencies);
	const pending = btw.ask(context().ctx as any, "must not run", {
		seedFromMainBranch: true,
		thinkingLevel: "xhigh",
	});
	await btw.cancel();
	await assert.rejects(pending, /cancelled/u);
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(sdk.sessions.length, 1);
	assert.deepEqual(sdk.sessions[0].prompts, []);
	assert.equal(sdk.sessions[0].disposed, 1);
});

test("dispose and cancel settle callers and clean up SDK sessions", async () => {
	for (const action of ["cancel", "dispose"] as const) {
		const sdk = fakeSdk({ holdPrompt: true });
		const btw = new BtwAgentSession(deps(sdk).dependencies);
		const pending = btw.ask(context().ctx as any, "wait", { seedFromMainBranch: true, thinkingLevel: "xhigh" });
		await new Promise((resolve) => setImmediate(resolve));
		await btw[action]();
		await assert.rejects(pending, action === "cancel" ? /cancelled/u : /disposed/u);
		assert.equal(sdk.sessions[0].aborted, 1);
		if (action === "cancel") await btw.dispose();
	}
});

test("fails explicitly when no active model is available", async () => {
	const sdk = fakeSdk();
	const { ctx } = context();
	ctx.model = undefined;
	await assert.rejects(
		new BtwAgentSession(deps(sdk).dependencies).ask(ctx as any, "question", {
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
		],
	});
	const updates: any[] = [];
	await new BtwAgentSession(deps(sdk).dependencies).ask(context().ctx as any, "stream", {
		seedFromMainBranch: false,
		thinkingLevel: "xhigh",
		onUpdate: (update) => updates.push(update),
	});
	assert.deepEqual(
		updates.map((update) => update.kind),
		["thinking", "assistant", "tool", "tool", "tool"],
	);
});
