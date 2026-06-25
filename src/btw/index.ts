import { complete, type Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import type { SpriteState } from "../sprite/manifest.ts";
import { type OverlaySection, renderOverlay } from "../ui/overlay.ts";
import { answerWithSideSession } from "./session.ts";

const ENTRY = "pi-sprite:btw-entry";
const RESET = "pi-sprite:btw-reset";
type ActivityStatus = "idle" | "running" | "ready" | "error";

interface BtwEntry {
	question: string;
	answer: string;
	timestamp: number;
}

interface BtwHooks {
	setState?: (state: SpriteState, options?: { resetMs?: number }) => void;
	setBtwStatus?: (status: ActivityStatus, count?: number) => void;
}

let thread: BtwEntry[] = [];

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
function formatThread(entries = thread): string {
	return entries.map((e, i) => `## BTW ${i + 1}\nUser: ${e.question}\nAssistant: ${e.answer}`).join("\n\n");
}
async function showBtw(ctx: ExtensionCommandContext, sections: OverlaySection[]): Promise<void> {
	await ctx.ui.custom(
		(_tui, theme, _kb, done) => ({
			render: (width: number) =>
				renderOverlay("BTW side thread", sections, "↵ close · esc close · /btw:inject · /btw:summarize", width, theme),
			invalidate: () => {},
			handleInput: (data: string) => {
				if (matchesKey(data, "enter") || matchesKey(data, "escape")) done(undefined);
			},
		}),
		{
			overlay: true,
			overlayOptions: { width: "72%", minWidth: 64, maxHeight: "74%", anchor: "top-center", margin: { top: 1 } },
		},
	);
}
async function askSideQuestion(
	pi: ExtensionAPI,
	question: string,
	ctx: ExtensionCommandContext,
	hooks: BtwHooks = {},
): Promise<void> {
	if (!ctx.model) return ctx.ui.notify("No active model selected for /btw.", "warning");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey)
		return ctx.ui.notify(auth.ok ? "No API key available for current model." : auth.error, "error");
	const prompt = [
		"You are answering a side question for a Pi coding session. This answer is outside the main thread unless the user later injects it.",
		"Be concise and practical.",
		"",
		"Main-session context:",
		visibleContext(ctx) || "(No main context available.)",
		"",
		thread.length ? `Existing BTW thread:\n${formatThread()}` : "Existing BTW thread: (empty)",
		"",
		`Side question: ${question}`,
	].join("\n");
	hooks.setState?.("thinking");
	hooks.setBtwStatus?.("running", thread.length);
	try {
		let answer = await answerWithSideSession(ctx, prompt);
		if (!answer) {
			const messages: Message[] = [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }];
			const response = await complete(
				ctx.model,
				{ messages },
				{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 1200 },
			);
			answer = response.content
				.filter((p): p is { type: "text"; text: string } => p.type === "text")
				.map((p) => p.text)
				.join("\n")
				.trim();
		}
		if (!answer) {
			hooks.setState?.("error", { resetMs: 2500 });
			hooks.setBtwStatus?.("error", thread.length);
			return ctx.ui.notify("BTW response returned no text.", "warning");
		}
		const entry = { question, answer, timestamp: Date.now() };
		thread.push(entry);
		pi.appendEntry(ENTRY, entry);
		hooks.setState?.("success", { resetMs: 1800 });
		hooks.setBtwStatus?.("ready", thread.length);
		await showBtw(ctx, [
			{ title: "Question", body: question, accent: "muted" },
			{ title: "Answer", body: answer, accent: "accent" },
		]);
	} catch (error) {
		hooks.setState?.("error", { resetMs: 2500 });
		hooks.setBtwStatus?.("error", thread.length);
		throw error;
	}
}
async function summarizeThread(ctx: ExtensionCommandContext): Promise<string> {
	if (!ctx.model) throw new Error("No active model selected.");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) throw new Error(auth.ok ? "No API key available for current model." : auth.error);
	const messages: Message[] = [
		{
			role: "user",
			content: [
				{
					type: "text",
					text: `Summarize this side thread for injection into a coding-agent main session. Preserve decisions, risks, and next actions.\n\n${formatThread()}`,
				},
			],
			timestamp: Date.now(),
		},
	];
	const response = await complete(
		ctx.model,
		{ messages },
		{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 700 },
	);
	return response.content
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n")
		.trim();
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
		description: "Ask a side question outside the main thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const question = args.trim();
			if (!question) {
				return showBtw(
					ctx,
					thread.length
						? [{ title: `${thread.length} saved side question${thread.length === 1 ? "" : "s"}`, body: formatThread() }]
						: [{ title: "Empty", body: "BTW thread is empty. Use /btw <question>." }],
				);
			}
			await askSideQuestion(pi, question, ctx, hooks);
		},
	});
	pi.registerCommand("btw:new", {
		description: "Start a fresh BTW thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			thread = [];
			pi.appendEntry(RESET, { timestamp: Date.now() });
			hooks.setBtwStatus?.("idle", 0);
			if (args.trim()) await askSideQuestion(pi, args.trim(), ctx, hooks);
			else ctx.ui.notify("Started a fresh BTW thread.", "info");
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
				`${args.trim() ? `${args.trim()}\n\n` : ""}Here is a side-thread transcript for context:\n\n${formatThread()}`,
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
