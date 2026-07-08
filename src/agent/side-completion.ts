import type { Message, TextContent } from "@earendil-works/pi-ai/compat";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SideCompletionRequest, SideCompletionResult } from "./side-session-types.ts";

type CompletionContext = ExtensionCommandContext | ExtensionContext;

type DirectCompletionResult = { ok: true; text: string } | { ok: false; message: string };

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
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

function cappedModel<T extends { maxTokens?: number }>(model: T, maxTokens: number): T {
	return {
		...model,
		maxTokens: Math.min(model.maxTokens ?? maxTokens, maxTokens),
	};
}

export async function completeWithApiKeyText(
	ctx: CompletionContext,
	prompt: string,
	options: { maxTokens: number; timeoutMs?: number; systemPrompt?: string },
): Promise<DirectCompletionResult> {
	if (!ctx.model) return { ok: false, message: "No active model selected." };
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) return { ok: false, message: auth.ok ? "No API key available." : auth.error };
	const request = async () => {
		const messages: Message[] = [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }];
		const { complete } = await import("@earendil-works/pi-ai/compat");
		const response = await complete(
			cappedModel(ctx.model!, options.maxTokens),
			{ systemPrompt: options.systemPrompt, messages },
			{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: options.maxTokens },
		);
		return response.content
			.filter((part): part is TextContent => part.type === "text")
			.map((part) => part.text)
			.join("\n")
			.trim();
	};
	const text = options.timeoutMs ? await withTimeout(request(), options.timeoutMs) : await request();
	if (!text)
		return {
			ok: false,
			message: options.timeoutMs
				? "Direct API-key fallback timed out or returned no text."
				: "Direct API-key fallback returned no text.",
		};
	return { ok: true, text };
}

export async function completeTextWithSideSessionFallback(
	ctx: CompletionContext,
	request: SideCompletionRequest,
	adapters: {
		sideSession: (ctx: CompletionContext, request: SideCompletionRequest) => Promise<SideCompletionResult>;
		direct: (
			ctx: CompletionContext,
			prompt: string,
			maxTokens: number,
		) => Promise<string | { ok: false; message: string } | undefined>;
	},
): Promise<
	| { ok: true; text: string; source: "side-session" | "api-key-fallback" }
	| { ok: false; sideResult: Extract<SideCompletionResult, { ok: false }>; directMessage: string; message: string }
> {
	const sideResult = await adapters.sideSession(ctx, request);
	if (sideResult.ok) return { ok: true, text: sideResult.text, source: "side-session" };
	const directResult = await adapters.direct(ctx, request.prompt, request.maxTokens ?? 1200);
	if (typeof directResult === "string" && directResult) {
		return { ok: true, text: directResult, source: "api-key-fallback" };
	}
	const directMessage =
		typeof directResult === "object" ? directResult.message : "Direct API-key fallback returned no text.";
	return {
		ok: false,
		sideResult,
		directMessage,
		message: "Side session and direct API-key fallback returned no text.",
	};
}
