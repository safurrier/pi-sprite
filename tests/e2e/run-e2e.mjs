#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

mkdirSync("artifacts/e2e", { recursive: true });
const checks = [
	["node", ["tests/e2e/assert-capture.mjs", "--self-test"]],
	["node", ["tests/e2e/assert-context-overlay.mjs", "--self-test"]],
];
for (const [cmd, args] of checks) {
	const result = spawnSync(cmd, args, { stdio: "inherit" });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.PI_SPRITE_E2E_TUI === "1") {
	for (const scenario of ["pet", "context"]) {
		const result = spawnSync("bash", ["tests/e2e/tmux-smoke.sh", scenario], { stdio: "inherit" });
		if (result.status !== 0) process.exit(result.status ?? 1);
	}
	if (!existsSync("artifacts/e2e/pet.txt")) throw new Error("missing pet tmux capture");
	const petAssert = spawnSync(
		"node",
		["tests/e2e/assert-capture.mjs", "artifacts/e2e/pet.txt", "--contains", "pi-sprite"],
		{
			stdio: "inherit",
		},
	);
	if (petAssert.status !== 0) process.exit(petAssert.status ?? 1);
} else {
	writeFileSync("artifacts/e2e/tui-skipped.txt", "Set PI_SPRITE_E2E_TUI=1 to run tmux-backed Pi TUI smoke tests.\n");
}

writeFileSync("artifacts/e2e/smoke.txt", "E2E smoke helpers passed\n");
console.log("E2E smoke helpers passed");
