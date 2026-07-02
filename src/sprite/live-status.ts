import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { completeWithApiKeyText } from "../agent/side-completion.ts";
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

async function directLiveStatusCompletion(ctx: ExtensionContext, prompt: string): Promise<string | undefined> {
	const result = await completeWithApiKeyText(ctx, prompt, {
		maxTokens: LIVE_STATUS_MAX_TOKENS,
		timeoutMs: LIVE_STATUS_TIMEOUT_MS,
	});
	return result.ok ? result.text : undefined;
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
