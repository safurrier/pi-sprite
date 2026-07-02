#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name, fallback = "") {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function normalizeId(value) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 80);
}

const id = normalizeId(arg("id", "wumpus"));
const name = arg("name", "Wumpus").trim() || id;
const author = arg("author", "").trim();
const personality = arg("personality", "").trim();
const out = arg("out", `./${id}-sprite`);

if (!id) {
	console.error("Missing valid --id");
	process.exit(1);
}

mkdirSync(out, { recursive: true });
const manifest = {
	id,
	name,
	...(author ? { author } : {}),
	description: `A tiny ${name} companion for pi-sprite.`,
	...(personality ? { personality } : {}),
	sprites: {
		idle: "idle.png",
		thinking: "thinking.png",
		working: "working.png",
		success: "success.png",
		error: "error.png",
	},
};
writeFileSync(join(out, "pet.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
	join(out, "README.md"),
	`# ${name} pi-sprite pet\n\nAdd these transparent PNG/WebP files next to \`pet.json\`:\n\n- idle.png\n- thinking.png\n- working.png\n- success.png\n- error.png\n\nImport with:\n\n\`\`\`text\n/pet import ${out}\n/pet choose ${id}\n/pet show\n\`\`\`\n`,
);
console.log(`Created ${out}`);
console.log(`Next: add sprite images, then run /pet import ${out}`);
