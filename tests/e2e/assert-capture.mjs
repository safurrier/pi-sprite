#!/usr/bin/env node
import { readFileSync } from "node:fs";

const ESC = String.fromCharCode(27);
const CSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");
const OSC_PATTERN = new RegExp(`${ESC}\\][^\\u0007]*(?:\\u0007|${ESC}\\\\)`, "g");
const stripAnsi = (s) => s.replace(CSI_PATTERN, "").replace(OSC_PATTERN, "");

if (process.argv.includes("--self-test")) {
	const text = stripAnsi(`${ESC}[31mhello${ESC}[0m sprite`);
	if (!text.includes("hello sprite")) process.exit(1);
	process.exit(0);
}

const [file] = process.argv.slice(2);
const containsIndex = process.argv.indexOf("--contains");
const notContainsIndex = process.argv.indexOf("--not-contains");
if (
	!file ||
	(containsIndex === -1 && notContainsIndex === -1) ||
	(containsIndex !== -1 && !process.argv[containsIndex + 1]) ||
	(notContainsIndex !== -1 && !process.argv[notContainsIndex + 1])
) {
	console.error("Usage: assert-capture.mjs <file> --contains <text> [--not-contains <text>]");
	process.exit(2);
}
const content = stripAnsi(readFileSync(file, "utf8"));
if (containsIndex !== -1) {
	const expected = process.argv[containsIndex + 1];
	if (!content.includes(expected)) {
		console.error(`Expected ${file} to contain ${JSON.stringify(expected)}`);
		process.exit(1);
	}
}
if (notContainsIndex !== -1) {
	const forbidden = process.argv[notContainsIndex + 1];
	if (content.includes(forbidden)) {
		console.error(`Expected ${file} not to contain ${JSON.stringify(forbidden)}`);
		process.exit(1);
	}
}
