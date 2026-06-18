#!/usr/bin/env node
import { spawnSync } from "node:child_process";
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

mkdirSync("artifacts/e2e", { recursive: true });
const checks = [
	["node", ["tests/e2e/assert-capture.mjs", "--self-test"]],
	["node", ["tests/e2e/assert-context-overlay.mjs", "--self-test"]],
];
for (const [cmd, args] of checks) run(cmd, args);

if (process.env.PI_SPRITE_E2E_TUI === "1") {
	await writeRenderFixture();
	for (const scenario of ["pet", "render"]) run("bash", ["tests/e2e/tmux-smoke.sh", scenario]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/pet.txt", "--contains", "pi-sprite"]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/render.txt", "--contains", "E2E Render Pet"]);
	run("node", ["tests/e2e/assert-capture.mjs", "artifacts/e2e/render.txt", "--contains", "▀"]);
} else {
	writeFileSync("artifacts/e2e/tui-skipped.txt", "Set PI_SPRITE_E2E_TUI=1 to run tmux-backed Pi TUI smoke tests.\n");
}

if (process.env.PI_SPRITE_E2E_CONTEXT === "1") {
	run("bash", ["tests/e2e/tmux-smoke.sh", "context"]);
	run("node", ["tests/e2e/assert-context-overlay.mjs", "artifacts/e2e/context.txt"]);
}

if (process.env.PI_SPRITE_E2E_MODEL === "1") {
	writeFileSync(
		"artifacts/e2e/model-skipped.txt",
		"Model-backed /recap and /btw E2E is not automated yet; this gate is reserved for the next pass.\n",
	);
}

if (process.env.PI_SPRITE_E2E_NETWORK === "1") {
	run("pi", ["-e", ".", "-p", "/pet search cat", "--no-session"]);
}

writeFileSync("artifacts/e2e/smoke.txt", "E2E smoke helpers passed\n");
console.log("E2E smoke helpers passed");
