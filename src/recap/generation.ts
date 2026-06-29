import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
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
	const sideResult = await adapters.sideSession(ctx, {
		prompt: recapPrompt(text),
		systemPrompt: SYSTEM_PROMPT,
		maxTokens: 500,
		timeoutMs: 120_000,
	});
	if (sideResult.ok) return { ok: true, recap: sideResult.text, source: "side-session" };
	const directResult = await adapters.direct(ctx, text);
	if (directResult.ok) return directResult;
	return { ok: false, message: recapFailureMessage(sideResult, directResult) };
}
