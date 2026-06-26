import { complete, type Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SpriteState } from "../sprite/manifest.ts";
import { createScrollableSpeechBubble, type OverlaySection, type SpriteBubblePlacement } from "../ui/overlay.ts";

const SYSTEM_PROMPT = `Create a compact coding-session recap. Output exactly these labels with concise values: Goal, State, Decisions, Files/commands, Next. Do not use markdown tables.`;

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
function recapSections(recap: string): OverlaySection[] {
	const sections: OverlaySection[] = [];
	let current: OverlaySection | undefined;
	for (const rawLine of recap.split("\n")) {
		const line = rawLine.trim();
		const match = /^(Goal|State|Decisions|Files\/commands|Next):\s*(.*)$/iu.exec(line);
		if (match) {
			current = {
				title: match[1],
				body: match[2] || "—",
				accent: match[1].toLowerCase() === "next" ? "success" : "accent",
			};
			sections.push(current);
		} else if (line && current) {
			current.body += `\n${line}`;
		} else if (line) {
			sections.push({ body: line });
		}
	}
	return sections.length ? sections : [{ body: recap }];
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
export function registerRecapCommand(pi: ExtensionAPI, hooks: RecapHooks = {}) {
	pi.registerCommand("recap", {
		description: "Generate a compact session recap",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.model) return ctx.ui.notify("No active model selected for /recap.", "warning");
			const text = conversation(ctx);
			if (!text) return ctx.ui.notify("No conversation to recap yet.", "info");
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
			if (!auth.ok || !auth.apiKey)
				return ctx.ui.notify(auth.ok ? "No API key available for current model." : auth.error, "error");
			hooks.setState?.("thinking");
			hooks.setRecapStatus?.("running");
			try {
				const messages: Message[] = [
					{ role: "user", content: [{ type: "text", text: `Current session:\n\n${text}` }], timestamp: Date.now() },
				];
				const response = await complete(
					ctx.model,
					{ systemPrompt: SYSTEM_PROMPT, messages },
					{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 500 },
				);
				const recap = response.content
					.filter((p): p is { type: "text"; text: string } => p.type === "text")
					.map((p) => p.text)
					.join("\n")
					.trim();
				if (!recap) {
					hooks.setState?.("error", { resetMs: 2500 });
					hooks.setRecapStatus?.("error");
					return ctx.ui.notify("Recap generation returned no text.", "warning");
				}
				pi.appendEntry("pi-sprite:recap", { recap, timestamp: Date.now() });
				hooks.setState?.("success", { resetMs: 1800 });
				hooks.setRecapStatus?.("ready");
				await showRecap(ctx, recap, hooks.getBubblePlacement?.(), hooks.getSpriteName?.());
			} catch (error) {
				hooks.setState?.("error", { resetMs: 2500 });
				hooks.setRecapStatus?.("error");
				throw error;
			}
		},
	});
}
