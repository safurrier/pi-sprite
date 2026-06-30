import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SideCompletionRequest, SideCompletionResult } from "../agent/side-session-types.ts";
import { type LiveTurnStatus, parseLiveStatusResponse, promptForLiveStatus } from "./live-status-format.ts";
import { recentConversationForTurnStatus } from "./turn-status-format.ts";

const LIVE_STATUS_MAX_TOKENS = 120;
const LIVE_STATUS_TIMEOUT_MS = 20_000;

type SideSessionAdapter = (ctx: ExtensionContext, request: SideCompletionRequest) => Promise<SideCompletionResult>;
type DirectCompletionAdapter = (ctx: ExtensionContext, prompt: string) => Promise<string | undefined>;

type LiveStatusAdapters = {
	sideSession: SideSessionAdapter;
	direct: DirectCompletionAdapter;
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
	return await new Promise<T | undefined>((resolve) => {
		const timer = setTimeout(() => resolve(undefined), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			() => {
				clearTimeout(timer);
				resolve(undefined);
			},
		);
	});
}

async function directLiveStatusCompletion(ctx: ExtensionContext, prompt: string): Promise<string | undefined> {
	if (!ctx.model) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) return undefined;
	const request = async () => {
		const { complete } = await import("@earendil-works/pi-ai");
		const model = {
			...ctx.model!,
			maxTokens: Math.min(ctx.model!.maxTokens ?? LIVE_STATUS_MAX_TOKENS, LIVE_STATUS_MAX_TOKENS),
		};
		const response = await complete(
			model,
			{ messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }] as Message[] },
			{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: LIVE_STATUS_MAX_TOKENS },
		);
		return response.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text")
			.map((part) => part.text)
			.join("\n")
			.trim();
	};
	return await withTimeout(request(), LIVE_STATUS_TIMEOUT_MS);
}

const defaultAdapters: LiveStatusAdapters = {
	sideSession: async (ctx, request) => {
		const { completeWithSideSession } = await import("../agent/side-session.ts");
		return await completeWithSideSession(ctx, request);
	},
	direct: directLiveStatusCompletion,
};

export async function classifyLiveTurnStatus(
	ctx: ExtensionContext,
	adapters: LiveStatusAdapters = defaultAdapters,
): Promise<LiveTurnStatus | undefined> {
	const recentConversation = recentConversationForTurnStatus(ctx.sessionManager.getBranch() as Iterable<unknown>);
	const prompt = promptForLiveStatus(recentConversation);
	const sideResult = await adapters.sideSession(ctx, {
		prompt,
		maxTokens: LIVE_STATUS_MAX_TOKENS,
		timeoutMs: LIVE_STATUS_TIMEOUT_MS,
	});
	if (sideResult.ok) return parseLiveStatusResponse(sideResult.text);
	const directText = await adapters.direct(ctx, prompt);
	return directText ? parseLiveStatusResponse(directText) : undefined;
}
