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

import { type ChildProcess, spawn } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { bar, c, dim } from "./colors.ts";
import {
	CELEBRATORY,
	detectIntent,
	FILE_REACT,
	fileCategory,
	INTENT_FAIL,
	INTENT_OK,
	INTENT_RUN,
	isMcpTool,
	MCP_LINES,
	MESSAGES,
	SUBAGENT_LINES,
	TIME_LINES,
	timeBucket,
	workingMessage,
} from "./content.ts";
import { buildFrame, MON, MOOD_COLOR, type Mon, type Mood } from "./mons.ts";
import { buildLargeFrame, hasLargeArt } from "./sprites.ts";
import { greeting, loadSaved, logEvent, readEvents, saveState, state, tierOf } from "./state.ts";

// ---------------------------------------------------------------------------
// Module-local UI state
// ---------------------------------------------------------------------------

let ctxRef: ExtensionContext | undefined;
let animTimer: ReturnType<typeof setInterval> | null = null;
let lastRendered = "";

// ---------------------------------------------------------------------------
// Keep-awake (system sleep inhibitor)
// ---------------------------------------------------------------------------
// Holds a child process that blocks the OS from sleeping while the pet is on
// watch. macOS uses `caffeinate`, Linux uses `systemd-inhibit`. Windows is not
// supported (no reliable built-in CLI inhibitor).

let awakeProc: ChildProcess | null = null;
let awakeMethod = "";
let awakeReason = "";

function isAwake(): boolean {
	return awakeProc !== null && awakeProc.exitCode === null && !awakeProc.killed;
}

function awakeInfo(): { active: boolean; method: string; reason: string } {
	return { active: isAwake(), method: awakeMethod, reason: awakeReason };
}

function startAwake(
	reason: string,
	onError: (msg: string) => void,
): { supported: boolean; ok: boolean; method?: string } {
	if (isAwake()) return { supported: true, ok: true, method: "already running" };

	let cmd: string;
	let args: string[];
	let method: string;
	if (process.platform === "darwin") {
		cmd = "caffeinate";
		// -d display, -i idle, -m disk, -s system (on AC), -u declare user active
		args = ["-dimsu"];
		method = "caffeinate";
	} else if (process.platform === "linux") {
		cmd = "systemd-inhibit";
		args = [
			"--what=idle:sleep",
			"--who=pi-pokepet",
			`--why=${reason || "keeping awake"}`,
			"--mode=block",
			"sleep",
			"infinity",
		];
		method = "systemd-inhibit";
	} else {
		return { supported: false, ok: false };
	}

	try {
		const proc = spawn(cmd, args, { stdio: "ignore", detached: false });
		proc.on("error", (err) => {
			awakeProc = null;
			onError(`keep-awake failed: ${err.message}`);
		});
		proc.on("exit", () => {
			if (awakeProc === proc) awakeProc = null;
		});
		awakeProc = proc;
		awakeMethod = method;
		awakeReason = reason;
		return { supported: true, ok: true, method };
	} catch {
		awakeProc = null;
		return { supported: true, ok: false };
	}
}

