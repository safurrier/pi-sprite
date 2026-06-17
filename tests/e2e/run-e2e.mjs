#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("artifacts/e2e", { recursive: true });
const checks = [
	["node", ["tests/e2e/assert-capture.mjs", "--self-test"]],
	["node", ["tests/e2e/assert-context-overlay.mjs", "--self-test"]],
];
for (const [cmd, args] of checks) {
	const result = spawnSync(cmd, args, { stdio: "inherit" });
	if (result.status !== 0) process.exit(result.status ?? 1);
}
writeFileSync("artifacts/e2e/smoke.txt", "E2E smoke helpers passed\n");
console.log("E2E smoke helpers passed");
