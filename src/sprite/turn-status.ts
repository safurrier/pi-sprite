import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SideCompletionRequest, SideCompletionResult } from "../agent/side-session-types.ts";
import {
	extractTextContent,
	parseTurnStatusResponse,
	recentConversationForTurnStatus,
	type TurnStatus,
} from "./turn-status-format.ts";

const TURN_STATUS_MAX_TOKENS = 180;
const TURN_STATUS_TIMEOUT_MS = 20_000;

function finalAssistantText(messages: unknown[]): string {
	for (const message of [...messages].reverse()) {
		if (!message || typeof message !== "object") continue;
		const typed = message as { role?: string; content?: unknown };
		if (typed.role !== "assistant") continue;
		const text = extractTextContent(typed.content).trim();
		if (text) return text;
	}
	return "";
}

type SideSessionAdapter = (ctx: ExtensionContext, request: SideCompletionRequest) => Promise<SideCompletionResult>;
type DirectCompletionAdapter = (ctx: ExtensionContext, prompt: string) => Promise<string | undefined>;

type TurnStatusAdapters = {
	sideSession: SideSessionAdapter;
	direct: DirectCompletionAdapter;
};

function promptForTurnStatus(recentConversation: string, finalResponse: string): string {
	return [
		"Classify the final state of this Pi coding-agent turn for a compact sprite footer.",
		"Use the recent conversation to understand the user's actual goal; do not judge from only the last sentence.",
		"Return JSON only with this shape:",
		'{"state":"done|followup|blocked","label":"short footer label","detail":"optional one sentence","actions":["optional action"]}',
		"Guidelines:",
		'- state="done" when the requested work appears complete, including successful smoke checks, demos, or trigger actions.',
		'- state="followup" only when a specific non-routine verification/action remains before the work is actually complete.',
		'- Do not use state="followup" merely because the user may inspect, review, try, or check the completed work.',
		'- state="blocked" only when user input is required before progress can continue.',
		"- label should be concrete and footer-friendly, around 2-8 words.",
		"- detail is optional and should be one sentence.",
		"- actions is optional, max 3 short items.",
		"",
		"Recent conversation:",
		recentConversation || "(No recent conversation available.)",
		"",
		"Final assistant response:",
		finalResponse || "(No final assistant response available.)",
	].join("\n");
}

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

async function directTurnStatusCompletion(ctx: ExtensionContext, prompt: string): Promise<string | undefined> {
	if (!ctx.model) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) return undefined;
	const request = async () => {
		const { complete } = await import("@earendil-works/pi-ai");
		const model = {
			...ctx.model!,
			maxTokens: Math.min(ctx.model!.maxTokens ?? TURN_STATUS_MAX_TOKENS, TURN_STATUS_MAX_TOKENS),
		};
		const response = await complete(
			model,
			{ messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }] as Message[] },
			{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: TURN_STATUS_MAX_TOKENS },
		);
		return response.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text")
			.map((part) => part.text)
			.join("\n")
			.trim();
	};
	return await withTimeout(request(), TURN_STATUS_TIMEOUT_MS);
}

const defaultAdapters: TurnStatusAdapters = {
	sideSession: async (ctx, request) => {
		const { completeWithSideSession } = await import("../agent/side-session.ts");
		return await completeWithSideSession(ctx, request);
	},
	direct: directTurnStatusCompletion,
};

export async function classifyTurnStatus(
	ctx: ExtensionContext,
	messages: unknown[],
	adapters: TurnStatusAdapters = defaultAdapters,
): Promise<TurnStatus | undefined> {
	const recentConversation = recentConversationForTurnStatus(ctx.sessionManager.getBranch() as Iterable<unknown>);
	const finalResponse = finalAssistantText(messages);
	const prompt = promptForTurnStatus(recentConversation, finalResponse);
	const sideResult = await adapters.sideSession(ctx, {
		prompt,
		maxTokens: TURN_STATUS_MAX_TOKENS,
		timeoutMs: TURN_STATUS_TIMEOUT_MS,
	});
	if (sideResult.ok) return parseTurnStatusResponse(sideResult.text);
	const directText = await adapters.direct(ctx, prompt);
	return directText ? parseTurnStatusResponse(directText) : undefined;
}
