import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
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
const mainScript = join(workspaceDir, "extensions", "electron", "main.cjs");

// Cross-session lockfile recording the live companion's PID. Lets a new session
// reap an orphaned window left behind when pi exited uncleanly (terminal
// closed / SIGKILL / crash) before `session_shutdown` could kill it.
const PID_FILE = join(homedir(), ".pi", "agent", "pokepet-electron.pid");

function readPidFile(): number | null {
	try {
		if (!existsSync(PID_FILE)) return null;
		const pid = Number.parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
		return Number.isInteger(pid) && pid > 0 ? pid : null;
	} catch {
		return null;
	}
}

function writePidFile(pid: number): void {
	try {
		writeFileSync(PID_FILE, String(pid));
	} catch {
		/* best-effort */
	}
}

function clearPidFile(): void {
	try {
		if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
	} catch {
		/* best-effort */
	}
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

/**
 * Verify a PID is actually our Electron companion before killing it, so a PID
 * recycled by an unrelated process is never reaped. Matches the full path of
 * our `main.cjs` in the process command line.
 */
function isPokepetCompanion(pid: number): boolean {
	try {
		if (process.platform === "linux") {
			const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
			return cmdline.includes(mainScript);
		}
		const out = execSync(`ps -p ${pid} -o command=`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
		return out.includes(mainScript);
	} catch {
		return false;
	}
}

/**
 * Kill a leftover companion window from a previously-crashed session so only one
 * exists. Called once at manager startup (not on every relaunch) so two
 * genuinely concurrent pi sessions don't fight over a single window.
 */
function reapStaleCompanion(): void {
	const pid = readPidFile();
	if (pid === null) return;
	if (electronProcess && electronProcess.pid === pid) return;
	if (!isProcessAlive(pid)) {
		clearPidFile();
		return;
	}
	// Only kill a process we can positively verify is our companion, so a recycled
	// PID is never reaped. On platforms where the command line can't be inspected
	// (e.g. Windows), leave a live process — and its pidfile — untouched.
	if (isPokepetCompanion(pid)) {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			/* already gone */
		}
		clearPidFile();
	}
}

/**
 * Find live companion windows bound to the current server port. Lets us adopt an
 * already-running window instead of spawning a duplicate — covers re-entrant
 * renders and the Linux case where Electron relaunches itself (the spawned
 * handle exits while the real window keeps running, re-parented to pi).
 */
function findCompanionPids(): number[] {
	if (serverPort === 0) return [];
	const portArg = `--port=${serverPort}`;
	const pids: number[] = [];
	try {
		if (process.platform === "linux") {
			for (const entry of readdirSync("/proc")) {
				if (!/^\d+$/.test(entry)) continue;
				const pid = Number.parseInt(entry, 10);
				if (pid === process.pid) continue;
				try {
					const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
					if (cmd.includes(mainScript) && cmd.includes(portArg) && !cmd.includes("--type=")) pids.push(pid);
				} catch {
					/* process vanished mid-scan */
				}
			}
		} else {
			const out = execSync("ps -ax -o pid=,command=", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
			for (const line of out.split("\n")) {
				const m = line.trim().match(/^(\d+)\s+(.*)$/);
				if (!m) continue;
				const pid = Number.parseInt(m[1]!, 10);
				if (pid === process.pid) continue;
				if (m[2]!.includes(mainScript) && m[2]!.includes(portArg) && !m[2]!.includes("--type=")) pids.push(pid);
			}
		}
	} catch {
		/* best-effort */
	}
	return pids;
}

let server: Server | null = null;
let electronProcess: ChildProcess | null = null;
/** PID of the live window we believe is running (spawned or adopted). */
let companionPid: number | null = null;
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
	if (electronProcess !== null && electronProcess.exitCode === null && !electronProcess.killed) return true;
	if (companionPid !== null && isProcessAlive(companionPid)) return true;
	return false;
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
	intentionalStop = false;
	lastSpawnAt = Date.now();
	// On Linux, force the X11/XWayland backend at the process level. Native
	// Wayland has no protocol for a client to stay always-on-top or self-position,
	// so the floating pet widget cannot work there. Passing the switch as a real
	// CLI arg (Chromium parses it at startup) and stripping WAYLAND_DISPLAY from
	// the child env is far more reliable than app.commandLine.appendSwitch() inside
	// main.cjs, which runs after Ozone has already chosen a platform.
	// Only force X11 when an X server is actually reachable (DISPLAY set). On a
	// pure-Wayland session with no XWayland, forcing x11 + dropping WAYLAND_DISPLAY
	// would leave Electron with no platform at all, so we keep the native backend
	// there (the window still shows, just without reliable always-on-top).
	const forceX11 = process.platform === "linux" && Boolean(process.env.DISPLAY);
	const args = forceX11
		? ["--ozone-platform=x11", mainScript, `--port=${serverPort}`]
		: [mainScript, `--port=${serverPort}`];
	const env: NodeJS.ProcessEnv = { ...process.env };
	if (forceX11) {
		env.ELECTRON_OZONE_PLATFORM_HINT = "x11";
		delete env.WAYLAND_DISPLAY;
	}
	electronProcess = spawn(binaryPath, args, {
		detached: true,
		stdio: "ignore",
		env,
	});
	electronProcess.unref();
	companionPid = electronProcess.pid ?? null;
	if (electronProcess.pid) writePidFile(electronProcess.pid);
	electronProcess.on("error", (err) => {
		console.error("[pi-pokepet] Failed to launch Electron process:", err.message);
		electronProcess = null;
	});
	electronProcess.on("exit", () => {
		const ranMs = Date.now() - lastSpawnAt;
		electronProcess = null;
		if (intentionalStop) {
			intentionalStop = false;
			companionPid = null;
			clearPidFile();
			return;
		}
		// On Linux, Electron may relaunch itself once at startup: the handle we
		// spawned exits while the real window keeps running (re-parented to pi).
		// Adopt that survivor instead of treating the companion as dead and
		// respawning a duplicate window.
		const survivors = findCompanionPids();
		if (survivors.length > 0) {
			companionPid = survivors[0]!;
			writePidFile(companionPid);
			return;
		}
		companionPid = null;
		clearPidFile();
		// A window that dies within a few seconds of launch usually means the host
		// can't run it (missing libs like libnss3/libgbm, no GPU, etc.). After two
		// fast crashes, stop relaunching on every render and fall back to ASCII.
		if (ranMs < 3000) {
			fastExitCount += 1;
			if (fastExitCount >= 2 && installStatus === "ready") {
				installStatus = "failed";
				statusReason = "window failed to start (missing system libs or no display?)";
				notifyFn?.("Electron window couldn't start; showing the ASCII pet instead. Details in /pet status.", "error");
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
let launching = false;

export function launchElectron(): void {
	if (serverPort === 0) return;
	if (isElectronRunning()) return;
	// Re-entrancy guard: onReadyFn() below renders, which calls launchElectron()
	// again synchronously. Without this guard that re-entry spawned a 2nd window.
	if (launching) return;
	launching = true;
	try {
		launchElectronInner();
	} finally {
		launching = false;
	}
}

function launchElectronInner(): void {
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

	// A companion bound to this server is already up (an Electron relaunch
	// re-parented it, or a prior spawn whose handle we lost). Adopt it instead
	// of spawning a duplicate window.
	const existing = findCompanionPids();
	if (existing.length > 0) {
		companionPid = existing[0]!;
		writePidFile(companionPid);
		if (installStatus !== "ready") {
			installStatus = "ready";
			statusReason = "";
			onReadyFn?.();
		}
		return;
	}

	const binary = resolveElectronBinary(workspaceDir);
	if (binary) {
		// Spawn BEFORE notifying: onReadyFn() renders and re-enters launchElectron();
		// spawning first makes isElectronRunning() already true there, so no duplicate.
		spawnElectron(binary);
		if (installStatus !== "ready") {
			installStatus = "ready";
			statusReason = "";
			onReadyFn?.();
		}
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

	// Reap any companion window orphaned by a previous unclean exit before we
	// spawn a fresh one, so a single terminal never shows two pets.
	reapStaleCompanion();

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
	intentionalStop = true;
	if (electronProcess) {
		try {
			electronProcess.kill();
		} catch {
			// ignore kill failures
		}
		electronProcess = null;
	}
	// Kill the actual window process(es) too — the spawned handle may have exited
	// after an Electron relaunch while the real window kept running.
	const targets = new Set<number>(findCompanionPids());
	if (companionPid !== null) targets.add(companionPid);
	for (const pid of targets) {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			/* already gone */
		}
	}
	companionPid = null;
	clearPidFile();
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
		electronPid: electronProcess?.pid ?? companionPid ?? null,
	};
}
