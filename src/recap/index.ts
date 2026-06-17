import { complete, type Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Container, matchesKey, Text } from "@earendil-works/pi-tui";

const SYSTEM_PROMPT = `Create a compact coding-session recap. Output exactly these labels with concise values: Goal, State, Decisions, Files/commands, Next. Do not use markdown tables.`;

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
async function showRecap(ctx: ExtensionCommandContext, recap: string): Promise<void> {
	await ctx.ui.custom(
		(_tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new Text(theme.fg("accent", theme.bold("Session Recap")), 1, 0));
			container.addChild(new Text(recap, 1, 1));
			container.addChild(new Text(theme.fg("dim", "Press Enter or Esc to close"), 1, 0));
			return {
				render: (w: number) => container.render(w),
				invalidate: () => container.invalidate(),
				handleInput: (d: string) => {
					if (matchesKey(d, "enter") || matchesKey(d, "escape")) done(undefined);
				},
			};
		},
		{ overlay: true, overlayOptions: { width: "70%", minWidth: 60, maxHeight: "80%" } },
	);
}
export function registerRecapCommand(pi: ExtensionAPI) {
	pi.registerCommand("recap", {
		description: "Generate a compact session recap",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.model) return ctx.ui.notify("No active model selected for /recap.", "warning");
			const text = conversation(ctx);
			if (!text) return ctx.ui.notify("No conversation to recap yet.", "info");
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
			if (!auth.ok || !auth.apiKey)
				return ctx.ui.notify(auth.ok ? "No API key available for current model." : auth.error, "error");
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
			if (!recap) return ctx.ui.notify("Recap generation returned no text.", "warning");
			pi.appendEntry("pi-sprite:recap", { recap, timestamp: Date.now() });
			await showRecap(ctx, recap);
		},
	});
}
