import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SpriteState } from "../sprite/manifest.ts";
import {
	createReplyableSpeechBubble,
	createScrollableSpeechBubble,
	type OverlaySection,
	type SpriteBubblePlacement,
} from "../ui/overlay.ts";
import { type BtwCompletionAdapters, completeBtwText } from "./completion.ts";
import { type BtwEntry, formatThread, formatThreadSections } from "./format.ts";
import { formatBtwAnswerPrompt } from "./prompt.ts";
import { answerWithSideSession, summarizeWithSideSession } from "./session.ts";

const ENTRY = "pi-sprite:btw-entry";
const RESET = "pi-sprite:btw-reset";
type ActivityStatus = "idle" | "running" | "ready" | "error";

interface BtwHooks {
	setState?: (state: SpriteState, options?: { resetMs?: number }) => void;
	setBtwStatus?: (status: ActivityStatus, count?: number) => void;
	getBubblePlacement?: () => SpriteBubblePlacement;
	getSpriteName?: () => string;
	getSpritePersonality?: () => string | undefined;
}

let thread: BtwEntry[] = [];

async function directCompletion(
	ctx: ExtensionCommandContext,
	prompt: string,
	maxTokens: number,
): Promise<string | undefined> {
	if (!ctx.model) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) return undefined;
	const { complete } = await import("@earendil-works/pi-ai");
	const messages: Message[] = [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }];
	const response = await complete(ctx.model, { messages }, { apiKey: auth.apiKey, headers: auth.headers, maxTokens });
	return response.content
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n")
		.trim();
}

const defaultCompletionAdapters: BtwCompletionAdapters = {
	sideSession: async (ctx, prompt, maxTokens) => await answerWithSideSession(ctx, prompt, { maxTokens }),
	direct: directCompletion,
};

