import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ensureElectronBinary,
	hasDisplay,
	resetElectronInstallState,
	resolveElectronBinary,
} from "./electron-installer.ts";
import { loadLocalPetdexPet } from "./petdex.ts";
import { getPetPersonality, saveState, state } from "./state.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceDir = join(__dirname, "..");

let server: Server | null = null;
let electronProcess: ChildProcess | null = null;
let sseClients: ServerResponse[] = [];
let serverPort = 0;

/** Electron runtime lifecycle, used to drive the ASCII fallback in index.ts. */
export type ElectronStatus = "ready" | "installing" | "failed" | "unsupported" | "missing";
let installStatus: ElectronStatus = "missing";
let statusReason = "";

type NotifyFn = (msg: string, level: "info" | "error") => void;
let notifyFn: NotifyFn | null = null;
let onReadyFn: (() => void) | null = null;

/** index.ts registers UI hooks so the manager can notify the user and re-render. */
export function setElectronHooks(hooks: { notify?: NotifyFn; onReady?: () => void }): void {
	if (hooks.notify) notifyFn = hooks.notify;
	if (hooks.onReady) onReadyFn = hooks.onReady;
}

export function getElectronAvailability(): { status: ElectronStatus; reason: string } {
	return { status: installStatus, reason: statusReason };
}

/** True when terminal visuals should be used instead of the Electron window. */
export function shouldRenderAsciiFallback(): boolean {
	return installStatus !== "ready";
}

export function isElectronRunning(): boolean {
	return electronProcess !== null && electronProcess.exitCode === null && !electronProcess.killed;
}

function getSerializedState() {
	const pet = loadLocalPetdexPet(state.imagePetSlug);
	const petId = state.imagePetSlug || state.asciiPetKey;
	return {
		slug: state.imagePetSlug,
		displayName: pet?.metadata.displayName || state.imagePetSlug,
		description: pet?.metadata.description || "",
		nick: state.nick,
		mood: state.mood,
		frameIdx: state.frameIdx,
		message: state.message,
		energy: state.energy,
		lastIntent: state.lastIntent,
		personality: getPetPersonality(petId, state.nick),
	};
}

export function broadcastState(): void {
	if (sseClients.length === 0) return;
	const data = JSON.stringify(getSerializedState());
	for (const client of sseClients) {
		try {
			client.write(`data: ${data}\n\n`);
		} catch {
			// ignore write errors on closed connections
		}
	}
}

let lastSpawnAt = 0;
let fastExitCount = 0;
let intentionalStop = false;

function spawnElectron(binaryPath: string): void {
	const mainScript = join(workspaceDir, "extensions", "electron", "main.cjs");
	intentionalStop = false;
	lastSpawnAt = Date.now();
	electronProcess = spawn(binaryPath, [mainScript, `--port=${serverPort}`], {
		detached: true,
		stdio: "ignore",
	});
	electronProcess.unref();
	electronProcess.on("error", (err) => {
		console.error("[pi-pokepet] Failed to launch Electron process:", err.message);
		electronProcess = null;
	});
	electronProcess.on("exit", () => {
		const ranMs = Date.now() - lastSpawnAt;
		electronProcess = null;
		if (intentionalStop) {
			intentionalStop = false;
			return;
		}
		// A window that dies within a few seconds of launch usually means the host
		// can't run it (missing libs like libnss3/libgbm, no GPU, etc.). After two
		// fast crashes, stop relaunching on every render and fall back to ASCII.
		if (ranMs < 3000) {
			fastExitCount += 1;
			if (fastExitCount >= 2 && installStatus === "ready") {
				installStatus = "failed";
				statusReason = "window failed to start (missing system libs or no display?)";
				notifyFn?.(
					"Electron window couldn't start; showing the ASCII pet instead. Details in /pet status.",
					"error",
				);
				onReadyFn?.();
			}
		} else {
			fastExitCount = 0;
		}
	});
}

/**
 * Launch the Electron companion. Safe to call on every render: it is idempotent,
 * never spams logs, self-heals a missing runtime once per session, and silently
 * defers to the ASCII fallback when Electron cannot run (headless/offline).
 */
