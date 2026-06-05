import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalPetdexPet } from "./petdex.ts";
import { getPetPersonality, saveState, state } from "./state.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceDir = join(__dirname, "..");

let server: Server | null = null;
let electronProcess: ChildProcess | null = null;
let sseClients: ServerResponse[] = [];
let serverPort = 0;

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

export function launchElectron(): void {
	if (serverPort === 0) return;
	if (isElectronRunning()) return;

	// Use binary from local node_modules
	let electronPath = join(workspaceDir, "node_modules", ".bin", "electron");
	if (process.platform === "win32") {
		electronPath += ".cmd";
	}

	const mainScript = join(workspaceDir, "extensions", "electron", "main.cjs");

	if (!existsSync(electronPath)) {
		console.error(`[pi-pokepet] Electron binary not found at ${electronPath}`);
		return;
	}

	electronProcess = spawn(electronPath, [mainScript, `--port=${serverPort}`], {
		detached: true,
		stdio: "ignore",
	});

	electronProcess.unref();

	electronProcess.on("error", (err) => {
		console.error(`[pi-pokepet] Failed to launch Electron process:`, err);
		electronProcess = null;
	});

	electronProcess.on("exit", () => {
		electronProcess = null;
	});
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
