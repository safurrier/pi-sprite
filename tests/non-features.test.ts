import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const roots = ["extensions", "src"].filter(existsSync);
const forbidden = [
	/electron/i,
	/glimpse/i,
	/tts/i,
	/voice/i,
	/ambient/i,
	/weather/i,
	/\bfeed(?:ing)?\b/i,
	/\bhunger\b/i,
	/\btreats?\b/i,
	/\baccessor(?:y|ies)\b/i,
	/\bbond(?:ing)?\b/i,
	/\bxp\b/i,
	/\bstats dashboard\b/i,
	/\bsse\b/i,
	/\braymarch/i,
];

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (/\.(ts|js|tsx|jsx)$/u.test(entry.name)) yield path;
	}
}

test("runtime code does not reintroduce companion bloat", () => {
	const offenders: string[] = [];
	for (const root of roots) {
		for (const file of walk(root)) {
			const text = readFileSync(file, "utf8");
			for (const pattern of forbidden) {
				if (pattern.test(text)) offenders.push(`${file}: ${pattern}`);
			}
		}
	}
	assert.deepEqual(offenders, []);
});