export function launchElectron(): void {
	if (serverPort === 0) return;
	if (isElectronRunning()) return;

	// Headless environments (SSH / WSL / no display) cannot show a window.
	if (!hasDisplay()) {
		if (installStatus !== "unsupported") {
			installStatus = "unsupported";
			statusReason = "no display detected (headless/SSH/WSL)";
			notifyFn?.("No display detected; showing the ASCII pet instead of the Electron window.", "info");
			onReadyFn?.();
		}
		return;
	}

	const binary = resolveElectronBinary(workspaceDir);
	if (binary) {
		if (installStatus !== "ready") {
			installStatus = "ready";
			statusReason = "";
			onReadyFn?.();
		}
		spawnElectron(binary);
		return;
	}

	// Binary missing. Self-heal exactly once; ASCII fallback covers the wait.
	if (installStatus === "installing" || installStatus === "failed") return;

	installStatus = "installing";
	statusReason = "downloading Electron runtime";
	notifyFn?.("Setting up the Electron companion (one-time download)\u2026 showing the ASCII pet meanwhile.", "info");
	onReadyFn?.();

	ensureElectronBinary({
		packageDir: workspaceDir,
		log: (msg) => console.log(`[pi-pokepet] ${msg}`),
	})
		.then((ok) => {
			if (ok) {
				installStatus = "ready";
				statusReason = "";
				notifyFn?.("Electron companion is ready! \u2728", "info");
				onReadyFn?.();
				launchElectron();
			} else {
				installStatus = "failed";
				statusReason = "setup failed";
				notifyFn?.("Electron setup couldn't finish; staying in ASCII mode. Retry anytime with /pet setup.", "error");
				onReadyFn?.();
			}
		})
		.catch((err) => {
			installStatus = "failed";
			statusReason = err instanceof Error ? err.message : "setup failed";
			onReadyFn?.();
		});
}

/** Force a fresh Electron setup attempt (used by `/pet setup`). */
export function retryElectronSetup(): void {
	resetElectronInstallState();
	installStatus = "missing";
	statusReason = "";
	fastExitCount = 0;
	launchElectron();
}

export function startElectronManager(): void {
	if (server) return;

	server = createServer((req, res) => {
		const url = new URL(req.url ?? "", `http://localhost`);

		// CORS Headers
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		if (url.pathname === "/state") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(getSerializedState()));
			return;
		}

		if (url.pathname === "/events") {
			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				connection: "keep-alive",
			});
			res.write("\n");
			sseClients.push(res);

			// Immediately sync with client
			res.write(`data: ${JSON.stringify(getSerializedState())}\n\n`);

			req.on("close", () => {
				sseClients = sseClients.filter((c) => c !== res);
			});
			return;
		}

		if (url.pathname === "/spritesheet") {
			const pet = loadLocalPetdexPet(state.imagePetSlug);
			if (pet && existsSync(pet.spritesheetPath)) {
				const ext = pet.spritesheetPath.endsWith(".png") ? "png" : "webp";
				res.writeHead(200, { "Content-Type": `image/${ext}` });
				res.end(readFileSync(pet.spritesheetPath));
			} else {
				res.writeHead(404);
				res.end("Not Found");
			}
			return;
		}

		if (url.pathname === "/action/feed") {
			state.energy = Math.min(100, state.energy + 30);
			state.mood = "happy";
			state.message = "*nom nom* thank you!";
			state.lastActivity = Date.now();
			saveState();
			broadcastState();
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, energy: state.energy }));
			return;
		}

		res.writeHead(404);
		res.end("Not Found");
	});

	// Listen on dynamic port allocated by the OS
	server.listen(0, "127.0.0.1", () => {
		const addr = server?.address();
		if (addr && typeof addr === "object") {
			serverPort = addr.port;
			console.log(`[pi-pokepet] HTTP/SSE Server running on port ${serverPort}`);
			if (state.style === "image") {
				launchElectron();
			}
		}
	});
}

export function stopElectron(): void {
	if (electronProcess) {
		intentionalStop = true;
		try {
			electronProcess.kill();
		} catch {
			// ignore kill failures
		}
		electronProcess = null;
	}
}

export function stopElectronManager(): void {
	stopElectron();
	if (server) {
		server.close();
		server = null;
	}
	for (const client of sseClients) {
		client.end();
	}
	sseClients = [];
}

export function getManagerStatus(): { serverPort: number; electronPid: number | null } {
	return {
		serverPort,
		electronPid: electronProcess ? (electronProcess.pid ?? null) : null,
	};
}
