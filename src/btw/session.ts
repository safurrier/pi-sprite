import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import {
	buildSessionContext,
	createAgentSession,
	createExtensionRuntime,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ResourceLoader,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { extractAssistantText } from "../agent/side-session-text.ts";
import type { BtwEntry } from "./format.ts";

const BTW_SYSTEM_PROMPT = [
	"You are answering an explicit BTW side question for a Pi coding session.",
	"This is a separate continuing side thread. Do not continue the main turn or inject anything into it.",
	"You have normal coding tools in the same working directory as the main agent. File mutations can race with the main agent; call write/edit or mutation commands only when the user explicitly asks, and describe any mutation clearly.",
	"Answer concisely and practically.",
].join("\n");

function btwResourceLoader(): ResourceLoader {
	const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
	return {
		getExtensions: () => extensions,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => undefined,
		getAppendSystemPrompt: () => [BTW_SYSTEM_PROMPT],
		extendResources: () => {},
		reload: async () => {},
	};
}

export type BtwStreamUpdate = { kind: "thinking" | "tool" | "assistant"; text: string };
type BtwSession = Awaited<ReturnType<typeof createAgentSession>>["session"];
type SessionEvent = { type: string; [key: string]: unknown };
type BtwThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;

export type BtwSessionDependencies = {
	create: typeof createAgentSession;
	buildContext: typeof buildSessionContext;
};

function bounded(value: unknown, limit = 500): string {
	try {
		const text = typeof value === "string" ? value : JSON.stringify(value);
		return (text ?? "").replace(/\s+/gu, " ").trim().slice(0, limit);
	} catch {
		return "[unserializable]";
	}
}

function streamUpdate(event: SessionEvent): BtwStreamUpdate | undefined {
	if (event.type === "message_update") {
		const content = (event.message as { content?: unknown } | undefined)?.content;
		if (!Array.isArray(content)) return undefined;
		const thinking = content
			.filter((part) => part?.type === "thinking")
			.map((part) => part.thinking)
			.join("\n");
		const text = content
			.filter((part) => part?.type === "text")
			.map((part) => part.text)
			.join("\n");
		return thinking ? { kind: "thinking", text: bounded(thinking) } : text ? { kind: "assistant", text } : undefined;
	}
	if (!event.type.startsWith("tool_execution_")) return undefined;
	const name = bounded(event.toolName, 100) || "tool";
	if (event.type === "tool_execution_start") return { kind: "tool", text: `${name}: ${bounded(event.args, 240)}` };
	const result = bounded(event.type === "tool_execution_update" ? event.partialResult : event.result, 500);
	return { kind: "tool", text: `${name}${event.isError ? " failed" : ""}: ${result || "completed"}` };
}

function restoredMessages(entries: BtwEntry[], model: Model<any>): unknown[] {
	const usage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	return entries.flatMap((entry) => [
		{ role: "user", content: entry.question, timestamp: entry.timestamp },
		{
			role: "assistant",
			content: [{ type: "text", text: entry.answer }],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage,
			stopReason: "stop",
			timestamp: entry.timestamp,
		} satisfies AssistantMessage,
	]);
}

/** A persistent, in-memory AgentSession that never replaces Pi's active runtime. */
export class BtwAgentSession {
	private session: BtwSession | undefined;
	private busy = false;
	private disposed = false;
	private generation = 0;
	private currentSession: BtwSession | undefined;
	private active?: { reject: (error: Error) => void; settled: boolean; unsubscribe?: () => void };

	constructor(
		private readonly dependencies: BtwSessionDependencies = {
			create: createAgentSession,
			buildContext: buildSessionContext,
		},
		private readonly restoredThread: BtwEntry[] = [],
	) {}

	get isRunning(): boolean {
		return this.busy;
	}

	async ask(
		ctx: ExtensionCommandContext,
		prompt: string,
		options: {
			seedFromMainBranch: boolean;
			thinkingLevel: BtwThinkingLevel;
			onUpdate?: (update: BtwStreamUpdate) => void;
		},
	): Promise<string> {
		if (!ctx.model) throw new Error("No active model selected for /btw.");
		// Set this before any await: two simultaneous callers must not both initialize.
		if (this.busy || this.disposed) throw new Error("A BTW response is already running.");
		this.busy = true;
		const generation = this.generation;
		let session: BtwSession | undefined;
		try {
			session = options.seedFromMainBranch
				? await this.ensurePersistent(ctx, options.thinkingLevel)
				: await this.createDisposable(ctx, options.thinkingLevel);
			if (this.disposed || generation !== this.generation) throw new Error("BTW request was cancelled.");
			this.currentSession = session;
			return await this.run(session, prompt, options.onUpdate);
		} finally {
			if (this.currentSession === session) this.currentSession = undefined;
			if (!options.seedFromMainBranch) session?.dispose();
			this.busy = false;
		}
	}

	async cancel(): Promise<void> {
		await this.stop(new Error("BTW request was cancelled."));
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.generation++;
		await this.stop(new Error("BTW session was disposed."));
		this.session?.dispose();
		this.session = undefined;
	}

	private async stop(error: Error): Promise<void> {
		const active = this.active;
		if (!active || active.settled) return;
		active.settled = true;
		active.unsubscribe?.();
		if (this.active === active) this.active = undefined;
		active.reject(error);
		try {
			await this.currentSession?.abort();
		} catch {
			// Disposal still settles the caller even if the SDK abort fails.
		}
	}

	private async run(
		session: BtwSession,
		prompt: string,
		onUpdate?: (update: BtwStreamUpdate) => void,
	): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const active = { reject, settled: false, unsubscribe: undefined as (() => void) | undefined };
			this.active = active;
			const finish = (error?: Error, text?: string) => {
				if (active.settled) return;
				active.settled = true;
				active.unsubscribe?.();
				if (this.active === active) this.active = undefined;
				if (error) reject(error);
				else if (text) resolve(text);
				else reject(new Error("BTW response returned no assistant text."));
			};
			active.unsubscribe = session.subscribe((event: SessionEvent) => {
				const update = streamUpdate(event);
				if (update) onUpdate?.(update);
				if (event.type === "agent_end" && !event.willRetry)
					finish(undefined, extractAssistantText((event.messages as unknown[]) ?? []));
			});
			void session
				.prompt(prompt, { expandPromptTemplates: false, source: "extension" })
				.catch((error: unknown) => finish(error instanceof Error ? error : new Error("BTW session failed.")));
		});
	}

	private async createSession(ctx: ExtensionCommandContext, thinkingLevel: BtwThinkingLevel): Promise<BtwSession> {
		const created = await this.dependencies.create({
			cwd: ctx.cwd,
			sessionManager: SessionManager.inMemory(ctx.cwd),
			model: ctx.model!,
			modelRegistry: ctx.modelRegistry as never,
			thinkingLevel,
			tools: ["read", "bash", "edit", "write"],
			resourceLoader: btwResourceLoader(),
		});
		return created.session;
	}

	private async createDisposable(ctx: ExtensionCommandContext, thinkingLevel: BtwThinkingLevel): Promise<BtwSession> {
		// Never inspect or copy the main branch for /btw:ask.
		return this.createSession(ctx, thinkingLevel);
	}

	private async ensurePersistent(ctx: ExtensionCommandContext, thinkingLevel: BtwThinkingLevel): Promise<BtwSession> {
		if (this.session) {
			this.session.setThinkingLevel(thinkingLevel);
			return this.session;
		}
		const branch = Array.from(ctx.sessionManager.getBranch() as Iterable<any>);
		const leafId = ctx.sessionManager.getLeafId();
		const mainContext = this.dependencies.buildContext(branch, leafId);
		const session = await this.createSession(ctx, thinkingLevel);
		if (this.disposed) {
			session.dispose();
			throw new Error("BTW session was disposed.");
		}
		// Seed exactly once, using the active branch leaf. Restored visible exchanges
		// continue this private transcript; hidden custom entries are never copied.
		session.agent.state.messages = [
			...mainContext.messages,
			...restoredMessages(this.restoredThread, ctx.model!),
		] as never;
		this.session = session;
		return session;
	}
}
