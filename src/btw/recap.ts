import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { BTW_ENTRY, RECAP_ENTRY } from "../agent/session-entries.ts";
import { sessionConversationText } from "../recap/conversation.ts";
import type { RecapGenerationResult } from "../recap/generation.ts";
import type { SpriteState } from "../sprite/manifest.ts";

export type BtwActivityStatus = "idle" | "running" | "ready" | "error";

export interface BtwRecapHooks {
	setState?: (state: SpriteState, options?: { resetMs?: number }) => void;
	setBtwStatus?: (status: BtwActivityStatus, count?: number) => void;
	setRecapStatus?: (status: BtwActivityStatus) => void;
}

export type BtwRecapAdapters = {
	generate: (ctx: ExtensionCommandContext, text: string) => Promise<RecapGenerationResult>;
};

export async function recapIntoBtw(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	thread: Array<{ question: string; answer: string; timestamp: number }>,
	hooks: BtwRecapHooks,
	adapters: BtwRecapAdapters,
	options: { afterSuccess?: () => Promise<void> } = {},
): Promise<void> {
	if (!ctx.model) return ctx.ui.notify("No active model selected for /btw recap.", "warning");
	const text = sessionConversationText(ctx);
	if (!text) return ctx.ui.notify("No conversation to recap yet.", "info");
	hooks.setState?.("thinking");
	hooks.setBtwStatus?.("running", thread.length);
	hooks.setRecapStatus?.("running");
	try {
		const result = await adapters.generate(ctx, text);
		if (!result.ok) {
			hooks.setState?.("error", { resetMs: 2500 });
			hooks.setBtwStatus?.("error", thread.length);
			hooks.setRecapStatus?.("error");
			return ctx.ui.notify(result.message, "error");
		}
		const timestamp = Date.now();
		pi.appendEntry(RECAP_ENTRY, { recap: result.recap, source: result.source, timestamp });
		const entry = { question: "Recap the current main session.", answer: result.recap, timestamp };
		thread.push(entry);
		pi.appendEntry(BTW_ENTRY, entry);
		hooks.setState?.("success", { resetMs: 1800 });
		hooks.setBtwStatus?.("ready", thread.length);
		hooks.setRecapStatus?.("ready");
		await options.afterSuccess?.();
	} catch (error) {
		hooks.setState?.("error", { resetMs: 2500 });
		hooks.setBtwStatus?.("error", thread.length);
		hooks.setRecapStatus?.("error");
		throw error;
	}
}
