import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { completeWithSideSession } from "../agent/side-session.ts";
import { completeRecapWithApiKey } from "../recap/direct.ts";
import { generateRecapText } from "../recap/generation.ts";
import type { SpriteState } from "../sprite/manifest.ts";
import {
	createReplyableSpeechBubble,
	createScrollableSpeechBubble,
	type OverlaySection,
	type SpriteBubblePlacement,
} from "../ui/overlay.ts";

import { type BtwEntry, formatThread, formatThreadSections } from "./format.ts";
import { formatBtwAnswerPrompt } from "./prompt.ts";
import { recapIntoBtw as addRecapToBtw, type BtwRecapAdapters } from "./recap.ts";
import { BtwAgentSession, type BtwStreamUpdate } from "./session.ts";
import { appendBtwEntry, appendBtwReset, restoreBtwThreadFromBranch } from "./thread-store.ts";

type ActivityStatus = "idle" | "running" | "ready" | "error";

interface BtwHooks {
	setState?: (state: SpriteState, options?: { resetMs?: number }) => void;
	setBtwStatus?: (status: ActivityStatus, count?: number) => void;
	setRecapStatus?: (status: ActivityStatus) => void;
	getBubblePlacement?: () => SpriteBubblePlacement;
	getSpriteName?: () => string;
	getSpritePersonality?: () => string | undefined;
}

