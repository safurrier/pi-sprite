#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

function run(cmd, args, options = {}) {
	const result = spawnSync(cmd, args, { stdio: "inherit", ...options });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

async function writeRenderFixture() {
	const root = join("artifacts", "e2e", "sprite-home");
	const dir = join(root, "pets", "e2e-render-pet");
	rmSync(root, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(root, "state.json"),
		`${JSON.stringify({ selectedPetId: "e2e-render-pet", visible: true }, null, 2)}\n`,
	);
	writeFileSync(
		join(dir, "pet.json"),
		`${JSON.stringify({ id: "e2e-render-pet", name: "E2E Render Pet", sprites: { idle: "idle.png" } }, null, 2)}\n`,
	);
	await sharp({
		create: {
			width: 10,
			height: 10,
			channels: 4,
			background: { r: 88, g: 166, b: 255, alpha: 1 },
		},
	})
		.composite([
			{
				input: Buffer.from(
					`<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#ffcc66"/><circle cx="4" cy="4" r="1" fill="#111"/><circle cx="7" cy="4" r="1" fill="#111"/><path d="M3 7 Q5 8 7 7" stroke="#111" fill="none"/></svg>`,
				),
			},
		])
		.png()
		.toFile(join(dir, "idle.png"));
}

async function writePetdexFixture() {
	const root = join(process.cwd(), "artifacts", "e2e", "petdex-fixture");
	rmSync(root, { recursive: true, force: true });
	mkdirSync(root, { recursive: true });
	writeFileSync(
		join(root, "pet.json"),
		`${JSON.stringify({ id: "e2e-petdex-pet", displayName: "E2E Petdex Pet", spritesheetPath: "spritesheet.webp" }, null, 2)}\n`,
	);
	await sharp({
		create: { width: 32, height: 36, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
	})
		.composite(
			Array.from({ length: 6 }, (_, col) => ({
				input: Buffer.from(
					`<svg width="4" height="4"><rect width="4" height="4" fill="rgb(${50 + col * 25},180,255)"/></svg>`,
				),
				left: col * 4,
				top: 0,
			})),
		)
		.webp()
		.toFile(join(root, "spritesheet.webp"));
	return root;
}

async function withFixtureServer(root, fn) {
	const child = spawn("node", ["tests/e2e/petdex-fixture-server.mjs", root], {
		stdio: ["ignore", "pipe", "inherit"],
		encoding: "utf8",
	});
	const manifestUrl = await new Promise((resolve, reject) => {
		let output = "";
		const timer = setTimeout(() => reject(new Error("fixture server did not start")), 5000);
		child.stdout.on("data", (chunk) => {
			output += chunk.toString();
			const line = output.split(/\r?\n/u).find((value) => value.startsWith("http://"));
			if (line) {
				clearTimeout(timer);
				resolve(line.trim());
			}
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code !== null && code !== 0) reject(new Error(`fixture server exited with ${code}`));
		});
	});
	process.env.PI_SPRITE_PETDEX_MANIFEST_URL = manifestUrl;
	try {
		await fn();
	} finally {
		delete process.env.PI_SPRITE_PETDEX_MANIFEST_URL;
		await new Promise((resolve) => {
			child.once("exit", resolve);
			child.kill("SIGTERM");
			setTimeout(resolve, 1000);
		});
	}
}

mkdirSync("artifacts/e2e", { recursive: true });
const checks = [
	["node", ["tests/e2e/assert-capture.mjs", "--self-test"]],
	["node", ["tests/e2e/assert-context-overlay.mjs", "--self-test"]],
];
for (const [cmd, args] of checks) run(cmd, args);

if (process.env.PI_SPRITE_E2E_TUI === "1") {
	await writeRenderFixture();
	const petdexRoot = await writePetdexFixture();
	await withFixtureServer(petdexRoot, async () => {
		for (const scenario of ["pet", "render", "context", "petdex"]) run("bash", ["tests/e2e/tmux-smoke.sh", scenario]);
	});
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/pet.txt", "--contains", "pi-sprite"]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/render.txt", "--contains", "E2E Render Pet"]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/render.txt", "--contains", "▀"]);
	run("node", ["tests/e2e/assert-context-overlay.mjs", "artifacts/e2e/context.txt"]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/petdex.txt", "--contains", "E2E Petdex Pet"]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/petdex.txt", "--contains", "▀"]);
} else {
	writeFileSync("artifacts/e2e/tui-skipped.txt", "Set PI_SPRITE_E2E_TUI=1 to run tmux-backed Pi TUI smoke tests.\n");
}

if (process.env.PI_SPRITE_E2E_MODEL === "1") {
	for (const scenario of ["btw", "recap"]) run("bash", ["tests/e2e/tmux-smoke.sh", scenario]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/btw.txt", "--contains", "BTW side thread"]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/recap.txt", "--contains", "Session Recap"]);
}

if (process.env.PI_SPRITE_E2E_NETWORK === "1") {
	run("pi", ["-e", ".", "-p", "/pet search cat", "--no-session"]);
}

writeFileSync("artifacts/e2e/smoke.txt", "E2E smoke helpers passed\n");
console.log("E2E smoke helpers passed");
