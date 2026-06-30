import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { completeWithSideSession } from "../agent/side-session.ts";

const BTW_SIDE_MAX_TOKENS = 1200;

const SIDE_QUESTION_SYSTEM_PROMPT = [
	"You are answering an explicit side question for a Pi coding session.",
	"This is a separate BTW thread, not the main working turn.",
	"Answer concisely and do not mutate files or assume you should continue the main task.",
].join("\n");

const SIDE_SUMMARY_SYSTEM_PROMPT = [
	"You are summarizing a BTW side thread for injection into a Pi coding-agent main session.",
	"Preserve decisions, risks, and next actions. Be concise and faithful.",
	"Do not mutate files or continue the main task.",
].join("\n");

export async function answerWithSideSession(
	ctx: ExtensionCommandContext,
	prompt: string,
	options: { maxTokens?: number; systemPrompt?: string } = {},
): Promise<string | undefined> {
	const result = await completeWithSideSession(ctx, {
		prompt,
		systemPrompt: options.systemPrompt ?? SIDE_QUESTION_SYSTEM_PROMPT,
		maxTokens: options.maxTokens ?? BTW_SIDE_MAX_TOKENS,
		timeoutMs: 120_000,
	});
	return result.ok ? result.text : undefined;
}

export async function summarizeWithSideSession(
	ctx: ExtensionCommandContext,
	prompt: string,
): Promise<string | undefined> {
	return await answerWithSideSession(ctx, prompt, { maxTokens: 700, systemPrompt: SIDE_SUMMARY_SYSTEM_PROMPT });
}