function stopAwake(): void {
	if (awakeProc && awakeProc.exitCode === null) {
		try {
			awakeProc.kill();
		} catch {
			/* ignore */
		}
	}
	awakeProc = null;
	awakeMethod = "";
	awakeReason = "";
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
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

function setWorkingLine(phase: Parameters<typeof workingMessage>[1], detail?: string): void {
	if (!ctxRef?.hasUI) return;
	ctxRef.ui.setWorkingMessage(ctxRef.ui.theme.fg("warning", workingMessage(state.monKey, phase, detail)));
}

function clearWorkingLine(): void {
	if (!ctxRef?.hasUI) return;
	ctxRef.ui.setWorkingMessage();
}

// ---------------------------------------------------------------------------
// Render + animation
// ---------------------------------------------------------------------------

function render(): void {
	if (!ctxRef?.hasUI) return;
	if (!state.visible) {
		ctxRef.ui.setWidget("pokepet", undefined);
		return;
	}

	const m = mon();
	const frameOpts = { lively: state.energy > 60, weak: state.energy < 15 };
	const frame =
		state.size === "large"
			? buildLargeFrame(state.monKey, m, state.mood, state.frameIdx, frameOpts)
			: buildFrame(m, state.mood, state.frameIdx, frameOpts);
	const bodyColor = MOOD_COLOR[state.mood] ?? m.color;
	const messageColor =
		state.mood === "working" || state.mood === "thinking"
			? 226
			: state.mood === "panic"
				? 203
				: state.mood === "happy"
					? 84
					: 250;
	const lines = frame.map((line) => c(bodyColor, line));

	lines.push(`${c(m.color, displayName())} ${m.tag}  ${c(messageColor, state.message)}`);
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
	// Active moods revert to idle once the model/tool goes quiet — but never while a
	// tool is still running (long bash/test would otherwise make the pet doze off).
	const busy = state.mood === "talking" || state.mood === "thinking" || state.mood === "working";
	if (busy && !state.toolActive && since > 1500) {
		setMood("idle");
		return;
	}
	if ((state.mood === "happy" || state.mood === "panic" || state.mood === "hatch") && since > 3000) {
		setMood("idle");
		return;
	}
	// Keep-awake is on: the pet never sleeps — it stands guard instead.
	if (state.mood === "idle" && since > 8_000) {
		setMood("guard");
		return;
	}
	if (state.mood === "guard" && state.frameIdx % 16 === 0) state.message = pick(MESSAGES.guard);
	// A starving pet tires out and nods off far sooner.
	const sleepAfter = state.energy < 15 ? 30_000 : 90_000;
	if (state.mood === "idle" && since > sleepAfter) {
		setMood("sleep");
		return;
	}
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
		ctx.ui.setWorkingVisible(true);
		if (!animTimer) animTimer = setInterval(tick, 450);
	});

	pi.on("turn_start", async () => {
		setWorkingLine("agent");
		setMood("working");
	});

	// The stream tells us *what* the model is doing: reasoning, writing, or
	// composing a tool call. Give reasoning its own "thinking" mood.
	pi.on("message_update", async (event: unknown) => {
		const type = (event as { assistantMessageEvent?: { type?: string } })?.assistantMessageEvent?.type ?? "";

		if (/^thinking/.test(type)) {
			if (state.mood !== "thinking") setMood("thinking");
			else state.lastActivity = Date.now();
			setWorkingLine("thinking");
			return;
		}

		if (/^toolcall/.test(type)) {
			// Composing a tool call — the upcoming tool_call event sets the real message.
			if (state.mood !== "working") setMood("working");
			else state.lastActivity = Date.now();
			setWorkingLine("tool");
			return;
		}

		// text_* (or unknown) -> chatting with you.
		if (state.mood !== "talking") setMood("talking");
		else state.lastActivity = Date.now();
	});

	// Keep the pet alive (and animating) for the full duration of a tool run.
	pi.on("tool_execution_start", async () => {
		state.toolActive = true;
		state.lastActivity = Date.now();
	});
	pi.on("tool_execution_update", async () => {
		state.lastActivity = Date.now();
	});
	pi.on("tool_execution_end", async () => {
		state.toolActive = false;
		state.lastActivity = Date.now();
	});

	pi.on("tool_call", async (event: unknown) => {
		const e = event as { toolName?: string; input?: Record<string, unknown> };
		const tool = e?.toolName ?? "";
		const input = e?.input ?? {};

		// Subagent / autonomous delegation (the `subagent`/`task` tool).
		if (/^(subagent|task|dispatch_agent|agent_)/i.test(tool)) {
			state.lastIntent = undefined;
			setWorkingLine("subagent");
			return setMood("happy", { message: pick(SUBAGENT_LINES) });
		}

		// MCP tool usage (server-prefixed names like firecrawl_*, linear_*, or the mcp gateway).
		if (isMcpTool(tool)) {
			state.lastIntent = undefined;
			setWorkingLine("mcp");
			return setMood("working", { message: pick(MCP_LINES) });
		}

		// PR / review tools (gh, Linear diff, etc.)
		if (/diff|review|pull_request|\bpr_|get_diff/i.test(tool)) {
			state.lastIntent = "review";
			setWorkingLine("review");
			return setMood("working", { message: INTENT_RUN.review });
		}

		// File editing tools -> file-aware reaction + flow detection.
		if (/^(write|edit|str_replace|create|apply_patch|multi_edit)/.test(tool)) {
			const path = String(input.path ?? input.file_path ?? input.filename ?? "");
			const inFlow = noteEdit();
			logEvent("edit");
			state.lastIntent = undefined;
			setWorkingLine("file", path ? basename(path) : undefined);
			if (inFlow) return setMood("happy", { message: "flow state! beautiful~ ✦" });
			const fname = path ? basename(path) : "";
			return setMood("working", {
				message: fname ? `✎ ${fname}` : pick(FILE_REACT[path ? fileCategory(path) : "code"]),
			});
		}

		if (tool === "bash") {
			const intent = detectIntent(String(input.command ?? ""));
			state.lastIntent = intent;
			setWorkingLine("working", intent ? INTENT_RUN[intent] : undefined);
			return setMood("working", { message: intent ? INTENT_RUN[intent] : pick(MESSAGES.working) });
		}

		if (/^(read|grep|glob|ls|find|search)/.test(tool)) {
			state.lastIntent = "search";
			setWorkingLine("search");
			return setMood("working", { message: pick(["*exploring...*", "reading up...", "*sniffs around*"]) });
		}

		state.lastIntent = undefined;
		setWorkingLine("tool");
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
			const msg =
				state.failStreak >= 3 ? "hang in there! *warm hug*" : intent ? pick(INTENT_FAIL[intent]) : pick(MESSAGES.panic);
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
		clearWorkingLine();
		if (state.mood === "working" || state.mood === "talking") setMood("happy");
		else setMood("idle");
		saveState();
	});

	// --- pi advanced features ----------------------------------------------
	// agent_start/agent_end fire once per user prompt (not per subagent) — keep them
	// low-key; real subagent dispatch is detected via the tool_call above.
	pi.on("agent_start", async () => {
		setWorkingLine("agent");
		setMood("working", { message: pick(MESSAGES.working) });
	});
	pi.on("agent_end", async () => setMood("happy", { message: "all wrapped up! ✦" }));
	pi.on("model_select", async () => setMood("happy", { message: "feeling a new power! (model swap) ✦" }));
	pi.on("thinking_level_select", async () => {
		setWorkingLine("thinking");
		setMood("working", { message: "powering up... *thinking harder*" });
	});
	pi.on("session_before_fork", async () => setMood("happy", { message: "splitting timelines! (fork)" }));
	pi.on("session_compact", async () => setMood("sleep", { message: "tidying my memory... (compacting)" }));

	pi.on("session_shutdown", async () => {
		saveState();
		clearWorkingLine();
		stopAwake();
		if (animTimer) {
			clearInterval(animTimer);
			animTimer = null;
		}
	});

	// --- /pokemon command ---------------------------------------------------
	pi.registerCommand("pokemon", {
		description:
			"pokemon: list | choose <name> | large [name] | small | nick <n> | feed | awake [reason] | sleep | stats | hide | show",
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
					setMood("happy", { message: `I choose you, ${MON[key]?.name}! ✦` });
					return ctx.ui.notify(`Now partnered with ${MON[key]?.name}`, "info");
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

				case "large":
				case "big": {
					const key = value.toLowerCase();
					if (key && !MON[key]) return ctx.ui.notify(`Unknown. Try: ${Object.keys(MON).join(", ")}`, "error");
					if (key && MON[key]) {
						state.monKey = key;
						state.nick = "";
						saveState();
					}
					state.size = "large";
					state.visible = true;
					lastRendered = "";
					render();
					const note = hasLargeArt(state.monKey)
						? `Detailed mode ✦ — ${displayName()} the ${mon().name}  (/pokemon small to shrink)`
						: `Detailed mode on — no large art for ${mon().name} yet, showing the default. (/pokemon small to shrink)`;
					return ctx.ui.notify(note, "info");
				}

				case "small":
				case "compact":
					state.size = "small";
					lastRendered = "";
					render();
					return ctx.ui.notify("Back to compact mode. (/pokemon large for detailed art)", "info");

				case "hide":
					state.visible = false;
					render();
					return ctx.ui.notify("Hidden. /pokemon show to bring it back.", "info");

				case "show":
					state.visible = true;
					lastRendered = "";
					render();
					return ctx.ui.notify("Back! ♥", "info");

				case "awake":
				case "caffeinate": {
					const sub = value.toLowerCase();
					if (sub === "status") {
						const info = awakeInfo();
						return ctx.ui.notify(
							info.active
								? `Keeping system awake via ${info.method}${info.reason ? ` — “${info.reason}”` : ""}. /pokemon sleep to release.`
								: "Keep-awake is off.",
							"info",
						);
					}
					// Anything else (including empty) starts keep-awake, using it as the reason.
					const reason = sub === "on" ? "" : value;
					const res = startAwake(reason, (msg) => ctx.ui.notify(`⚠️ ${msg}`, "error"));
					if (!res.supported) return ctx.ui.notify(`⚠️ Keep-awake isn't supported on ${process.platform}.`, "error");
					if (!res.ok) return ctx.ui.notify("⚠️ Couldn't start keep-awake (inhibitor failed to launch).", "error");
					lastRendered = "";
					setMood("guard", { message: reason ? `on watch: ${reason} ☕` : "on watch — system stays awake ☕" });
					return ctx.ui.notify(
						`☕ Your laptop will stay awake${reason ? ` (${reason})` : ""} — sleep is blocked via ${res.method}. Run /pokemon sleep to allow it to sleep again.`,
						"info",
					);
				}

				case "sleep": {
					if (isAwake()) {
						stopAwake();
						lastRendered = "";
						setMood("sleep", { message: "lock released — nap time 💤" });
						return ctx.ui.notify(
							"💤 Keep-awake released — your laptop can sleep normally again (not forcing sleep now).",
							"info",
						);
					}
					lastRendered = "";
					setMood("sleep", { message: pick(MESSAGES.sleep) });
					return ctx.ui.notify(
						`💤 Keep-awake wasn't on. ${displayName()} curls up for a nap (your power settings are unchanged).`,
						"info",
					);
				}

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
					const awake = isAwake() ? " · ☕ awake" : "";
					return ctx.ui.notify(
						`${displayName()} the ${mon().name} (${mon().type}) · ${tier} · ${state.sessions} sessions · energy ${Math.round(state.energy)} · mood ${state.mood}${awake}`,
						"info",
					);
				}
			}
		},
	});
}
