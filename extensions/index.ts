/**
 * pi-pokepet — a cute, colorful Pokémon companion for the pi coding agent.
 *
 * An unofficial, fan-made ASCII buddy that lives below your editor and reacts to
 * what pi is doing: running tools, writing files, running tests, opening PRs,
 * getting reviews, spinning up subagents, compacting, switching models, and more.
 *
 * Pure ASCII + 256-color ANSI, so it renders in Terminal.app and Warp — no image
 * protocol needed.
 *
 * Commands:
 *   /pokemon                    status
 *   /pokemon list               list available Pokémon
 *   /pokemon choose <name>      pick your Pokémon
 *   /pokemon nick <nickname>    give it a nickname
 *   /pokemon feed               give a berry (restores energy)
 *   /pokemon stats              productivity + bond dashboard
 *   /pokemon hide | show        toggle the widget
 *
 * Disclaimer: Pokémon and Pokémon character names are trademarks of Nintendo,
 * Creatures Inc., and GAME FREAK Inc. This is an unofficial fan project, not
 * affiliated with or endorsed by them. The ASCII art is original.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Color (256-color ANSI; honors NO_COLOR)
// ---------------------------------------------------------------------------

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const NO_COLOR = Boolean(process.env.NO_COLOR);

const c = (code: number, text: string): string => (NO_COLOR ? text : `\x1b[38;5;${code}m${text}${RESET}`);
const dim = (text: string): string => (NO_COLOR ? text : `${DIM}${text}${RESET}`);

type Mood = "hatch" | "idle" | "talking" | "working" | "happy" | "panic" | "sleep";

const MOOD_COLOR: Partial<Record<Mood, number>> = {
	talking: 117,
	working: 222,
	happy: 84,
	panic: 203,
	sleep: 244,
};

// ---------------------------------------------------------------------------
// Pokémon roster (stylized original ASCII; identity carried by color + name)
// ---------------------------------------------------------------------------

interface Mon {
	name: string;
	type: string;
	color: number;
	tag: string;
	top: string;
	bottom: string;
	mid: (eyes: string) => string;
	quirks: string[];
}

const MON: Record<string, Mon> = {
	pikachu: {
		name: "Pikachu",
		type: "Electric",
		color: 220,
		tag: "⚡",
		top: " /\\_/\\",
		bottom: " >⚡<",
		mid: (e) => `(${e})`,
		quirks: ["pika pika!", "*cheeks spark*", "chuuu~", "*tail twitches*"],
	},
	charmander: {
		name: "Charmander",
		type: "Fire",
		color: 208,
		tag: "🔥",
		top: "  ,--,",
		bottom: " ~(🔥)",
		mid: (e) => `<${e}>`,
		quirks: ["*tail flickers*", "char char!", "toasty in here", "*warm glow*"],
	},
	squirtle: {
		name: "Squirtle",
		type: "Water",
		color: 39,
		tag: "💧",
		top: "  _=_",
		bottom: " <(_)>",
		mid: (e) => `(${e})`,
		quirks: ["squirtle squirt!", "*bubbles*", "cool and collected", "*splash*"],
	},
	bulbasaur: {
		name: "Bulbasaur",
		type: "Grass",
		color: 41,
		tag: "🍃",
		top: "  (~)",
		bottom: " /---\\",
		mid: (e) => `(${e})`,
		quirks: ["bulba~", "*photosynthesizing*", "growth mindset, literally", "*leaf rustle*"],
	},
	eevee: {
		name: "Eevee",
		type: "Normal",
		color: 179,
		tag: "✦",
		top: " /v__v\\",
		bottom: " >  <~",
		mid: (e) => `(${e})`,
		quirks: ["vee!", "*fluffs tail*", "so many possibilities", "*happy wiggle*"],
	},
	jigglypuff: {
		name: "Jigglypuff",
		type: "Fairy",
		color: 218,
		tag: "♪",
		top: "  .--.",
		bottom: "  '--'",
		mid: (e) => `(${e})`,
		quirks: ["jiggly~ ♪", "*hums a tune*", "don't fall asleep!", "puff puff"],
	},
	psyduck: {
		name: "Psyduck",
		type: "Water",
		color: 228,
		tag: "?",
		top: "  \\_/",
		bottom: "  J L",
		mid: (e) => `(${e})`,
		quirks: ["psy...yi?", "*holds head*", "wait, what was i doing", "*confused quack*"],
	},
};

const EYES: Record<Mood, string[]> = {
	hatch: ["o.o"],
	idle: ["o.o", "-.-"],
	talking: ["o.o", "O.o"],
	working: ["@.@", "°.°"],
	happy: ["^.^", "^o^"],
	panic: ["O.O", "O_O"],
	sleep: ["u.u", "-.-"],
};

function buildFrame(mon: Mon, mood: Mood, idx: number): string[] {
	const eyes = EYES[mood];
	const e = eyes[idx % eyes.length]!;
	let top = mon.top;
	let bottom = mon.bottom;
	if (mood === "sleep") top = `${mon.top}${idx % 2 ? "  z" : " z"}`;
	if (mood === "working") bottom = `${mon.bottom}${idx % 2 ? " *" : ""}`;
	if (mood === "happy") bottom = `${mon.bottom}${idx % 2 ? " !" : " ✦"}`;
	return [top, mon.mid(e), bottom];
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const MESSAGES: Record<Mood, string[]> = {
	hatch: ["ready when you are~"],
	idle: ["just vibing", "*blinks*", "what shall we build?", "i'm here if you need me", "*stretches*"],
	talking: ["ooh, go on...", "*listening*", "i love a good plan", "mhm, mhm!", "tell me more~"],
	working: ["*scribbles notes*", "on it!", "crunching...", "*focus mode*", "tippy-tappy"],
	happy: ["yaaay! ✦", "we did it!", "*happy dance*", "clean run! ✦", "*sparkles*"],
	panic: ["uh oh...", "*nervous*", "we'll fix it!", "deep breaths...", "you got this!"],
	sleep: ["*snoozing* zzz", "wake me when it's go time", "*dreams of berries*"],
};

const TIME_LINES: Record<string, string[]> = {
	morning: ["morning! coffee first?", "fresh start ✦", "sunrise coding hits different"],
	afternoon: ["afternoon grind~", "post-lunch focus", "halfway there!"],
	evening: ["golden hour shipping", "evening flow ✦", "winding up or down?"],
	latenight: ["the world's asleep... except us", "late-night legend", "one more commit, then bed?"],
	weekend: ["coding on a weekend? dedication ✦", "weekend warrior!"],
};

type Intent =
	| "test" | "commit" | "push" | "pull" | "merge" | "rebase" | "stash" | "checkout"
	| "build" | "lint" | "install" | "server" | "docker" | "network" | "search"
	| "pr" | "prmerge" | "review" | "dangerous";

const CELEBRATORY: ReadonlySet<Intent> = new Set([
	"test", "commit", "push", "pull", "merge", "rebase", "build", "lint", "install", "server",
	"pr", "prmerge", "review",
]);

const INTENT_RUN: Record<Intent, string> = {
	test: "running tests...",
	commit: "saving a checkpoint...",
	push: "shipping it...",
	pull: "fetching upstream...",
	merge: "merging branches...",
	rebase: "rewriting history...",
	stash: "tucking changes away...",
	checkout: "switching branches...",
	build: "building...",
	lint: "tidying up...",
	install: "fetching packages...",
	server: "starting the server...",
	docker: "wrangling containers...",
	network: "poking the network...",
	search: "*sniffs around*",
	pr: "opening a PR...",
	prmerge: "merging the PR...",
	review: "reviewing... *adjusts visor*",
	dangerous: "ooh... careful",
};

const INTENT_OK: Record<Intent, string[]> = {
	test: ["ALL GREEN! ✦", "tests pass! *happy dance*"],
	commit: ["checkpoint saved! *relief*", "committed! ✦"],
	push: ["go forth, little commits!", "pushed it! ✦"],
	pull: ["fresh code, who dis", "synced up! ✦"],
	merge: ["branches united! ✦", "merged clean!"],
	rebase: ["history, rewritten ✦", "linear and lovely"],
	stash: ["safely stashed", "tucked away ✦"],
	checkout: ["new branch, new vibes", "switched! ✦"],
	build: ["clean build! *sparkles*", "it compiles! ✦"],
	lint: ["squeaky clean!", "all tidy ✦"],
	install: ["packages in! *nom*", "deps ready!"],
	server: ["server's up! ✦", "we're live (locally)"],
	docker: ["containers go brrr", "whale yes! ✦"],
	network: ["pong! ✦", "network's friendly today"],
	search: ["found it!", "*aha*"],
	pr: ["PR opened! ship it 🚀", "pull request away! ✦"],
	prmerge: ["PR merged! evolution complete ✦", "merged! 🎉"],
	review: ["looks good to me! ✦", "approved! *nods*"],
	dangerous: ["...we survived", "*exhales* okay, okay"],
};

const INTENT_FAIL: Record<Intent, string[]> = {
	test: ["tests tripped... you got this!", "red, but we'll fix it"],
	commit: ["commit hiccup...", "let's try that again"],
	push: ["push bounced back...", "remote said no... for now"],
	pull: ["pull had conflicts...", "upstream's feisty"],
	merge: ["merge conflict! *rolls up sleeves*", "tangled branches..."],
	rebase: ["rebase snagged...", "conflicts ahead"],
	stash: ["stash hiccup...", "couldn't tuck that"],
	checkout: ["checkout blocked...", "stash first, maybe?"],
	build: ["build broke... *deep breath*", "compiler's grumpy"],
	lint: ["lint found some lint", "a few nits to pick"],
	install: ["install snagged...", "dependency drama"],
	server: ["server faceplanted...", "port already taken?"],
	docker: ["container capsized...", "whale, that failed"],
	network: ["network ghosted us...", "timeout :("],
	search: ["nothing here...", "*shrugs*"],
	pr: ["PR didn't open...", "push the branch first?"],
	prmerge: ["merge blocked...", "checks still red?"],
	review: ["found some notes...", "needs another pass"],
	dangerous: ["that was spicy...", "*hides* not that one"],
};

const FILE_REACT: Record<string, string[]> = {
	test: ["writing tests? *proud*", "coverage ++ ✦"],
	docs: ["documenting! future-you thanks you", "words words words ✎"],
	styles: ["making it pretty ✦", "pixel-perfect vibes"],
	config: ["tweaking the knobs...", "config wizardry"],
	code: ["shipping logic ✎", "*watches you type*"],
};

function fileCategory(path: string): keyof typeof FILE_REACT {
	const p = path.toLowerCase();
	if (/\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|\/tests?\//.test(p)) return "test";
	if (/\.(md|mdx|txt|rst|adoc)$/.test(p)) return "docs";
	if (/\.(css|scss|sass|less|styl)$/.test(p)) return "styles";
	if (/\.(json|ya?ml|toml|ini|env|lock)$|\.config\.[a-z]+$/.test(p)) return "config";
	return "code";
}

function detectIntent(cmd: string): Intent | undefined {
	const x = cmd.toLowerCase();
	if (/\brm\s+-rf|sudo\b|drop\s+table|:\(\)\s*\{|\bmkfs\b|>\s*\/dev\/sd/.test(x)) return "dangerous";
	if (/gh\s+pr\s+merge/.test(x)) return "prmerge";
	if (/gh\s+pr\s+create/.test(x)) return "pr";
	if (/gh\s+pr\s+(review|diff|view|checks|checkout)|git\s+request-pull/.test(x)) return "review";
	if (/\b(vitest|jest|pytest|go test|cargo test|rspec|phpunit)\b|(npm|yarn|pnpm|bun)\s+(run\s+)?test/.test(x)) return "test";
	if (/git\s+commit/.test(x)) return "commit";
	if (/git\s+push/.test(x)) return "push";
	if (/git\s+pull|git\s+fetch/.test(x)) return "pull";
	if (/git\s+merge/.test(x)) return "merge";
	if (/git\s+rebase/.test(x)) return "rebase";
	if (/git\s+stash/.test(x)) return "stash";
	if (/git\s+(checkout|switch)/.test(x)) return "checkout";
	if (/\b(docker|docker-compose|kubectl|helm|podman)\b/.test(x)) return "docker";
	if (/(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve)|next\s+dev|vite\b|nodemon|uvicorn|flask run|rails s/.test(x)) return "server";
	if (/\b(tsc|webpack|rollup|esbuild|make)\b|(npm|yarn|pnpm|bun)\s+(run\s+)?build/.test(x)) return "build";
	if (/\b(biome|eslint|prettier|ruff|black|gofmt|clippy)\b|(npm|yarn|pnpm|bun)\s+(run\s+)?(lint|format)/.test(x)) return "lint";
	if (/(npm|yarn|pnpm|bun)\s+(install|add|i)\b|pip\s+install|cargo\s+add|go\s+get/.test(x)) return "install";
	if (/\b(curl|wget|http|ping|nc)\b/.test(x)) return "network";
	if (/\b(grep|rg|ag|find|fd|ls|cat|less|tail|head)\b/.test(x)) return "search";
	return undefined;
}

function timeBucket(): keyof typeof TIME_LINES {
	const d = new Date();
	if (d.getDay() === 0 || d.getDay() === 6) return "weekend";
	const h = d.getHours();
	if (h >= 22 || h < 5) return "latenight";
	if (h < 12) return "morning";
	if (h < 17) return "afternoon";
	return "evening";
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const DIR = join(homedir(), ".pi", "agent");
const STATE_FILE = join(DIR, "pokepet-state.json");
const EVENT_FILE = join(DIR, "pokepet-events.jsonl");

interface SavedState {
	monKey: string;
	nick: string;
	sessions: number;
	firstMet: string;
	lastSeen: string;
	energy: number;
}

function loadSaved(): Partial<SavedState> {
	try {
		if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8"));
	} catch {
		/* ignore */
	}
	return {};
}

