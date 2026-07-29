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
	"This is a separate continuing child thread forked from the main Pi session. Do not continue the main turn or inject anything into it.",
	"You have normal coding tools in the same working directory as the main agent. File mutations can race with the main agent; call write/edit or mutation commands only when the user explicitly asks, and describe any mutation clearly.",
	"Parent progress is not synchronized automatically. Use pi-sprite-btw-parent-refresh messages only as read-only snapshots requested by the user.",
	"Answer concisely and practically.",
].join("\n");

function btwResourceLoader(ctx: ExtensionCommandContext): ResourceLoader {
	const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
	const options = ctx.getSystemPromptOptions();
	return {
		getExtensions: () => extensions,
		getSkills: () => ({ skills: options.skills ?? [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: options.contextFiles ?? [] }),
		getSystemPrompt: () => options.customPrompt,
		getAppendSystemPrompt: () => [options.appendSystemPrompt, BTW_SYSTEM_PROMPT].filter(Boolean) as string[],
		extendResources: () => {},
		reload: async () => {},
	};
}

export type BtwStreamUpdate = { kind: "thinking" | "tool" | "assistant"; text: string };
export type BtwParentStatus = {
	parentSessionId: string;
	parentSessionFile?: string;
	forkLeafId: string | null;
	currentLeafId: string | null;
	refreshedLeafId: string | null;
	newEntries: number;
	childSessionId?: string;
	childSessionFile?: string;
};
type BtwSession = Awaited<ReturnType<typeof createAgentSession>>["session"];
type SessionEvent = { type: string; [key: string]: unknown };
type BtwThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;

type ForkIdentity = {
	parentSessionId: string;
	parentSessionFile?: string;
	forkLeafId: string | null;
	forkBranchLength: number;
	parentMessageCount: number;
	refreshedLeafId: string | null;
};

export type BtwSessionDependencies = {
	create: typeof createAgentSession;
	buildContext: typeof buildSessionContext;
	createForkManager: (ctx: ExtensionCommandContext) => SessionManager;
};

export function createBtwForkManager(ctx: ExtensionCommandContext): SessionManager {
	const parentFile = ctx.sessionManager.getSessionFile();
	const leafId = ctx.sessionManager.getLeafId();
	if (parentFile && leafId) {
		const source = SessionManager.open(parentFile);
		if (source.getEntry(leafId)) {
			const fork = SessionManager.forkFrom(parentFile, ctx.cwd, source.getSessionDir());
			fork.branch(leafId);
			return fork;
		}
	}
	return SessionManager.create(ctx.cwd, undefined, { parentSession: parentFile });
}

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

function restoredMessages(entries: BtwEntry[], model: Model<any>): Array<{ role: "user" } | AssistantMessage> {
	const usage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	return entries.flatMap((entry) => [
		{ role: "user" as const, content: entry.question, timestamp: entry.timestamp },
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

function messageText(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return bounded(content, 800);
	if (!Array.isArray(content)) return "";
	return bounded(
		content
			.filter((part) => part?.type === "text")
			.map((part) => part.text)
			.join("\n"),
		800,
	);
}

/** A persistent child AgentSession that never replaces Pi's active runtime. */
export class BtwAgentSession {
	private session: BtwSession | undefined;
	private fork: ForkIdentity | undefined;
	private busy = false;
	private disposed = false;
	private generation = 0;
	private currentSession: BtwSession | undefined;
	private active?: {
		cancellation: Promise<never>;
		reject: (error: Error) => void;
		settled: boolean;
		unsubscribe?: () => void;
	};

	constructor(
		private readonly dependencies: BtwSessionDependencies = {
			create: createAgentSession,
			buildContext: buildSessionContext,
			createForkManager: createBtwForkManager,
		},
		private readonly restoredThread: BtwEntry[] = [],
	) {}

	get isRunning(): boolean {
		return this.busy;
	}

	parentStatus(ctx: ExtensionCommandContext): BtwParentStatus {
		const currentBranchLength = Array.from(ctx.sessionManager.getBranch() as Iterable<unknown>).length;
		return {
			parentSessionId: ctx.sessionManager.getSessionId(),
			parentSessionFile: ctx.sessionManager.getSessionFile(),
			forkLeafId: this.fork?.forkLeafId ?? null,
			currentLeafId: ctx.sessionManager.getLeafId(),
			refreshedLeafId: this.fork?.refreshedLeafId ?? null,
			newEntries: Math.max(0, currentBranchLength - (this.fork?.forkBranchLength ?? currentBranchLength)),
			childSessionId: this.session?.sessionId,
			childSessionFile: this.session?.sessionFile,
		};
	}

	async refreshParent(ctx: ExtensionCommandContext, thinkingLevel: BtwThinkingLevel): Promise<BtwParentStatus> {
		const session = await this.ensurePersistent(ctx, thinkingLevel);
		const branch = Array.from(ctx.sessionManager.getBranch() as Iterable<any>);
		const leafId = ctx.sessionManager.getLeafId();
		const context = this.dependencies.buildContext(branch, leafId);
		const start = this.fork?.parentMessageCount ?? context.messages.length;
		const delta = context.messages.slice(start).slice(-8);
		const lines = delta
			.map((message: any) => `${bounded(message.role, 40) || "message"}: ${messageText(message)}`)
			.filter((line: string) => !line.endsWith(": "));
		const content = [
			"Read-only parent-session refresh requested by the user.",
			`Parent leaf: ${leafId ?? "none"}. New contextual messages: ${delta.length}.`,
			...(lines.length ? lines : ["No new parent messages since the previous snapshot."]),
		].join("\n");
		session.sessionManager.appendCustomMessageEntry("pi-sprite-btw-parent-refresh", content, false, {
			parentSessionId: ctx.sessionManager.getSessionId(),
			parentLeafId: leafId,
		});
		session.agent.state.messages = session.sessionManager.buildSessionContext().messages as never;
		if (this.fork) {
			this.fork.parentMessageCount = context.messages.length;
			this.fork.refreshedLeafId = leafId;
		}
		return this.parentStatus(ctx);
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
		if (this.busy || this.disposed) throw new Error("A BTW response is already running.");
		this.busy = true;
		const generation = this.generation;
		const active = this.startActive();
		let session: BtwSession | undefined;
		try {
			const creation = options.seedFromMainBranch
				? this.ensurePersistent(ctx, options.thinkingLevel, generation)
				: this.createDisposable(ctx, options.thinkingLevel, generation);
			session = await Promise.race([creation, active.cancellation]);
			if (this.disposed || generation !== this.generation) throw new Error("BTW request was cancelled.");
			this.currentSession = session;
			return await this.run(session, prompt, active, options.onUpdate);
		} finally {
			if (this.currentSession === session) this.currentSession = undefined;
			if (!options.seedFromMainBranch) session?.dispose();
			active.settled = true;
			active.unsubscribe?.();
			if (this.active === active) this.active = undefined;
			this.busy = false;
		}
	}

	async cancel(): Promise<void> {
		if (!this.busy) return;
		this.generation++;
		await this.stop(new Error("BTW request was cancelled."));
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.generation++;
		await this.stop(new Error("BTW session was disposed."));
		this.session?.dispose();
		this.session = undefined;
	}

	private startActive(): NonNullable<BtwAgentSession["active"]> {
		let rejectCancellation!: (error: Error) => void;
		const cancellation = new Promise<never>((_resolve, reject) => {
			rejectCancellation = reject;
		});
		const active = {
			cancellation,
			reject: rejectCancellation,
			settled: false,
			unsubscribe: undefined as (() => void) | undefined,
		};
		this.active = active;
		return active;
	}

	private async stop(error: Error): Promise<void> {
		const active = this.active;
		if (!active || active.settled) return;
		active.settled = true;
		active.unsubscribe?.();
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
		active: NonNullable<BtwAgentSession["active"]>,
		onUpdate?: (update: BtwStreamUpdate) => void,
	): Promise<string> {
		active.unsubscribe = session.subscribe((event: SessionEvent) => {
			const update = streamUpdate(event);
			if (update) onUpdate?.(update);
		});
		await Promise.race([
			session.prompt(prompt, { expandPromptTemplates: false, source: "extension" }),
			active.cancellation,
		]);
		const text = extractAssistantText(session.agent.state.messages as unknown[]);
		if (!text) throw new Error("BTW response returned no assistant text.");
		return text;
	}

	private async createSession(
		ctx: ExtensionCommandContext,
		thinkingLevel: BtwThinkingLevel,
		sessionManager: SessionManager,
	): Promise<BtwSession> {
		const created = await this.dependencies.create({
			cwd: ctx.cwd,
			sessionManager,
			model: ctx.model!,
			modelRegistry: ctx.modelRegistry as never,
			thinkingLevel,
			tools: ["read", "bash", "edit", "write"],
			resourceLoader: btwResourceLoader(ctx),
		});
		return created.session;
	}

	private async createDisposable(
		ctx: ExtensionCommandContext,
		thinkingLevel: BtwThinkingLevel,
		expectedGeneration: number,
	): Promise<BtwSession> {
		const session = await this.createSession(ctx, thinkingLevel, SessionManager.inMemory(ctx.cwd));
		if (this.disposed || expectedGeneration !== this.generation) {
			session.dispose();
			throw new Error(this.disposed ? "BTW session was disposed." : "BTW request was cancelled.");
		}
		return session;
	}

	private async ensurePersistent(
		ctx: ExtensionCommandContext,
		thinkingLevel: BtwThinkingLevel,
		expectedGeneration?: number,
	): Promise<BtwSession> {
		if (this.session) {
			this.session.setThinkingLevel(thinkingLevel);
			return this.session;
		}
		const branch = Array.from(ctx.sessionManager.getBranch() as Iterable<any>);
		const leafId = ctx.sessionManager.getLeafId();
		const mainContext = this.dependencies.buildContext(branch, leafId);
		const manager = this.dependencies.createForkManager(ctx);
		const hasForkedParentContext = manager.getEntries().length > 0;
		const restored = restoredMessages(this.restoredThread, ctx.model!);
		for (const message of restored) manager.appendMessage(message as never);
		const session = await this.createSession(ctx, thinkingLevel, manager);
		if (!hasForkedParentContext) session.agent.state.messages = [...mainContext.messages, ...restored] as never;
		if (this.disposed || (expectedGeneration !== undefined && expectedGeneration !== this.generation)) {
			session.dispose();
			throw new Error(this.disposed ? "BTW session was disposed." : "BTW request was cancelled.");
		}
		this.fork = {
			parentSessionId: ctx.sessionManager.getSessionId(),
			parentSessionFile: ctx.sessionManager.getSessionFile(),
			forkLeafId: leafId,
			forkBranchLength: branch.length,
			parentMessageCount: mainContext.messages.length,
			refreshedLeafId: leafId,
		};
		this.session = session;
		return session;
	}
}
