import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export type BtwCompletionAdapters = {
	sideSession: (ctx: ExtensionCommandContext, prompt: string, maxTokens: number) => Promise<string | undefined>;
	direct: (ctx: ExtensionCommandContext, prompt: string, maxTokens: number) => Promise<string | undefined>;
};

export async function completeBtwText(
	ctx: ExtensionCommandContext,
	prompt: string,
	maxTokens: number,
	adapters: BtwCompletionAdapters,
): Promise<string | undefined> {
	return (await adapters.sideSession(ctx, prompt, maxTokens)) || (await adapters.direct(ctx, prompt, maxTokens));
}
