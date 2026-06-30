import {
	createAgentSession,
	createExtensionRuntime,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ResourceLoader,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { extractAssistantText } from "./side-session-text.ts";
import type { SideCompletionRequest, SideCompletionResult } from "./side-session-types.ts";

const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_TIMEOUT_MS = 120_000;

const SIDE_SESSION_SAFETY_PROMPT = [
	"You are running in an isolated side session for a Pi coding-agent extension.",
	"Answer only the explicit side-session request.",
	"Do not mutate files, call tools, or continue the main coding task.",
].join("\n");

function sideResourceLoader(systemPrompt?: string): ResourceLoader {
	const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
	const prompts = [SIDE_SESSION_SAFETY_PROMPT, systemPrompt].filter((prompt): prompt is string =>
		Boolean(prompt?.trim()),
	);
	return {
		getExtensions: () => extensions,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => undefined,
		getAppendSystemPrompt: () => prompts,
		extendResources: () => {},
		reload: async () => {},
	};
}

export async function completeWithSideSession(
	ctx: ExtensionCommandContext | ExtensionContext,
	request: SideCompletionRequest,
): Promise<SideCompletionResult> {
	if (!ctx.model) return { ok: false, reason: "no-model", message: "No active model selected." };
	let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
	let unsubscribe: (() => void) | undefined;
	const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
	const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	try {
		const cappedModel = {
			...ctx.model,
			maxTokens: Math.min(ctx.model.maxTokens ?? maxTokens, maxTokens),
		};
		const created = await createAgentSession({
			cwd: ctx.cwd,
			sessionManager: SessionManager.inMemory(ctx.cwd),
			model: cappedModel,
			modelRegistry: ctx.modelRegistry as never,
			resourceLoader: sideResourceLoader(request.systemPrompt),
			tools: [],
		});
		session = created.session;
		return await new Promise<SideCompletionResult>((resolve) => {
			let settled = false;
			const finish = (result: SideCompletionResult) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(result);
			};
			const timer = setTimeout(
				() => finish({ ok: false, reason: "timeout", message: "Side session timed out." }),
				timeoutMs,
			);
			unsubscribe = session?.subscribe((event) => {
				if (event.type !== "agent_end" || event.willRetry) return;
				const text = extractAssistantText(event.messages as unknown[]);
				finish(
					text
						? { ok: true, text }
						: { ok: false, reason: "empty", message: "Side session returned no assistant text." },
				);
			});
			void session
				?.prompt(request.prompt, { expandPromptTemplates: false, source: "extension" })
				.catch((error: unknown) => {
					finish({
						ok: false,
						reason: "error",
						message: error instanceof Error ? error.message : "Side session failed to start.",
					});
				});
		});
	} catch (error) {
		return {
			ok: false,
			reason: "error",
			message: error instanceof Error ? error.message : "Side session failed.",
		};
	} finally {
		try {
			unsubscribe?.();
			session?.dispose();
		} catch {
			/* best effort cleanup */
		}
	}
}
