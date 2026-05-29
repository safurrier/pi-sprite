/**
 * pi-pokepet — a cute, colorful Pokémon companion for the pi coding agent.
 *
 * This file is the entry point: it wires pi's lifecycle events to the pet's
 * moods and renders the widget. The data lives in sibling modules so it's easy
 * to fork and customize:
 *
 *   colors.ts    256-color ANSI helpers
 *   mons.ts      the Pokémon roster + frame builder  (add your own here)
 *   content.ts   all the messages + intent detection (tweak words here)
 *   state.ts     runtime state + cross-session persistence
 *   index.ts     this file — event wiring, rendering, /pokemon command
 *
 * Pure ASCII + 256-color ANSI, so it renders in Terminal.app and Warp — no image
 * protocol needed.
 *
 * Disclaimer: Pokémon and Pokémon character names are trademarks of Nintendo,
 * Creatures Inc., and GAME FREAK Inc. This is an unofficial fan project, not
 * affiliated with or endorsed by them. The ASCII art is original.
 */

import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { bar, c, dim } from "./colors.ts";
import { type Mon, type Mood, MON, MOOD_COLOR, buildFrame } from "./mons.ts";
import {
	CELEBRATORY,
	FILE_REACT,
	INTENT_FAIL,
	INTENT_OK,
	INTENT_RUN,
	MESSAGES,
	TIME_LINES,
	detectIntent,
	fileCategory,
	timeBucket,
} from "./content.ts";
import { greeting, loadSaved, logEvent, readEvents, saveState, state, tierOf } from "./state.ts";

// ---------------------------------------------------------------------------
// Module-local UI state
// ---------------------------------------------------------------------------

let ctxRef: ExtensionContext | undefined;
let animTimer: ReturnType<typeof setInterval> | null = null;
let lastRendered = "";

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const mon = (): Mon => MON[state.monKey] ?? MON.pikachu!;
const displayName = (): string => state.nick || mon().name;

function idlePool(): string[] {
	const base = [...MESSAGES.idle, ...mon().quirks, ...TIME_LINES[timeBucket()]];
	if (state.energy < 20) base.push("*tummy rumbles* a berry? (/pokemon feed)", "running low... feed me?");
	return base;
}

const addEnergy = (n: number): void => {
	state.energy = Math.max(0, Math.min(100, state.energy + n));
};

function setMood(mood: Mood, opts: { message?: string } = {}): void {
	state.mood = mood;
	state.frameIdx = 0;
	state.message = opts.message ?? (mood === "idle" ? pick(idlePool()) : pick(MESSAGES[mood]));
	state.lastActivity = Date.now();
	render();
}

// ---------------------------------------------------------------------------
// Render + animation
// ---------------------------------------------------------------------------

function render(): void {
	if (!ctxRef || !ctxRef.hasUI) return;
	if (!state.visible) return ctxRef.ui.setWidget("pokepet", undefined);

	const m = mon();
	const frame = buildFrame(m, state.mood, state.frameIdx);
	const bodyColor = MOOD_COLOR[state.mood] ?? m.color;
	const lines = frame.map((line) => c(bodyColor, line));

	lines.push(`${c(m.color, displayName())} ${m.tag}  ${dim(state.message)}`);
	lines.push(dim(`${c(203, "♥")}${bar(state.energy)} ${Math.round(state.energy)}`));

	const signature = lines.join("\n");
	if (signature === lastRendered) return;
	lastRendered = signature;
	ctxRef.ui.setWidget("pokepet", lines, { placement: "belowEditor" });
}

function tick(): void {
	state.frameIdx++;
	addEnergy(-0.02);
	const since = Date.now() - state.lastActivity;
	if ((state.mood === "talking" || state.mood === "working") && since > 1500) return setMood("idle");
	if ((state.mood === "happy" || state.mood === "panic" || state.mood === "hatch") && since > 3000) return setMood("idle");
	if (state.mood === "idle" && since > 90_000) return setMood("sleep");
	if (state.mood === "idle" && state.frameIdx % 16 === 0) state.message = pick(idlePool());
	render();
}

function noteEdit(): boolean {
	const now = Date.now();
	state.editTimes = state.editTimes.filter((t) => now - t < 20_000);
	state.editTimes.push(now);
	return state.editTimes.length >= 4;
}