let thread: BtwEntry[] = [];
let btwSession = new BtwAgentSession();

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
async function showInteractiveBtw(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	hooks: BtwHooks = {},
	initialQuestion?: string,
): Promise<boolean> {
	const speakerName = hooks.getSpriteName?.() ?? "Sprite";
	const placement = hooks.getBubblePlacement?.() ?? { anchor: "center", tail: "none", margin: {} };
	let constructed = false;
	await ctx.ui.custom(
		(tui, theme, _kb, done) => {
			constructed = true;
			return createReplyableSpeechBubble(
				`${speakerName} side thread`,
				formatThreadSections(thread, speakerName),
				theme,
				done,
				{
					initialSubmittedText: initialQuestion,
					tail: placement.tail,
					maxBodyLines: 12,
					minWidth: 56,
					maxWidth: 104,
					requestRender: () => tui.requestRender(),
					onDismiss: async () => {
						const activeBtwSession = btwSession;
						if (activeBtwSession.isRunning) await activeBtwSession.cancel();
					},
					onSubmit: async (text, update) => {
						const activity: OverlaySection[] = [];
						await askSideQuestion(pi, text, ctx, hooks, {
							showBubble: false,
							onUpdate: (stream) => {
								const title = stream.kind === "tool" ? "Tool activity" : speakerName;
								const previous = activity.at(-1);
								if (previous?.title === title) previous.body = stream.text;
								else activity.push({ title, body: stream.text, accent: "muted" });
								update([...formatThreadSections(thread, speakerName), ...activity]);
							},
						});
						return formatThreadSections(thread, speakerName);
					},
				},
			);
		},
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
	return constructed;
}

async function askSideQuestion(
	pi: ExtensionAPI,
	question: string,
	ctx: ExtensionCommandContext,
	hooks: BtwHooks = {},
	options: {
		persist?: boolean;
		showBubble?: boolean;
		onUpdate?: (update: BtwStreamUpdate) => void;
	} = {},
): Promise<void> {
	const persist = options.persist ?? true;
	const showBubble = options.showBubble ?? true;
	if (!ctx.model) {
		const message = "No active model selected for /btw.";
		if (!showBubble) throw new Error(message);
		return ctx.ui.notify(message, "warning");
	}
	const prompt = formatBtwAnswerPrompt({
		question,
		persist,
		spriteName: hooks.getSpriteName?.(),
		personality: hooks.getSpritePersonality?.(),
	});
	hooks.setState?.("thinking");
	hooks.setBtwStatus?.("running", thread.length);
	try {
		const activeBtwSession = btwSession;
		const answer = await activeBtwSession.ask(ctx, prompt, {
			seedFromMainBranch: persist,
			thinkingLevel: pi.getThinkingLevel(),
			onUpdate: options.onUpdate,
		});
		if (activeBtwSession !== btwSession) throw new Error("BTW request was cancelled by a session change.");
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
			appendBtwEntry(pi, entry);
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
		if (!showBubble) throw error;
		const message = error instanceof Error ? error.message : "BTW session failed.";
		ctx.ui.notify(`BTW failed: ${message}`, "warning");
	}
}
async function summarizeThread(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<string> {
	if (!ctx.model) throw new Error("No active model selected.");
	const prompt = `Summarize this side thread for injection into a coding-agent main session. Preserve decisions, risks, and next actions.\n\n${formatThread(thread)}`;
	const activeBtwSession = btwSession;
	const summary = await activeBtwSession.ask(ctx, prompt, {
		seedFromMainBranch: true,
		thinkingLevel: pi.getThinkingLevel(),
	});
	if (activeBtwSession !== btwSession) throw new Error("BTW summary was cancelled by a session change.");
	return summary;
}
function sendToMain(pi: ExtensionAPI, ctx: ExtensionCommandContext, content: string): void {
	if (ctx.isIdle()) pi.sendUserMessage(content);
	else pi.sendUserMessage(content, { deliverAs: "followUp" });
}

const defaultBtwRecapAdapters: BtwRecapAdapters = {
	generate: async (ctx, text) =>
		generateRecapText(ctx, text, {
			sideSession: completeWithSideSession,
			direct: completeRecapWithApiKey,
		}),
};

async function replaceBtwSession(entries: BtwEntry[] = thread): Promise<void> {
	const previous = btwSession;
	btwSession = new BtwAgentSession(undefined, entries);
	await previous.dispose();
}

async function clearBtwSession(pi: ExtensionAPI): Promise<void> {
	thread = [];
	appendBtwReset(pi);
	await replaceBtwSession();
}

async function recapIntoBtw(pi: ExtensionAPI, ctx: ExtensionCommandContext, hooks: BtwHooks = {}): Promise<void> {
	await addRecapToBtw(pi, ctx, thread, hooks, defaultBtwRecapAdapters, {
		afterSuccess: async () => {
			// The recap was generated outside this AgentSession; reseed it so the next
			// BTW follow-up can see the newly visible exchange.
			await replaceBtwSession(thread);
			await showInteractiveBtw(pi, ctx, hooks);
		},
	});
}

export function registerBtwCommands(pi: ExtensionAPI, hooks: BtwHooks = {}) {
	const restoreAndReport = async (ctx: ExtensionContext) => {
		// Side-session history is intentionally branch-local and in-memory. Its
		// visible transcript is restored from hidden entries below.
		thread = restoreBtwThreadFromBranch(ctx.sessionManager.getBranch() as Iterable<unknown>);
		await replaceBtwSession(thread);
		hooks.setBtwStatus?.(thread.length ? "ready" : "idle", thread.length);
	};
	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => await restoreAndReport(ctx));
	pi.on("session_tree", async (_event: unknown, ctx: ExtensionContext) => await restoreAndReport(ctx));
	pi.on("session_shutdown", async () => await btwSession.dispose());
	pi.registerCommand("btw", {
		description: "Continue the BTW side conversation outside the main thread; use /btw recap for a recap thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const question = args.trim();
			if (!question) {
				await showInteractiveBtw(pi, ctx, hooks);
				return;
			}
			if (question === "recap") return recapIntoBtw(pi, ctx, hooks);
			if (!(await showInteractiveBtw(pi, ctx, hooks, question))) await askSideQuestion(pi, question, ctx, hooks);
		},
	});
	pi.registerCommand("btw:ask", {
		description: "Ask a one-off BTW question without adding to the side thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const question = args.trim();
			if (!question) return ctx.ui.notify("Usage: /btw:ask <question>", "warning");
			await askSideQuestion(pi, question, ctx, hooks, { persist: false });
		},
	});
	pi.registerCommand("btw:new", {
		description: "Start a fresh BTW thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			await clearBtwSession(pi);
			hooks.setBtwStatus?.("idle", 0);
			const question = args.trim();
			if (question) {
				if (!(await showInteractiveBtw(pi, ctx, hooks, question))) await askSideQuestion(pi, question, ctx, hooks);
			} else await showInteractiveBtw(pi, ctx, hooks);
		},
	});
	pi.registerCommand("btw:recap", {
		description: "Generate the normal session recap inside the BTW side thread",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			await recapIntoBtw(pi, ctx, hooks);
		},
	});
	pi.registerCommand("btw:clear", {
		description: "Clear the BTW thread",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			await clearBtwSession(pi);
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
			await clearBtwSession(pi);
			hooks.setBtwStatus?.("idle", 0);
		},
	});
	pi.registerCommand("btw:summarize", {
		description: "Summarize and inject the BTW thread",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!thread.length) return ctx.ui.notify("No BTW thread to summarize.", "warning");
			hooks.setBtwStatus?.("running", thread.length);
			try {
				const summary = await summarizeThread(pi, ctx);
				sendToMain(
					pi,
					ctx,
					`${args.trim() ? `${args.trim()}\n\n` : ""}Here is a summary of a side conversation:\n\n${summary}`,
				);
				await clearBtwSession(pi);
				hooks.setBtwStatus?.("idle", 0);
			} catch (error) {
				hooks.setBtwStatus?.("error", thread.length);
				throw error;
			}
		},
	});
}
