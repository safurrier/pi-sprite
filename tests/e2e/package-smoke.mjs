#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
mkdirSync(join("artifacts", "e2e"), { recursive: true });
const artifact = (name, content) => writeFileSync(join("artifacts", "e2e", name), content);

function run(label, command, options = {}) {
	const env = { ...process.env };
	env.PI_OFFLINE = "1";
	const result = spawnSync(command[0], command.slice(1), {
		encoding: "utf8",
		env,
		...options,
	});
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	artifact(`${label}.txt`, output);
	return { status: result.status ?? 1, output };
}

function classify(output) {
	if (/safurrier\/pi-sprite|pi-sprite|src\/sprite|src\/context|src\/btw|src\/recap/u.test(output)) return "pi-sprite";
	if (/stale after session replacement|pi-codex-pr-review-monitor/u.test(output)) return "unrelated-extension";
	return "unknown";
}

if (args.has("--isolated")) {
	const result = run("package-smoke-isolated", ["pi", "--no-extensions", "-e", ".", "-p", "/pet show", "--no-session"]);
	if (result.status !== 0) {
		console.error(result.output);
		process.exit(result.status);
	}
	console.log("isolated pi-sprite smoke passed");
}

if (args.has("--full-config")) {
	const result = run("package-smoke-full-config", ["pi", "-p", "/pet show", "--no-session"]);
	if (result.status !== 0) {
		const owner = classify(result.output);
		console.error(`full-config smoke failed; classified as ${owner}`);
		console.error(result.output);
		process.exit(owner === "unrelated-extension" ? 0 : result.status);
	}
	console.log("full-config pi smoke passed");
}

if (!args.has("--isolated") && !args.has("--full-config")) {
	console.error("Usage: package-smoke.mjs --isolated [--full-config]");
	process.exit(2);
}
