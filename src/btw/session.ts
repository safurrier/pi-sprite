import {
	createAgentSession,
	createExtensionRuntime,
	type ExtensionCommandContext,
	type ResourceLoader,
	SessionManager,
} from "@earendil-works/pi-coding-agent";

const SIDE_SYSTEM_PROMPT = [
	"You are answering an explicit side question for a Pi coding session.",
	"This is a separate BTW thread, not the main working turn.",
	"Answer concisely and do not mutate files or assume you should continue the main task.",
].join("\n");

function sideResourceLoader(ctx: ExtensionCommandContext): ResourceLoader {
	const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
	return {
		getExtensions: () => extensions,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => ctx.getSystemPrompt?.(),
		getAppendSystemPrompt: () => [SIDE_SYSTEM_PROMPT],
		extendResources: () => {},
		reload: async () => {},
	};
}

function extractAssistantText(messages: unknown[]): string {
	for (const message of [...messages].reverse()) {
		const role = (message as { role?: string })?.role;
		if (role !== "assistant") continue;
		const content = (message as { content?: unknown })?.content;
		if (typeof content === "string") return content.trim();
		if (!Array.isArray(content)) continue;
		const text = content
			.map((part) =>
				part && typeof part === "object" && (part as { type?: string }).type === "text"
					? ((part as { text?: string }).text ?? "")
					: "",
			)
			.join("\n")
			.trim();
		if (text) return text;
	}
	return "";
}

export async function answerWithSideSession(ctx: ExtensionCommandContext, prompt: string): Promise<string | undefined> {
	if (!ctx.model) return undefined;
	let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
	let unsubscribe: (() => void) | undefined;
	try {
		const created = await createAgentSession({
			cwd: ctx.cwd,
			sessionManager: SessionManager.inMemory(ctx.cwd),
			model: ctx.model,
			modelRegistry: ctx.modelRegistry as any,
			resourceLoader: sideResourceLoader(ctx),
			tools: [],
		});
		session = created.session;
		return await new Promise<string | undefined>((resolve) => {
			const timer = setTimeout(() => resolve(undefined), 120_000);
			unsubscribe = session?.subscribe((event) => {
				if (event.type !== "agent_end") return;
				clearTimeout(timer);
				resolve(extractAssistantText(event.messages as unknown[]));
			});
			void session?.sendUserMessage(prompt).catch(() => {
				clearTimeout(timer);
				resolve(undefined);
			});
		});
	} catch {
		return undefined;
	} finally {
		try {
			unsubscribe?.();
			session?.dispose();
		} catch {
			/* best effort cleanup */
		}
	}
}
