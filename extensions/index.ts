/**
 * pi-pokepet - a reactive pet companion for the pi coding agent.
 *
 * The public command surface is /pet. The legacy ASCII roster is still
 * available through `style ascii`; Petdex sprite pets are available through
 * `style image`.
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
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
import {
	broadcastState,
	getManagerStatus,
	launchElectron,
	startElectronManager,
	stopElectron,
	stopElectronManager,
} from "./electron-manager.ts";
import { buildFrame, MON, MOOD_COLOR, type Mon, type Mood } from "./mons.ts";
import {
	fetchPetdexManifest,
	installPetdexPet,
	listLocalPetdexPets,
	loadLocalPetdexPet,
	PETDEX_PETS_DIR,
	type PetdexManifestPet,
	type PetdexPet,
} from "./petdex.ts";
import { buildTextPetWidget } from "./petdex-widget.ts";
import {
	applySavedState,
	getPetPersonality,
	greeting,
	loadSaved,
	logEvent,
	readEvents,
	saveState,
	state,
	tierOf,
} from "./state.ts";

let ctxRef: ExtensionContext | undefined;
let animTimer: ReturnType<typeof setInterval> | null = null;
let lastRendered = "";
let lastEnergyTick = Date.now();
let activeImagePet: PetdexPet | undefined;

const MAX_WIDGET_COLUMNS = 72;
const MIN_WIDGET_COLUMNS = 24;
const WIDGET_MARGIN_COLUMNS = 4;

// ---------------------------------------------------------------------------
// Keep-awake (system sleep inhibitor)
// ---------------------------------------------------------------------------

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
const asciiMon = (): Mon => MON[state.asciiPetKey] ?? MON.pikachu!;

function imageName(): string {
	return activeImagePet?.metadata.displayName || state.imagePetSlug || "Petdex pet";
}

function displayName(): string {
	return state.nick || (state.style === "image" ? imageName() : asciiMon().name);
}

function widgetColumns(): number {
	const terminalColumns = process.stdout.columns || 80;
	return Math.max(MIN_WIDGET_COLUMNS, Math.min(MAX_WIDGET_COLUMNS, terminalColumns - WIDGET_MARGIN_COLUMNS));
}

function wrapPlain(text: string, maxColumns: number): string[] {
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean) return [""];

	const lines: string[] = [];
	let line = "";
	for (const word of clean.split(" ")) {
		if (word.length > maxColumns) {
			if (line) {
				lines.push(line);
				line = "";
			}
			for (let i = 0; i < word.length; i += maxColumns) lines.push(word.slice(i, i + maxColumns));
			continue;
		}
		const candidate = line ? `${line} ${word}` : word;
		if (candidate.length <= maxColumns) line = candidate;
		else {
			lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	return lines;
}

function statusLines(nameColor: number, tag: string, messageColor: number, maxColumns: number): string[] {
	const plain = `${displayName()} ${tag}  ${state.message}`.trim();
	return wrapPlain(plain, maxColumns).map((line, idx) => (idx === 0 ? c(nameColor, line) : c(messageColor, line)));
}

function idlePool(): string[] {
	const base = [...MESSAGES.idle, ...TIME_LINES[timeBucket()]];
	if (state.style === "ascii") base.push(...asciiMon().quirks);
	else if (activeImagePet?.metadata.description) base.push(activeImagePet.metadata.description);
	if (state.energy < 20) base.push("*tummy rumbles* a berry? (/pet feed)", "running low... feed me?");
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
	ctxRef.ui.setWorkingMessage(ctxRef.ui.theme.fg("warning", workingMessage(state.asciiPetKey, phase, detail)));
}

function clearWorkingLine(): void {
	if (!ctxRef?.hasUI) return;
	ctxRef.ui.setWorkingMessage();
}

async function activateImagePet(slug: string): Promise<PetdexPet> {
	const pet = loadLocalPetdexPet(slug);
	if (!pet) throw new Error(`No installed Petdex pet named ${slug}. Try /pet install ${slug}`);
	activeImagePet = pet;
	state.imagePetSlug = pet.slug;
	lastRendered = "";
	return pet;
}

async function ensureImageReady(): Promise<void> {
	if (state.style !== "image" || !state.imagePetSlug) return;
	if (activeImagePet?.slug !== state.imagePetSlug) {
		await activateImagePet(state.imagePetSlug);
	}
}

function renderAsciiFrame(): string[] {
	const m = asciiMon();
	const frameIdx = Math.floor(state.frameIdx / 3);
	const frameOpts = { lively: state.energy > 60, weak: state.energy < 15 };
	const frame = buildFrame(m, state.mood, frameIdx, frameOpts);
	const bodyColor = MOOD_COLOR[state.mood] ?? m.color;
	return frame.map((line) => c(bodyColor, line));
}

function render(): void {
	if (!ctxRef?.hasUI) return;
	if (!state.visible) {
		ctxRef.ui.setWidget("pokepet", undefined);
		stopElectron();
		return;
	}

	const maxColumns = widgetColumns();
	const m = asciiMon();
	const messageColor =
		state.mood === "working" || state.mood === "thinking"
			? 226
			: state.mood === "panic"
				? 203
				: state.mood === "happy"
					? 84
					: 250;

	if (state.style === "image") {
		// Launch Electron if not running
		launchElectron();
		// Broadcast state changes
		broadcastState();

		const nameColor = 117;
		const tag = "Petdex";
		const status = statusLines(nameColor, tag, messageColor, maxColumns);
		const meter = dim(`${c(203, "\u2665")}${bar(state.energy)} ${Math.round(state.energy)}`);

		const lines = [...status, meter];
		const signature = ["text:electron", ...lines].join("\n");
		if (signature === lastRendered) return;
		lastRendered = signature;
		ctxRef.ui.setWidget("pokepet", () => buildTextPetWidget({ lines }), { placement: "belowEditor" });
		return;
	}

	// ASCII path
	const lines = renderAsciiFrame();
	const nameColor = m.color;
	const tag = m.tag;
	const status = statusLines(nameColor, tag, messageColor, maxColumns);
	const meter = dim(`${c(203, "\u2665")}${bar(state.energy)} ${Math.round(state.energy)}`);

	lines.push(...status);
	lines.push(meter);

	const signature = ["text:ascii", ...lines].join("\n");
	if (signature === lastRendered) return;
	lastRendered = signature;
	ctxRef.ui.setWidget("pokepet", () => buildTextPetWidget({ lines }), { placement: "belowEditor" });
}

function tick(): void {
	const now = Date.now();
	const elapsed = now - lastEnergyTick;
	lastEnergyTick = now;
	state.frameIdx++;
	addEnergy(-0.02 * (elapsed / 450));

	const since = Date.now() - state.lastActivity;
	const busy = state.mood === "talking" || state.mood === "thinking" || state.mood === "working";
	if (busy && !state.toolActive && since > 1500) {
		setMood("idle");
		return;
	}
	if ((state.mood === "happy" || state.mood === "panic" || state.mood === "hatch") && since > 3000) {
		setMood("idle");
		return;
	}
	if (state.mood === "idle" && since > 8_000 && isAwake()) {
		setMood("guard");
		return;
	}
	if (state.mood === "guard" && state.frameIdx % 40 === 0) state.message = pick(MESSAGES.guard);

	const sleepAfter = state.energy < 15 ? 30_000 : 90_000;
	if (state.mood === "idle" && since > sleepAfter) {
		setMood("sleep");
		return;
	}
	if (state.mood === "idle" && state.frameIdx % 40 === 0) state.message = pick(idlePool());
	render();
}

function noteEdit(): boolean {
	const now = Date.now();
	state.editTimes = state.editTimes.filter((t) => now - t < 20_000);
	state.editTimes.push(now);
	return state.editTimes.length >= 4;
}

function getSystemProcesses(query?: string): { pid: number; name: string }[] {
	try {
		const output = execSync("ps -ax -o pid,comm", { encoding: "utf8" });
		const lines = output.split("\n").slice(1); // skip header
		const results: { pid: number; name: string }[] = [];
		const normalizedQuery = query?.toLowerCase();

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// split by first whitespace to get PID and Command Path
			const match = trimmed.match(/^(\d+)\s+(.+)$/);
			if (!match) continue;

			const pid = Number.parseInt(match[1]!, 10);
			const fullPath = match[2]!;
			const name = basename(fullPath);

			if (normalizedQuery) {
				if (name.toLowerCase().includes(normalizedQuery) || fullPath.toLowerCase().includes(normalizedQuery)) {
					results.push({ pid, name });
				}
			} else {
				results.push({ pid, name });
			}
		}
		return results;
	} catch (err) {
		console.error("Failed to fetch system processes:", err);
		return [];
	}
}

const BALL = ["◓", "◑", "◒", "●"].map((f) => c(196, f));

function formatGalleryPet(pet: PetdexManifestPet): string {
	const by = pet.submittedBy ? ` by ${pet.submittedBy}` : "";
	const kind = pet.kind ? ` (${pet.kind})` : "";
	return `${pet.slug} - ${pet.displayName}${kind}${by}`;
}

async function choosePet(value: string): Promise<string> {
	const key = value.toLowerCase();
	if (!key) throw new Error("Usage: /pet choose <id>");

	const installed = loadLocalPetdexPet(key);
	if (installed) {
		state.style = "image";
		state.nick = "";
		await activateImagePet(key);
		saveState();
		setMood("happy", { message: `${installed.metadata.displayName} joined from Petdex!` });
		return `Now partnered with ${installed.metadata.displayName}`;
	}

	if (MON[key]) {
		state.style = "ascii";
		state.asciiPetKey = key;
		state.nick = "";
		saveState();
		lastRendered = "";
		setMood("happy", { message: `I choose you, ${MON[key]?.name}! ✦` });
		return `Now partnered with ${MON[key]?.name}`;
	}

	throw new Error(`Unknown pet. Try /pet list or /pet gallery ${key}`);
}

export default function pokepetExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctxRef = ctx;
		if (!ctx.hasUI) return;

		applySavedState(loadSaved(), (key) => Boolean(MON[key]));
		if (state.style === "image" && state.imagePetSlug) {
			try {
				await ensureImageReady();
			} catch (err) {
				state.style = "ascii";
				ctx.ui.notify(
					`${err instanceof Error ? err.message : "Petdex pet failed to load"}; showing ASCII pet.`,
					"error",
				);
			}
		}

		startElectronManager();
		saveState();
		logEvent("session-start");

		const prev = tierOf(state.sessions - 1);
		const tier = tierOf(state.sessions);
		const tierUp = tier !== prev && state.sessions > 1;
		setMood("hatch", {
			message: tierUp ? `${tier.toUpperCase()} unlocked! ✦` : greeting(tier, state.sessions, asciiMon()),
		});

		ctx.ui.setWorkingIndicator({ frames: BALL, intervalMs: 150 });
		ctx.ui.setWorkingVisible(true);
		if (!animTimer) animTimer = setInterval(tick, 180);
	});

	pi.on("turn_start", async () => {
		setWorkingLine("agent");
		setMood("working");
	});

	pi.on("message_update", async (event: unknown) => {
		const type = (event as { assistantMessageEvent?: { type?: string } })?.assistantMessageEvent?.type ?? "";

		if (/^thinking/.test(type)) {
			if (state.mood !== "thinking") setMood("thinking");
			else state.lastActivity = Date.now();
			setWorkingLine("thinking");
			return;
		}

		if (/^toolcall/.test(type)) {
			if (state.mood !== "working") setMood("working");
			else state.lastActivity = Date.now();
			setWorkingLine("tool");
			return;
		}

		if (state.mood !== "talking") setMood("talking");
		else state.lastActivity = Date.now();
	});

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

		if (/^(subagent|task|dispatch_agent|agent_)/i.test(tool)) {
			state.lastIntent = undefined;
			setWorkingLine("subagent");
			return setMood("happy", { message: pick(SUBAGENT_LINES) });
		}

		if (isMcpTool(tool)) {
			state.lastIntent = undefined;
			setWorkingLine("mcp");
			return setMood("working", { message: pick(MCP_LINES) });
		}

		if (/diff|review|pull_request|\bpr_|get_diff/i.test(tool)) {
			state.lastIntent = "review";
			setWorkingLine("review");
			return setMood("thinking", { message: INTENT_RUN.review });
		}

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
			return setMood("running", { message: intent ? INTENT_RUN[intent] : pick(MESSAGES.working) });
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
			let msg: string;
			if (intent === "build") {
				msg = "Build failed! ❌";
			} else if (intent === "test") {
				msg = "Tests failed! ❌";
			} else {
				msg =
					state.failStreak >= 3
						? "hang in there! *warm hug*"
						: intent
							? pick(INTENT_FAIL[intent])
							: pick(MESSAGES.panic);
			}
			setMood("panic", { message: msg });
		} else {
			const recovered = state.failStreak >= 2;
			state.failStreak = 0;
			if (intent === "test") logEvent("test-pass");
			if (intent === "commit") logEvent("commit");
			if (intent === "pr") logEvent("pr");
			if (intent === "review") logEvent("review");

			if (intent === "build") {
				addEnergy(2);
				setMood("happy", { message: "Build complete! ✦" });
			} else if (intent === "test") {
				addEnergy(2);
				setMood("happy", { message: "Tests passed! 🎉" });
			} else if (recovered) {
				setMood("happy", { message: "redemption arc complete! ✦" });
			} else if (intent && CELEBRATORY.has(intent)) {
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
		stopElectronManager();
		if (animTimer) {
			clearInterval(animTimer);
			animTimer = null;
		}
	});

	pi.registerCommand("pet", {
		description:
			"pet: style ascii|image | list | choose <id> | gallery [query] | install <slug> | uninstall <slug> | nick <n> | feed | awake [reason] | sleep | stats | status | ps | kill [pid] | hide | show | help",
		handler: async (args, ctx) => {
			ctxRef = ctx;
			const [cmd = "", ...rest] = args.trim().split(/\s+/).filter(Boolean);
			const value = rest.join(" ").trim();

			try {
				switch (cmd) {
					case "help": {
						const helpLines = [
							"Available commands:",
							"  /pet style ascii|image  - Switch rendering style",
							"  /pet list               - List installed pets for active style",
							"  /pet choose <id>        - Partner with an ASCII pet or installed Petdex pet",
							"  /pet gallery [query]    - Search public Petdex gallery",
							"  /pet install <slug>     - Download and choose a Petdex pet",
							"  /pet uninstall <slug>   - Uninstall and delete a Petdex pet from disk",
							"  /pet nick <nickname>    - Set custom nickname",
							"  /pet feed               - Feed your pet to restore energy",
							"  /pet awake [reason]     - Keep system awake",
							"  /pet sleep              - Allow system to sleep / put pet to sleep",
							"  /pet stats              - View productivity stats",
							"  /pet status             - Show current server and companion status",
							"  /pet ps | processes     - List names and PIDs of active processes",
							"  /pet kill [pid]         - Terminate Electron companion or a specific PID",
							"  /pet hide | show        - Hide or show the status widget",
							"  /pet help               - Show this help list",
						];
						return ctx.ui.notify(helpLines.join("\n"), "info");
					}

					case "style": {
						const style = value.toLowerCase();
						if (style !== "ascii" && style !== "image") return ctx.ui.notify("Usage: /pet style ascii|image", "error");
						if (style === "image") {
							if (!state.imagePetSlug) {
								const first = listLocalPetdexPets()[0];
								if (!first)
									return ctx.ui.notify("No Petdex pets installed. Try /pet install boba or /pet gallery.", "error");
								state.imagePetSlug = first.slug;
							}
							state.style = "image";
							await ensureImageReady();
							launchElectron();
						} else if (style === "ascii") {
							stopElectron();
						}
						state.style = style;
						state.visible = true;
						saveState();
						lastRendered = "";
						setMood("happy", { message: style === "image" ? "Petdex image mode online!" : "ASCII mode online!" });
						return ctx.ui.notify(`Pet style set to ${style}.`, "info");
					}

					case "list": {
						if (state.style === "image") {
							const pets = listLocalPetdexPets();
							if (pets.length === 0) return ctx.ui.notify("No installed Petdex pets. Try /pet install boba.", "info");
							return ctx.ui.notify(
								`Installed Petdex pets:\n${pets.map((pet) => `${pet.slug} - ${pet.metadata.displayName}`).join("\n")}`,
								"info",
							);
						}
						const lines = Object.values(MON).map((pet) => `${pet.name} ${pet.tag}  (${pet.type})`);
						return ctx.ui.notify(`Available ASCII pets:\n${lines.join("\n")}`, "info");
					}

					case "gallery": {
						const query = value.toLowerCase();
						const manifest = await fetchPetdexManifest();
						const pets = manifest.pets
							.filter(
								(pet) => !query || `${pet.slug} ${pet.displayName} ${pet.kind ?? ""}`.toLowerCase().includes(query),
							)
							.slice(0, 20);
						if (pets.length === 0) return ctx.ui.notify(`No Petdex gallery pets matched "${value}".`, "info");
						return ctx.ui.notify(`Petdex gallery:\n${pets.map(formatGalleryPet).join("\n")}`, "info");
					}

					case "install": {
						const slug = value.toLowerCase();
						if (!slug) return ctx.ui.notify("Usage: /pet install <slug>", "error");
						const pet = await installPetdexPet(slug);
						state.style = "image";
						state.nick = "";
						await activateImagePet(pet.slug);
						saveState();
						setMood("happy", { message: `${pet.metadata.displayName} installed! ✦` });
						return ctx.ui.notify(`Installed and selected ${pet.metadata.displayName}.`, "info");
					}

					case "uninstall":
					case "remove":
					case "delete": {
						const slug = value.toLowerCase();
						if (!slug) return ctx.ui.notify("Usage: /pet uninstall <slug>", "error");

						const targetDir = join(PETDEX_PETS_DIR, slug);
						if (!existsSync(targetDir)) {
							return ctx.ui.notify(`Pet "${slug}" is not installed.`, "error");
						}

						rmSync(targetDir, { recursive: true, force: true });

						if (state.imagePetSlug === slug) {
							const pets = listLocalPetdexPets();
							if (pets.length > 0) {
								state.imagePetSlug = pets[0].slug;
								await activateImagePet(state.imagePetSlug);
							} else {
								state.imagePetSlug = "";
								state.style = "ascii";
								state.asciiPetKey = "pikachu";
								stopElectron();
							}
							saveState();
							lastRendered = "";
						}

						setMood("happy", { message: `Uninstalled ${slug}!` });
						return ctx.ui.notify(`Successfully uninstalled and deleted "${slug}" from disk.`, "info");
					}

					case "choose": {
						const note = await choosePet(value);
						return ctx.ui.notify(note, "info");
					}

					case "nick":
						if (!value) return ctx.ui.notify("Usage: /pet nick <nickname>", "error");
						state.nick = value;
						saveState();
						render();
						return ctx.ui.notify(`Nicknamed ${state.nick} ♥`, "info");

					case "feed":
						addEnergy(30);
						saveState();
						setMood("happy", { message: pick(["*nom nom* thank you!", "a berry! best partner ✦", "*happy wiggle*"]) });
						return ctx.ui.notify(`Fed ${displayName()} a berry (energy ${Math.round(state.energy)})`, "info");

					case "hide":
						state.visible = false;
						render();
						return ctx.ui.notify("Hidden. /pet show to bring it back.", "info");

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
									? `Keeping system awake via ${info.method}${info.reason ? ` - "${info.reason}"` : ""}. /pet sleep to release.`
									: "Keep-awake is off.",
								"info",
							);
						}
						const reason = sub === "on" ? "" : value;
						const res = startAwake(reason, (msg) => ctx.ui.notify(`Warning: ${msg}`, "error"));
						if (!res.supported) return ctx.ui.notify(`Keep-awake isn't supported on ${process.platform}.`, "error");
						if (!res.ok) return ctx.ui.notify("Couldn't start keep-awake (inhibitor failed to launch).", "error");
						lastRendered = "";
						setMood("guard", { message: reason ? `on watch: ${reason}` : "on watch - system stays awake" });
						return ctx.ui.notify(
							`Your laptop will stay awake${reason ? ` (${reason})` : ""} via ${res.method}. Run /pet sleep to allow sleep again.`,
							"info",
						);
					}

					case "sleep": {
						if (isAwake()) {
							stopAwake();
							lastRendered = "";
							setMood("sleep", { message: "lock released - nap time" });
							return ctx.ui.notify("Keep-awake released - your laptop can sleep normally again.", "info");
						}
						lastRendered = "";
						setMood("sleep", { message: pick(MESSAGES.sleep) });
						return ctx.ui.notify(`Keep-awake wasn't on. ${displayName()} curls up for a nap.`, "info");
					}

					case "stats": {
						const evs = readEvents();
						const dayAgo = Date.now() - 86_400_000;
						const last = evs.filter((event) => event.t >= dayAgo);
						const n = (type: string) => last.filter((event) => event.type === type).length;
						const id = state.style === "image" ? state.imagePetSlug || "Petdex" : state.asciiPetKey;
						const pers = getPetPersonality(id, state.nick);
						const met = new Date(state.firstMet).toISOString().slice(0, 10);
						const petLine =
							state.style === "image"
								? `${displayName()} (${state.imagePetSlug || "Petdex"})`
								: `${displayName()} the ${asciiMon().name}`;
						const lines = [
							`${petLine} - ${pers.tier} Companion`,
							`Personality: Chaos ${pers.chaos}% | Curiosity ${pers.curiosity}% | Snark ${pers.snark}%`,
							`style ${state.style} - met ${met} - ${state.sessions} sessions - energy ${Math.round(state.energy)}/100`,
							`last 24h: ${n("test-pass")} tests pass - ${n("test-fail")} fail - ${n("commit")} commits - ${n("pr")} PRs - ${n("edit")} edits`,
						];
						return ctx.ui.notify(lines.join("\n"), "info");
					}

					case "status": {
						const status = getManagerStatus();
						const activePid = status.electronPid ? `PID ${status.electronPid}` : "Not running";
						const activePort = status.serverPort ? `Port ${status.serverPort}` : "Not listening";
						const id = state.style === "image" ? state.imagePetSlug || "Petdex" : state.asciiPetKey;
						const pers = getPetPersonality(id, state.nick);
						const awake = isAwake() ? " - awake" : "";
						const identity =
							state.style === "image"
								? `${displayName()} (${state.imagePetSlug || "Petdex"})`
								: `${displayName()} the ${asciiMon().name} (${asciiMon().type})`;
						const lines = [
							`${identity} - ${state.style} (${pers.tier}) - ${state.sessions} sessions - energy ${Math.round(state.energy)}% - mood ${state.mood}${awake}`,
							`Local Server: ${activePort}`,
							`Electron App: ${activePid}`,
						];
						return ctx.ui.notify(lines.join("\n"), "info");
					}

					case "ps":
					case "processes": {
						const status = getManagerStatus();
						const pokepetLines = [
							"Active Pokepet Processes:",
							`  - Name: pi-pokepet Extension Server (PID: ${process.pid}, Port: ${status.serverPort || "Not listening"})`,
							`  - Name: pi-pokepet Electron Companion (PID: ${status.electronPid ?? "Not running"})`,
							`  - Name: Keep-Awake (${awakeMethod || "None"}) (PID: ${awakeProc?.pid ?? "Not running"})`,
						];

						if (value) {
							const matched = getSystemProcesses(value);
							if (matched.length === 0) {
								return ctx.ui.notify(`No system processes found matching "${value}".`, "info");
							}
							const displayed = matched.slice(0, 30);
							const lines = [
								`System processes matching "${value}" (${matched.length} found):`,
								...displayed.map((p) => `  - PID: ${p.pid} | Name: ${p.name}`),
							];
							if (matched.length > 30) {
								lines.push(`  ... and ${matched.length - 30} more processes.`);
							}
							return ctx.ui.notify(lines.join("\n"), "info");
						}

						pokepetLines.push(
							"",
							"To search system-wide processes: /pet ps <query>",
							"To kill any process by PID:      /pet kill <pid>",
						);
						return ctx.ui.notify(pokepetLines.join("\n"), "info");
					}

					case "kill": {
						const status = getManagerStatus();
						if (value) {
							const pidToKill = Number.parseInt(value, 10);
							if (Number.isNaN(pidToKill)) {
								return ctx.ui.notify("Usage: /pet kill [pid]", "error");
							}
							if (pidToKill === process.pid) {
								return ctx.ui.notify(
									"Error: Terminating the Extension Server PID is blocked to prevent crashing the agent session.",
									"error",
								);
							}
							if (status.electronPid && pidToKill === status.electronPid) {
								stopElectron();
								return ctx.ui.notify("Electron companion process terminated.", "info");
							}
							if (awakeProc && pidToKill === awakeProc.pid) {
								stopAwake();
								lastRendered = "";
								setMood("sleep", { message: "lock released - nap time" });
								return ctx.ui.notify("Keep-awake process terminated.", "info");
							}
							try {
								process.kill(pidToKill, "SIGTERM");
								return ctx.ui.notify(`Successfully sent SIGTERM to process PID ${pidToKill}.`, "info");
							} catch (err) {
								return ctx.ui.notify(
									`Failed to kill process PID ${pidToKill}: ${err instanceof Error ? err.message : String(err)}`,
									"error",
								);
							}
						}
						stopElectron();
						return ctx.ui.notify("Electron companion process terminated.", "info");
					}

					default: {
						const tier = tierOf(state.sessions);
						const awake = isAwake() ? " - awake" : "";
						const identity =
							state.style === "image"
								? `${displayName()} (${state.imagePetSlug || "Petdex"})`
								: `${displayName()} the ${asciiMon().name} (${asciiMon().type})`;
						return ctx.ui.notify(
							`${identity} - ${state.style} - ${tier} - ${state.sessions} sessions - energy ${Math.round(state.energy)} - mood ${state.mood}${awake}`,
							"info",
						);
					}
				}
			} catch (err) {
				return ctx.ui.notify(err instanceof Error ? err.message : "Pet command failed.", "error");
			}
		},
	});
}