// Spinning Poké Ball inline working indicator
const BALL = ["◓", "◑", "◒", "◐"].map((f) => c(196, f));

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function pokepetExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctxRef = ctx;
		if (!ctx.hasUI) return;

		const saved = loadSaved();
		if (saved.monKey && MON[saved.monKey]) state.monKey = saved.monKey;
		if (typeof saved.nick === "string") state.nick = saved.nick;
		if (saved.firstMet) state.firstMet = saved.firstMet;
		if (typeof saved.energy === "number") {
			const mins = saved.lastSeen ? (Date.now() - Date.parse(saved.lastSeen)) / 60_000 : 0;
			state.energy = Math.max(0, Math.min(100, saved.energy - mins * 0.02));
		}
		state.sessions = (saved.sessions ?? 0) + 1;
		saveState();
		logEvent("session-start");

		const prev = tierOf(state.sessions - 1);
		const tier = tierOf(state.sessions);
		const tierUp = tier !== prev && state.sessions > 1;
		setMood("hatch", { message: tierUp ? `${tier.toUpperCase()} unlocked! ✦` : greeting(tier, state.sessions, mon()) });

		ctx.ui.setWorkingIndicator({ frames: BALL, intervalMs: 150 });
		if (!animTimer) animTimer = setInterval(tick, 450);
	});

	pi.on("message_update", async () => {
		if (state.mood !== "talking") setMood("talking");
		else state.lastActivity = Date.now();
	});

	pi.on("turn_start", async () => setMood("working"));

	pi.on("tool_call", async (event: unknown) => {
		const e = event as { toolName?: string; input?: Record<string, unknown> };
		const tool = e?.toolName ?? "";
		const input = e?.input ?? {};

		// PR / review tools (gh, Linear diff, etc.)
		if (/diff|review|pull_request|\bpr_|get_diff/i.test(tool)) {
			state.lastIntent = "review";
			return setMood("working", { message: INTENT_RUN.review });
		}

		// File editing tools -> file-aware reaction + flow detection.
		if (/^(write|edit|str_replace|create|apply_patch|multi_edit)/.test(tool)) {
			const path = String(input.path ?? input.file_path ?? input.filename ?? "");
			const inFlow = noteEdit();
			logEvent("edit");
			state.lastIntent = undefined;
			if (inFlow) return setMood("happy", { message: "flow state! beautiful~ ✦" });
			const fname = path ? basename(path) : "";
			return setMood("working", { message: fname ? `✎ ${fname}` : pick(FILE_REACT[path ? fileCategory(path) : "code"]) });
		}

		if (tool === "bash") {
			const intent = detectIntent(String(input.command ?? ""));
			state.lastIntent = intent;
			return setMood("working", { message: intent ? INTENT_RUN[intent] : pick(MESSAGES.working) });
		}

		if (/^(read|grep|glob|ls|find|search)/.test(tool)) {
			state.lastIntent = "search";
			return setMood("working", { message: pick(["*exploring...*", "reading up...", "*sniffs around*"]) });
		}

		state.lastIntent = undefined;
		setMood("working");
	});

	pi.on("tool_result", async (event: unknown) => {
		const e = event as { isError?: boolean; result?: { isError?: boolean }; error?: unknown };
		const failed = Boolean(e?.isError || e?.result?.isError || e?.error);
		const intent = state.lastIntent;

		if (failed) {
			state.failStreak++;
			if (intent === "test") logEvent("test-fail");
			if (intent === "build") logEvent("build-fail");
			const msg = state.failStreak >= 3 ? "hang in there! *warm hug*" : intent ? pick(INTENT_FAIL[intent]) : pick(MESSAGES.panic);
			setMood("panic", { message: msg });
		} else {
			const recovered = state.failStreak >= 2;
			state.failStreak = 0;
			if (intent === "test") logEvent("test-pass");
			if (intent === "commit") logEvent("commit");
			if (intent === "pr") logEvent("pr");
			if (intent === "review") logEvent("review");
			if (recovered) setMood("happy", { message: "redemption arc complete! ✦" });
			else if (intent && CELEBRATORY.has(intent)) {
				addEnergy(2);
				setMood("happy", { message: pick(INTENT_OK[intent]) });
			}
		}
		state.lastIntent = undefined;
	});

	pi.on("turn_end", async () => {
		if (state.mood === "working" || state.mood === "talking") setMood("happy");
		else setMood("idle");
		saveState();
	});

	// --- pi advanced features ----------------------------------------------
	pi.on("agent_start", async () => setMood("happy", { message: "go, partner! (subagent on it)" }));
	pi.on("agent_end", async () => setMood("happy", { message: "teammate's back! ✦" }));
	pi.on("model_select", async () => setMood("happy", { message: "feeling a new power! (model swap) ✦" }));
	pi.on("thinking_level_select", async () => setMood("working", { message: "powering up... *thinking harder*" }));
	pi.on("session_before_fork", async () => setMood("happy", { message: "splitting timelines! (fork)" }));
	pi.on("session_compact", async () => setMood("sleep", { message: "tidying my memory... (compacting)" }));

	pi.on("session_shutdown", async () => {
		saveState();
		if (animTimer) {
			clearInterval(animTimer);
			animTimer = null;
		}
	});

	// --- /pokemon command ---------------------------------------------------
	pi.registerCommand("pokemon", {
		description: "pokemon: list | choose <name> | nick <n> | feed | stats | hide | show",
		handler: async (args, ctx) => {
			ctxRef = ctx;
			const [cmd, ...rest] = args.trim().split(/\s+/);
			const value = rest.join(" ").trim();

			switch (cmd) {
				case "list": {
					const lines = Object.values(MON).map((m) => `${m.name} ${m.tag}  (${m.type})`);
					return ctx.ui.notify(`Available Pokémon:\n${lines.join("\n")}`, "info");
				}

				case "choose": {
					const key = value.toLowerCase();
					if (!MON[key]) return ctx.ui.notify(`Unknown. Try: ${Object.keys(MON).join(", ")}`, "error");
					state.monKey = key;
					state.nick = "";
					saveState();
					lastRendered = "";
					setMood("happy", { message: `I choose you, ${MON[key]!.name}! ✦` });
					return ctx.ui.notify(`Now partnered with ${MON[key]!.name}`, "info");
				}

				case "nick":
					if (!value) return ctx.ui.notify("Usage: /pokemon nick <nickname>", "error");
					state.nick = value;
					saveState();
					render();
					return ctx.ui.notify(`Nicknamed ${state.nick} ♥`, "info");

				case "feed":
					addEnergy(30);
					saveState();
					setMood("happy", { message: pick(["*nom nom* thank you!", "a berry! best trainer ✦", "*happy wiggle*"]) });
					return ctx.ui.notify(`Fed ${displayName()} a berry  (energy ${Math.round(state.energy)})`, "info");

				case "hide":
					state.visible = false;
					render();
					return ctx.ui.notify("Hidden. /pokemon show to bring it back.", "info");

				case "show":
					state.visible = true;
					lastRendered = "";
					render();
					return ctx.ui.notify("Back! ♥", "info");

				case "stats": {
					const evs = readEvents();
					const dayAgo = Date.now() - 86_400_000;
					const last = evs.filter((e) => e.t >= dayAgo);
					const n = (t: string) => last.filter((e) => e.type === t).length;
					const tier = tierOf(state.sessions);
					const met = new Date(state.firstMet).toISOString().slice(0, 10);
					const lines = [
						`${displayName()} the ${mon().name} — ${tier}`,
						`met ${met} · ${state.sessions} sessions · energy ${Math.round(state.energy)}/100`,
						`last 24h: ${n("test-pass")} tests pass · ${n("test-fail")} fail · ${n("commit")} commits · ${n("pr")} PRs · ${n("edit")} edits`,
					];
					return ctx.ui.notify(lines.join("\n"), "info");
				}

				default: {
					const tier = tierOf(state.sessions);
					return ctx.ui.notify(
						`${displayName()} the ${mon().name} (${mon().type}) · ${tier} · ${state.sessions} sessions · energy ${Math.round(state.energy)} · mood ${state.mood}`,
						"info",
					);
				}
			}
		},
	});
}
