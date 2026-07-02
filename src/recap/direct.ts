import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { completeWithApiKeyText } from "../agent/side-completion.ts";
import { SYSTEM_PROMPT } from "./format.ts";
import type { RecapGenerationResult } from "./generation.ts";
import { recapPrompt } from "./generation.ts";

export async function completeRecapWithApiKey(
	ctx: ExtensionCommandContext,
	text: string,
): Promise<RecapGenerationResult> {
	const result = await completeWithApiKeyText(ctx, recapPrompt(text), { maxTokens: 500, systemPrompt: SYSTEM_PROMPT });
	return result.ok
		? { ok: true, recap: result.text, source: "api-key-fallback" }
		: { ok: false, message: result.message };
}
