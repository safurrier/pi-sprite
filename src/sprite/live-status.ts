import { complete, type Message } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type LiveTurnStatus, parseLiveStatusResponse, promptForLiveStatus } from "./live-status-format.ts";
import { recentConversationForTurnStatus } from "./turn-status-format.ts";

const LIVE_STATUS_MAX_TOKENS = 120;
const LIVE_STATUS_TIMEOUT_MS = 20_000;

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

export async function classifyLiveTurnStatus(ctx: ExtensionContext): Promise<LiveTurnStatus | undefined> {
	if (!ctx.model) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) return undefined;
	const recentConversation = recentConversationForTurnStatus(ctx.sessionManager.getBranch() as Iterable<unknown>);
	const prompt = promptForLiveStatus(recentConversation);
	const request = async () => {
		const model = {
			...ctx.model!,
			maxTokens: Math.min(ctx.model!.maxTokens ?? LIVE_STATUS_MAX_TOKENS, LIVE_STATUS_MAX_TOKENS),
		};
		const response = await complete(
			model,
			{ messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }] as Message[] },
			{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: LIVE_STATUS_MAX_TOKENS },
		);
		const text = response.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text")
			.map((part) => part.text)
			.join("\n")
			.trim();
		return parseLiveStatusResponse(text);
	};
	return await withTimeout(request(), LIVE_STATUS_TIMEOUT_MS);
}
