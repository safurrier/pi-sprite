import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { completeWithSideSession } from "../agent/side-session.ts";

const BTW_SIDE_MAX_TOKENS = 1200;

const SIDE_SYSTEM_PROMPT = [
	"You are answering an explicit side question for a Pi coding session.",
	"This is a separate BTW thread, not the main working turn.",
	"Answer concisely and do not mutate files or assume you should continue the main task.",
].join("\n");

export async function answerWithSideSession(ctx: ExtensionCommandContext, prompt: string): Promise<string | undefined> {
	const result = await completeWithSideSession(ctx, {
		prompt,
		systemPrompt: SIDE_SYSTEM_PROMPT,
		maxTokens: BTW_SIDE_MAX_TOKENS,
		timeoutMs: 120_000,
	});
	return result.ok ? result.text : undefined;
}
