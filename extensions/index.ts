/**
 * pi-pokepet - a reactive pet companion for the pi coding agent.
 *
 * The public command surface is /pet. The legacy ASCII roster is still
 * available through `style ascii`; Petdex sprite pets are available through
 * `style image`.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { allocateImageId } from "@earendil-works/pi-tui";
import { bar, c, dim, NO_COLOR } from "./colors.ts";
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
import {
	fetchPetdexManifest,
	installPetdexPet,
	listLocalPetdexPets,
	loadLocalPetdexPet,
	type PetdexManifestPet,
	type PetdexPet,
} from "./petdex.ts";
import { getNativePetdexFrame, type NativeRenderedPet, prepareNativePetdexPet } from "./petdex-native-renderer.ts";
import type { RenderedPet } from "./petdex-renderer.ts";
import { getRenderedPetFrame, renderPetdexPetForColumns, visibleWidth } from "./petdex-renderer.ts";
import { buildNativePetWidget, buildTextPetWidget, supportsNativeImagePets } from "./petdex-widget.ts";
import { buildLargeFrame, hasLargeArt } from "./sprites.ts";
import { applySavedState, greeting, loadSaved, logEvent, readEvents, saveState, state, tierOf } from "./state.ts";

let ctxRef: ExtensionContext | undefined;
let animTimer: ReturnType<typeof setInterval> | null = null;
let lastRendered = "";
let lastEnergyTick = Date.now();
let imageFallbackNotified = false;
let activeImagePet: PetdexPet | undefined;
let activeImageRender: RenderedPet | undefined;
let activeNativeImageRender: NativeRenderedPet | undefined;
let imageRenderRefresh: Promise<void> | undefined;
const nativeImageId = allocateImageId();

const MAX_WIDGET_COLUMNS = 72;
const MIN_WIDGET_COLUMNS = 24;
const WIDGET_MARGIN_COLUMNS = 4;
const STATUS_ROWS = 3;

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

function widgetArtRows(): number {
	const terminalRows = process.stdout.rows || 24;
	const modeRows = state.style === "image" ? (state.size === "large" ? 18 : 12) : state.size === "large" ? 16 : 8;
	return Math.max(4, Math.min(modeRows, terminalRows - STATUS_ROWS - 4));
}

function activeImageBackend(): "native" | "ansi" | "ascii" {
	if (state.style !== "image") return "ascii";
	if (supportsNativeImagePets()) return "native";
	if (NO_COLOR) return "ascii";
	return "ansi";
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
	if (activeImageBackend() === "native") {
		activeNativeImageRender = await prepareNativePetdexPet(pet);
		activeImageRender = undefined;
	} else if (activeImageBackend() === "ansi") {
		activeImageRender = await renderPetdexPetForColumns(pet, state.size, widgetColumns(), widgetArtRows());
		activeNativeImageRender = undefined;
	} else {
		activeImageRender = undefined;
		activeNativeImageRender = undefined;
	}
	state.imagePetSlug = pet.slug;
	imageFallbackNotified = false;
	lastRendered = "";
	return pet;
}

async function ensureImageReady(): Promise<void> {
	if (state.style !== "image" || !state.imagePetSlug) return;
	const backend = activeImageBackend();
	if (backend === "ascii") {
		if (activeImagePet?.slug !== state.imagePetSlug)
			activeImagePet = loadLocalPetdexPet(state.imagePetSlug) ?? undefined;
		return;
	}
	if (
		backend === "native" &&
		activeImagePet?.slug === state.imagePetSlug &&
		activeNativeImageRender?.slug === state.imagePetSlug
	) {
		return;
	}
	if (
		backend === "ansi" &&
		activeImagePet?.slug === state.imagePetSlug &&
		activeImageRender?.slug === state.imagePetSlug &&
		activeImageRender.size === state.size &&
		activeImageRender.maxColumns === widgetColumns() &&
		activeImageRender.maxRows === widgetArtRows()
	) {
		return;
	}
	await activateImagePet(state.imagePetSlug);
}

function refreshImageRender(): void {
	if (imageRenderRefresh || state.style !== "image" || !state.imagePetSlug) return;
	imageRenderRefresh = ensureImageReady()
		.catch(() => {
			activeImageRender = undefined;
			activeNativeImageRender = undefined;
		})
		.finally(() => {
			imageRenderRefresh = undefined;
			lastRendered = "";
			render();
		});
}

function renderAsciiFrame(maxColumns: number, maxRows: number): string[] {
	const m = asciiMon();
	const frameIdx = Math.floor(state.frameIdx / 3);
	const frameOpts = { lively: state.energy > 60, weak: state.energy < 15 };
	let frame =
		state.size === "large"
			? buildLargeFrame(state.asciiPetKey, m, state.mood, frameIdx, frameOpts)
			: buildFrame(m, state.mood, frameIdx, frameOpts);
	if (frame.length > maxRows || frame.some((line) => visibleWidth(line) > maxColumns)) {
		frame = buildFrame(m, state.mood, frameIdx, frameOpts);
	}
	const bodyColor = MOOD_COLOR[state.mood] ?? m.color;
	return frame.map((line) => c(bodyColor, line));
}

function renderImageFrame(maxColumns: number, maxRows: number): string[] | undefined {
	if (!activeImageRender || activeImageRender.slug !== state.imagePetSlug || activeImageRender.size !== state.size) {
		refreshImageRender();
		return undefined;
	}
	if (activeImageRender.maxColumns > maxColumns) {
		refreshImageRender();
		return undefined;
	}
	if (activeImageRender.maxRows > maxRows) {
		refreshImageRender();
		return undefined;
	}
	if (activeImageRender.maxColumns < maxColumns || activeImageRender.maxRows < maxRows) refreshImageRender();
	return getRenderedPetFrame(activeImageRender, state.mood, state.frameIdx, state.lastIntent);
}

function renderNativeImageFrame() {
	if (!activeNativeImageRender || activeNativeImageRender.slug !== state.imagePetSlug) {
		refreshImageRender();
		return undefined;
	}
	return getNativePetdexFrame(activeNativeImageRender, state.mood, state.frameIdx, state.lastIntent);
}

function render(): void {
	if (!ctxRef?.hasUI) return;
	if (!state.visible) {
		ctxRef.ui.setWidget("pokepet", undefined);
		return;
	}

	const backend = activeImageBackend();
	if (state.style === "image" && backend === "ascii" && NO_COLOR && !imageFallbackNotified) {
		imageFallbackNotified = true;
		ctxRef.ui.notify(
			"NO_COLOR is set and native terminal images are unavailable, so Petdex pets are falling back to ASCII.",
			"info",
		);
	}

	if (state.style === "image" && backend !== "native" && activeNativeImageRender) {
		activeNativeImageRender = undefined;
	}
	if (state.style === "image" && backend !== "ansi" && activeImageRender) {
		activeImageRender = undefined;
	}

	const maxColumns = widgetColumns();
	const maxRows = widgetArtRows();
	const m = asciiMon();
	const nativeFrame = backend === "native" ? renderNativeImageFrame() : undefined;
	const imageFrame = backend === "ansi" ? renderImageFrame(maxColumns, maxRows) : undefined;
	const lines = nativeFrame ? [] : imageFrame?.length ? [...imageFrame] : renderAsciiFrame(maxColumns, maxRows);
	const messageColor =
		state.mood === "working" || state.mood === "thinking"
			? 226
			: state.mood === "panic"
				? 203
				: state.mood === "happy"
					? 84
					: 250;
	const nameColor = state.style === "image" && backend !== "ascii" ? 117 : m.color;
	const tag = state.style === "image" && backend !== "ascii" ? "Petdex" : m.tag;
	const status = statusLines(nameColor, tag, messageColor, maxColumns);
	const meter = dim(`${c(203, "\u2665")}${bar(state.energy)} ${Math.round(state.energy)}`);

	if (nativeFrame) {
		const signature = [
			"native",
			state.size,
			nativeFrame.filename,
			state.mood,
			state.message,
			Math.round(state.energy),
			process.stdout.rows || 24,
		].join("\n");
		if (signature === lastRendered) return;
		lastRendered = signature;
		ctxRef.ui.setWidget(
			"pokepet",
			() =>
				buildNativePetWidget({
					frame: nativeFrame,
					imageId: nativeImageId,
					size: state.size,
					statusLines: status,
					meterLine: meter,
					terminalRows: process.stdout.rows || 24,
				}),
			{ placement: "belowEditor" },
		);
		return;
	}

	lines.push(...status);
	lines.push(meter);

	const signature = [`text:${backend}`, ...lines].join("\n");
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
	if (state.mood === "idle" && since > 8_000) {
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
			return setMood("working", { message: INTENT_RUN.review });
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

	pi.registerCommand("pet", {
		description:
			"pet: style ascii|image | list | choose <id> | gallery [query] | install <slug> | large | small | nick <n> | feed | awake [reason] | sleep | stats | hide | show",
		handler: async (args, ctx) => {
			ctxRef = ctx;
			const [cmd = "", ...rest] = args.trim().split(/\s+/).filter(Boolean);
			const value = rest.join(" ").trim();

			try {
				switch (cmd) {
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

					case "large":
					case "big": {
						if (value) {
							try {
								await choosePet(value);
							} catch {
								return ctx.ui.notify(`Unknown pet. Try /pet list or /pet gallery ${value}`, "error");
							}
						}
						state.size = "large";
						state.visible = true;
						if (state.style === "image") await ensureImageReady();
						saveState();
						lastRendered = "";
						render();
						const note =
							state.style === "image"
								? `Large Petdex mode - ${displayName()} (/pet small to shrink)`
								: hasLargeArt(state.asciiPetKey)
									? `Detailed ASCII mode - ${displayName()} the ${asciiMon().name} (/pet small to shrink)`
									: `Detailed ASCII mode on - no large art for ${asciiMon().name} yet.`;
						return ctx.ui.notify(note, "info");
					}

					case "small":
					case "compact":
						state.size = "small";
						if (state.style === "image") await ensureImageReady();
						saveState();
						lastRendered = "";
						render();
						return ctx.ui.notify("Back to compact mode. (/pet large to enlarge)", "info");

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
						const tier = tierOf(state.sessions);
						const met = new Date(state.firstMet).toISOString().slice(0, 10);
						const petLine =
							state.style === "image"
								? `${displayName()} (${state.imagePetSlug || "Petdex"}) - ${tier}`
								: `${displayName()} the ${asciiMon().name} - ${tier}`;
						const lines = [
							petLine,
							`style ${state.style} - met ${met} - ${state.sessions} sessions - energy ${Math.round(state.energy)}/100`,
							`last 24h: ${n("test-pass")} tests pass - ${n("test-fail")} fail - ${n("commit")} commits - ${n("pr")} PRs - ${n("edit")} edits`,
						];
						return ctx.ui.notify(lines.join("\n"), "info");
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
