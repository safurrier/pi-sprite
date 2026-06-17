#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assertOverlay(text) {
	const required = ["Context Usage", "Estimated usage", "Free space", "tokens"];
	for (const item of required) {
		if (!text.includes(item)) throw new Error(`missing ${item}`);
	}
	if (!/[▢□⬚▣■█░]/u.test(text)) throw new Error("missing grid/cell glyphs");
}
if (process.argv.includes("--self-test")) {
	assertOverlay("Context Usage\n▢ ▢ ▢\nEstimated usage\nFree space: 10 tokens");
	process.exit(0);
}
const file = process.argv[2];
if (!file) {
	console.error("Usage: assert-context-overlay.mjs <capture.txt>");
	process.exit(2);
}
try {
	assertOverlay(readFileSync(file, "utf8"));
} catch (err) {
	console.error(err.message);
	process.exit(1);
}
