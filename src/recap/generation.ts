import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { completeTextWithSideSessionFallback } from "../agent/side-completion.ts";
import type { SideCompletionRequest, SideCompletionResult } from "../agent/side-session-types.ts";
import { SYSTEM_PROMPT } from "./format.ts";

export type RecapGenerationResult =
	| { ok: true; recap: string; source: "side-session" | "api-key-fallback" }
	| { ok: false; message: string };

type SideSessionAdapter = (
	ctx: ExtensionCommandContext,
	request: SideCompletionRequest,
) => Promise<SideCompletionResult>;

type DirectCompletionAdapter = (ctx: ExtensionCommandContext, text: string) => Promise<RecapGenerationResult>;

type RecapCompletionAdapters = {
	sideSession: SideSessionAdapter;
	direct: DirectCompletionAdapter;
};

type SideCompletionFailure = Extract<SideCompletionResult, { ok: false }>;

export function recapPrompt(text: string): string {
	return `Current session:\n\n${text}`;
}

function sideFailureMessage(sideResult: SideCompletionFailure): string {
	return `${sideResult.reason}: ${sideResult.message}`;
}

function recapFailureMessage(sideResult: SideCompletionFailure, directResult: RecapGenerationResult): string {
	const directMessage = directResult.ok ? "unexpected direct fallback success" : directResult.message;
	return [
		"Recap could not run through the ephemeral Pi side session.",
		`Side session: ${sideFailureMessage(sideResult)}`,
		`Direct API-key fallback: ${directMessage}`,
		"Normal chat may still work because it uses Pi's full agent harness.",
	].join("\n");
}

export async function generateRecapText(
	ctx: ExtensionCommandContext,
	text: string,
	adapters: RecapCompletionAdapters,
): Promise<RecapGenerationResult> {
	const request = { prompt: recapPrompt(text), systemPrompt: SYSTEM_PROMPT, maxTokens: 500, timeoutMs: 120_000 };
	const result = await completeTextWithSideSessionFallback(ctx, request, {
		sideSession: async (sideCtx, sideRequest) =>
			await adapters.sideSession(sideCtx as ExtensionCommandContext, sideRequest),
		direct: async (directCtx, _prompt, _maxTokens) => {
			const directResult = await adapters.direct(directCtx as ExtensionCommandContext, text);
			return directResult.ok ? directResult.recap : directResult;
		},
	});
	if (result.ok) return { ok: true, recap: result.text, source: result.source };
	return { ok: false, message: recapFailureMessage(result.sideResult, { ok: false, message: result.directMessage }) };
}
