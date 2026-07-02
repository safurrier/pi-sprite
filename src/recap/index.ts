import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { RECAP_ENTRY } from "../agent/session-entries.ts";
import { completeWithApiKeyText } from "../agent/side-completion.ts";
import { completeWithSideSession } from "../agent/side-session.ts";
import type { SpriteState } from "../sprite/manifest.ts";
import { createScrollableSpeechBubble, type SpriteBubblePlacement } from "../ui/overlay.ts";
import { recapSections, SYSTEM_PROMPT } from "./format.ts";
import { generateRecapText, type RecapGenerationResult, recapPrompt } from "./generation.ts";

type ActivityStatus = "idle" | "running" | "ready" | "error";

interface RecapHooks {
	setState?: (state: SpriteState, options?: { resetMs?: number }) => void;
	setRecapStatus?: (status: ActivityStatus) => void;
	getBubblePlacement?: () => SpriteBubblePlacement;
	getSpriteName?: () => string;
}

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((p) => (p?.type === "text" ? p.text : ""))
		.filter(Boolean)
		.join("\n");
}
function conversation(ctx: ExtensionCommandContext): string {
	const lines: string[] = [];
	for (const entry of ctx.sessionManager.getBranch() as Iterable<any>) {
		if (entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = extractText(entry.message.content).trim();
		if (text) lines.push(`${role}: ${text.slice(0, 1200)}`);
	}
	return lines.slice(-16).join("\n\n");
}
async function showRecap(
	ctx: ExtensionCommandContext,
	recap: string,
	placement: SpriteBubblePlacement = { anchor: "center", tail: "none", margin: {} },
	speakerName = "Sprite",
): Promise<void> {
	await ctx.ui.custom(
		(_tui, theme, _kb, done) =>
			createScrollableSpeechBubble(
				`${speakerName} recap`,
				recapSections(recap),
				"↵ close · esc close · ↑/↓ scroll",
				theme,
				done,
				{
					tail: placement.tail,
					maxBodyLines: 18,
					minWidth: 56,
					maxWidth: 94,
				},
			),
		{
			overlay: true,
			overlayOptions: {
				width: "62%",
				minWidth: 56,
				maxHeight: "72%",
				anchor: placement.anchor,
				margin: placement.margin,
			},
		},
	);
}

async function completeRecapWithApiKey(ctx: ExtensionCommandContext, text: string): Promise<RecapGenerationResult> {
	const result = await completeWithApiKeyText(ctx, recapPrompt(text), { maxTokens: 500, systemPrompt: SYSTEM_PROMPT });
	return result.ok
		? { ok: true, recap: result.text, source: "api-key-fallback" }
		: { ok: false, message: result.message };
}

export function registerRecapCommand(pi: ExtensionAPI, hooks: RecapHooks = {}) {
	pi.registerCommand("recap", {
		description: "Generate a compact session recap",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.model) return ctx.ui.notify("No active model selected for /recap.", "warning");
			const text = conversation(ctx);
			if (!text) return ctx.ui.notify("No conversation to recap yet.", "info");
			hooks.setState?.("thinking");
			hooks.setRecapStatus?.("running");
			try {
				const result = await generateRecapText(ctx, text, {
					sideSession: completeWithSideSession,
					direct: completeRecapWithApiKey,
				});
				if (!result.ok) {
					hooks.setState?.("error", { resetMs: 2500 });
					hooks.setRecapStatus?.("error");
					return ctx.ui.notify(result.message, "error");
				}
				pi.appendEntry(RECAP_ENTRY, { recap: result.recap, source: result.source, timestamp: Date.now() });
				hooks.setState?.("success", { resetMs: 1800 });
				hooks.setRecapStatus?.("ready");
				await showRecap(ctx, result.recap, hooks.getBubblePlacement?.(), hooks.getSpriteName?.());
			} catch (error) {
				hooks.setState?.("error", { resetMs: 2500 });
				hooks.setRecapStatus?.("error");
				throw error;
			}
		},
	});
}