function saveState(): void {
	try {
		mkdirSync(DIR, { recursive: true });
		const data: SavedState = {
			monKey: state.monKey,
			nick: state.nick,
			sessions: state.sessions,
			firstMet: state.firstMet,
			lastSeen: new Date().toISOString(),
			energy: Math.round(state.energy),
		};
		writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
	} catch {
		/* best-effort */
	}
}

function logEvent(type: string): void {
	try {
		mkdirSync(DIR, { recursive: true });
		appendFileSync(EVENT_FILE, `${JSON.stringify({ t: Date.now(), type })}\n`);
	} catch {
		/* best-effort */
	}
}

function readEvents(): { t: number; type: string }[] {
	try {
		if (!existsSync(EVENT_FILE)) return [];
		return readFileSync(EVENT_FILE, "utf8").trim().split("\n").slice(-2000).map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}

type Tier = "stranger" | "buddy" | "partner" | "bestie";
function tierOf(sessions: number): Tier {
	if (sessions >= 50) return "bestie";
	if (sessions >= 15) return "partner";
	if (sessions >= 3) return "buddy";
	return "stranger";
}
function greeting(tier: Tier, sessions: number, mon: Mon): string {
	switch (tier) {
		case "bestie": return `BESTIE! you're back! #${sessions}`;
		case "partner": return "my favorite trainer is back!";
		case "buddy": return "hey, good to see you again!";
		default: return `a wild ${mon.name} appeared!`;
	}
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface PokeState {
	monKey: string;
	nick: string;
	mood: Mood;
	frameIdx: number;
	message: string;
	visible: boolean;
	lastActivity: number;
	lastIntent?: Intent;
	sessions: number;
	firstMet: string;
	energy: number;
	failStreak: number;
	editTimes: number[];
}

const state: PokeState = {
	monKey: "pikachu",
	nick: "",
	mood: "hatch",
	frameIdx: 0,
	message: "",
	visible: true,
	lastActivity: Date.now(),
	sessions: 0,
	firstMet: new Date().toISOString(),
	energy: 85,
	failStreak: 0,
	editTimes: [],
};

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

function setMood(mood: Mood, opts: { message?: string } = {}): void {
	state.mood = mood;
	state.frameIdx = 0;
	state.message = opts.message ?? (mood === "idle" ? pick(idlePool()) : pick(MESSAGES[mood]));
	state.lastActivity = Date.now();
	render();
}

const addEnergy = (n: number): void => {
	state.energy = Math.max(0, Math.min(100, state.energy + n));
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function bar(pct: number, cells = 4): string {
	const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)));
	return "▓".repeat(filled) + "░".repeat(cells - filled);
}

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
// Wiring
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
