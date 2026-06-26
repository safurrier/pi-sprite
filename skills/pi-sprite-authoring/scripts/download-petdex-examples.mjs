#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

function arg(name, fallback = "") {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const manifestUrl = arg(
	"manifest",
	process.env.PI_SPRITE_PETDEX_MANIFEST_URL || "https://petdex.crafter.run/api/manifest",
);
const out = arg("out", "examples/petdex-downloads");
const query = arg("query", "").toLowerCase();
const limit = Math.max(1, Math.min(50, Number.parseInt(arg("limit", "12"), 10) || 12));
function safeSlug(value) {
	const slug = String(value ?? "")
		.trim()
		.toLowerCase();
	return /^[a-z0-9][a-z0-9-]{0,79}$/u.test(slug) ? slug : "";
}

const slugs = arg("slugs", "")
	.split(",")
	.map((slug) => safeSlug(slug))
	.filter(Boolean);

async function download(url) {
	const res = await fetch(url, { headers: { accept: "*/*", "user-agent": "pi-sprite-authoring" } });
	if (!res.ok) throw new Error(`download failed for ${url} (${res.status})`);
	return Buffer.from(await res.arrayBuffer());
}

function spriteNameFromUrl(url) {
	const ext = extname(new URL(url).pathname).toLowerCase();
	return ext === ".png" ? "spritesheet.png" : "spritesheet.webp";
}

const manifestRes = await fetch(manifestUrl, {
	headers: { accept: "application/json", "user-agent": "pi-sprite-authoring" },
});
if (!manifestRes.ok) throw new Error(`manifest fetch failed (${manifestRes.status})`);
const manifest = await manifestRes.json();
const pets = (Array.isArray(manifest.pets) ? manifest.pets : [])
	.map((pet) => ({ ...pet, safeSlug: safeSlug(pet.slug) }))
	.filter((pet) => pet.safeSlug && pet.displayName && pet.petJsonUrl && pet.spritesheetUrl)
	.filter((pet) => !slugs.length || slugs.includes(pet.safeSlug))
	.filter((pet) => !query || `${pet.safeSlug} ${pet.displayName} ${pet.kind ?? ""}`.toLowerCase().includes(query))
	.slice(0, limit);

mkdirSync(out, { recursive: true });
const provenance = [
	"# Petdex example downloads",
	"",
	`Downloaded from: ${manifestUrl}`,
	`Downloaded at: ${new Date().toISOString()}`,
	"",
	"These files are local reference material. Do not commit or redistribute third-party sprite assets unless their licenses are verified.",
	"",
	"## Assets",
];

for (const pet of pets) {
	const dir = join(out, pet.safeSlug);
	mkdirSync(dir, { recursive: true });
	const [petJsonBytes, spriteBytes] = await Promise.all([download(pet.petJsonUrl), download(pet.spritesheetUrl)]);
	const spriteName = spriteNameFromUrl(pet.spritesheetUrl);
	writeFileSync(join(dir, "pet.json"), petJsonBytes);
	writeFileSync(join(dir, spriteName), spriteBytes);
	writeFileSync(
		join(dir, "PROVENANCE.md"),
		`# ${pet.displayName}\n\n- slug: ${pet.safeSlug}\n- kind: ${pet.kind ?? "unknown"}\n- submittedBy: ${pet.submittedBy ?? "unknown"}\n- petJsonUrl: ${pet.petJsonUrl}\n- spritesheetUrl: ${pet.spritesheetUrl}\n\nLicense was not verified by this script. Use as temporary reference only unless separately cleared.\n`,
	);
	provenance.push(`- ${pet.safeSlug} — ${pet.displayName} (${pet.kind ?? "unknown"})`);
}

writeFileSync(join(out, "THIRD_PARTY_ASSETS.md"), `${provenance.join("\n")}\n`);
console.log(`Downloaded ${pets.length} Petdex example(s) into ${out}`);