function isCustom(entry: unknown, type: string): entry is { type: "custom"; customType: string; data?: unknown } {
	return Boolean(
		entry &&
			typeof entry === "object" &&
			(entry as { type?: string }).type === "custom" &&
			(entry as { customType?: string }).customType === type,
	);
}
function restore(ctx: ExtensionContext): void {
	thread = [];
	let resetIndex = -1;
	const branch = Array.from(ctx.sessionManager.getBranch() as Iterable<unknown>);
	for (let i = 0; i < branch.length; i++) if (isCustom(branch[i], RESET)) resetIndex = i;
	for (const entry of branch.slice(resetIndex + 1)) {
		if (!isCustom(entry, ENTRY)) continue;
		const data = entry.data as Partial<BtwEntry> | undefined;
		if (data?.question && data.answer && data.timestamp) thread.push(data as BtwEntry);
	}
}
function visibleContext(ctx: ExtensionCommandContext): string {
	const lines: string[] = [];
	for (const entry of ctx.sessionManager.getBranch() as Iterable<any>) {
		if (isCustom(entry, ENTRY) || isCustom(entry, RESET)) continue;
		if (entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;
		const content = entry.message.content;
		const text =
			typeof content === "string"
				? content
				: Array.isArray(content)
					? content.map((p) => (p?.type === "text" ? p.text : "")).join("\n")
					: "";
		if (text.trim()) lines.push(`${role}: ${text.trim().slice(0, 1000)}`);
	}
	return lines.slice(-10).join("\n\n");
}

async function showBtw(
	ctx: ExtensionCommandContext,
	sections: OverlaySection[],
	placement: SpriteBubblePlacement = { anchor: "center", tail: "none", margin: {} },
	speakerName = "Sprite",
	title = `${speakerName} says`,
): Promise<void> {
	await ctx.ui.custom(
		(_tui, theme, _kb, done) =>
			createScrollableSpeechBubble(
				title,
				sections,
				"↵ close · esc close · ↑/↓ scroll · /btw:inject · /btw:summarize",
				theme,
				done,
				{ tail: placement.tail, maxBodyLines: 14, minWidth: 56, maxWidth: 104 },
			),
		{
			overlay: true,
			overlayOptions: {
				width: "64%",
				minWidth: 56,
				maxHeight: "88%",
				anchor: placement.anchor,
				margin: placement.margin,
			},
		},
	);
}
async function showInteractiveBtw(pi: ExtensionAPI, ctx: ExtensionCommandContext, hooks: BtwHooks = {}): Promise<void> {
	const speakerName = hooks.getSpriteName?.() ?? "Sprite";
	const placement = hooks.getBubblePlacement?.() ?? { anchor: "center", tail: "none", margin: {} };
	await ctx.ui.custom(
		(tui, theme, _kb, done) =>
			createReplyableSpeechBubble(
				`${speakerName} side thread`,
				formatThreadSections(thread, speakerName),
				theme,
				done,
				{
					tail: placement.tail,
					maxBodyLines: 12,
					minWidth: 56,
					maxWidth: 104,
					requestRender: () => tui.requestRender(),
					onSubmit: async (text) => {
						await askSideQuestion(pi, text, ctx, hooks, { showBubble: false });
						return formatThreadSections(thread, speakerName);
					},
				},
			),
		{
			overlay: true,
			overlayOptions: {
				width: "64%",
				minWidth: 56,
				maxHeight: "88%",
				anchor: placement.anchor,
				margin: placement.margin,
			},
		},
	);
}

async function askSideQuestion(
	pi: ExtensionAPI,
	question: string,
	ctx: ExtensionCommandContext,
	hooks: BtwHooks = {},
	options: { persist?: boolean; includeThread?: boolean; showBubble?: boolean } = {},
): Promise<void> {
	const persist = options.persist ?? true;
	const includeThread = options.includeThread ?? persist;
	const showBubble = options.showBubble ?? true;
	if (!ctx.model) {
		const message = "No active model selected for /btw.";
		if (!showBubble) throw new Error(message);
		return ctx.ui.notify(message, "warning");
	}
	const prompt = formatBtwAnswerPrompt({
		question,
		persist,
		mainContext: visibleContext(ctx),
		threadText: includeThread && thread.length ? formatThread(thread) : undefined,
		spriteName: hooks.getSpriteName?.(),
		personality: hooks.getSpritePersonality?.(),
	});
	hooks.setState?.("thinking");
	hooks.setBtwStatus?.("running", thread.length);
	try {
		const answer = await completeBtwText(ctx, prompt, 1200, defaultCompletionAdapters);
		if (!answer) {
			const message = "BTW response returned no text.";
			hooks.setState?.("error", { resetMs: 2500 });
			hooks.setBtwStatus?.("error", thread.length);
			if (!showBubble) throw new Error(message);
			return ctx.ui.notify(message, "warning");
		}
		const entry = { question, answer, timestamp: Date.now() };
		if (persist) {
			thread.push(entry);
			pi.appendEntry(ENTRY, entry);
		}
		hooks.setState?.("success", { resetMs: 1800 });
		hooks.setBtwStatus?.(thread.length ? "ready" : "idle", thread.length);
		if (showBubble) {
			const speakerName = hooks.getSpriteName?.() ?? "Sprite";
			if (persist) {
				await showInteractiveBtw(pi, ctx, hooks);
			} else {
				await showBtw(
					ctx,
					[
						{ title: "One-off question", body: question, accent: "muted" },
						{ title: speakerName, body: answer, accent: "accent" },
					],
					hooks.getBubblePlacement?.(),
					speakerName,
					`${speakerName} says`,
				);
			}
		}
	} catch (error) {
		hooks.setState?.("error", { resetMs: 2500 });
		hooks.setBtwStatus?.("error", thread.length);
		throw error;
	}
}
async function summarizeThread(ctx: ExtensionCommandContext): Promise<string> {
	if (!ctx.model) throw new Error("No active model selected.");
	const prompt = `Summarize this side thread for injection into a coding-agent main session. Preserve decisions, risks, and next actions.\n\n${formatThread(thread)}`;
	const summary = (await summarizeWithSideSession(ctx, prompt)) || (await directCompletion(ctx, prompt, 700));
	if (!summary) throw new Error("BTW summary returned no text.");
	return summary;
}
function sendToMain(pi: ExtensionAPI, ctx: ExtensionCommandContext, content: string): void {
	if (ctx.isIdle()) pi.sendUserMessage(content);
	else pi.sendUserMessage(content, { deliverAs: "followUp" });
}
export function registerBtwCommands(pi: ExtensionAPI, hooks: BtwHooks = {}) {
	const restoreAndReport = (ctx: ExtensionContext) => {
		restore(ctx);
		hooks.setBtwStatus?.(thread.length ? "ready" : "idle", thread.length);
	};
	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => restoreAndReport(ctx));
	pi.on("session_tree", async (_event: unknown, ctx: ExtensionContext) => restoreAndReport(ctx));
	pi.on("context", async (event: { messages: any[] }) => ({
		messages: event.messages.filter((m) => m.customType !== ENTRY && m.customType !== RESET),
	}));
	pi.registerCommand("btw", {
		description: "Continue the BTW side conversation outside the main thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const question = args.trim();
			if (!question) return showInteractiveBtw(pi, ctx, hooks);
			await askSideQuestion(pi, question, ctx, hooks);
		},
	});
	pi.registerCommand("btw:ask", {
		description: "Ask a one-off BTW question without adding to the side thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const question = args.trim();
			if (!question) return ctx.ui.notify("Usage: /btw:ask <question>", "warning");
			await askSideQuestion(pi, question, ctx, hooks, { persist: false, includeThread: false });
		},
	});
	pi.registerCommand("btw:new", {
		description: "Start a fresh BTW thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			thread = [];
			pi.appendEntry(RESET, { timestamp: Date.now() });
			hooks.setBtwStatus?.("idle", 0);
			if (args.trim()) await askSideQuestion(pi, args.trim(), ctx, hooks);
			else await showInteractiveBtw(pi, ctx, hooks);
		},
	});
	pi.registerCommand("btw:clear", {
		description: "Clear the BTW thread",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			thread = [];
			pi.appendEntry(RESET, { timestamp: Date.now() });
			hooks.setBtwStatus?.("idle", 0);
			ctx.ui.notify("Cleared BTW thread.", "info");
		},
	});
	pi.registerCommand("btw:inject", {
		description: "Inject the BTW thread into the main session",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!thread.length) return ctx.ui.notify("No BTW thread to inject.", "warning");
			sendToMain(
				pi,
				ctx,
				`${args.trim() ? `${args.trim()}\n\n` : ""}Here is a side-thread transcript for context:\n\n${formatThread(thread)}`,
			);
			thread = [];
			pi.appendEntry(RESET, { timestamp: Date.now() });
			hooks.setBtwStatus?.("idle", 0);
		},
	});
	pi.registerCommand("btw:summarize", {
		description: "Summarize and inject the BTW thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!thread.length) return ctx.ui.notify("No BTW thread to summarize.", "warning");
			hooks.setBtwStatus?.("running", thread.length);
			try {
				const summary = await summarizeThread(ctx);
				sendToMain(
					pi,
					ctx,
					`${args.trim() ? `${args.trim()}\n\n` : ""}Here is a summary of a side conversation:\n\n${summary}`,
				);
				thread = [];
				pi.appendEntry(RESET, { timestamp: Date.now() });
				hooks.setBtwStatus?.("idle", 0);
			} catch (error) {
				hooks.setBtwStatus?.("error", thread.length);
				throw error;
			}
		},
	});
}
